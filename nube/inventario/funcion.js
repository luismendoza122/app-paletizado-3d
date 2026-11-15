// Función "inventario" de Supabase (armada desde app-conteo-estibas/inventario-nube con npm run empaquetar).
// NO editar a mano: se genera. La función en la nube carga este archivo por su commit fijo.
// fnb/index.ts
import postgres from "npm:postgres@3.4.5";

// fnb/nucleo/rutas.js
import { z as z3 } from "npm:zod@3.25.76";

// fnb/nucleo/inventario.js
import { z } from "npm:zod@3.25.76";

// fnb/nucleo/util.js
var ErrorNegocio = class extends Error {
  constructor(mensaje, status = 400, detalle) {
    super(mensaje);
    this.status = status;
    this.detalle = detalle;
  }
};
function validar(esquema, datos) {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join(".") || "dato"}: ${i.message}`);
    throw new ErrorNegocio("Datos inv\xE1lidos", 400, detalle);
  }
  return r.data;
}
var hoy = () => (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
var ahora = () => (/* @__PURE__ */ new Date()).toLocaleString("sv-SE", { timeZone: "America/Bogota" });
function nuevoToken() {
  const b = new Uint8Array(9);
  globalThis.crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
var esRepetido = (e) => /UNIQUE|duplicate key|23505/i.test(`${e?.code || ""} ${e?.message || ""}`);

// fnb/nucleo/plantilla.js
function modulosPorNumero(final) {
  const lista = [];
  for (let i = 1; i <= final; i++) if (i % 3 !== 0) lista.push(String(i).padStart(3, "0"));
  return lista;
}
function modulosDePasillo(pasillo) {
  if (pasillo.modulos_lista && pasillo.modulos_lista.trim()) {
    return [...new Set(pasillo.modulos_lista.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean))];
  }
  return modulosPorNumero(pasillo.modulo_final || 104);
}
function evaluarCasilla(texto) {
  const t = String(texto ?? "").trim();
  if (t === "") return null;
  if (!/^\d{1,4}(\s*\+\s*\d{1,4}){0,20}$/.test(t)) {
    throw new Error(`"${t}" no es v\xE1lido: escribe un n\xFAmero o una suma como 4+1`);
  }
  return t.split("+").reduce((a, n2) => a + Number(n2), 0);
}

// fnb/nucleo/inventario.js
var textoONulo = (t) => t == null || !String(t).trim() ? null : String(t).trim();
var id = z.coerce.number().int().positive();
async function colores(db) {
  return db.prepare("SELECT codigo, nombre, hex, unidad, general FROM colores WHERE activo = 1 ORDER BY orden").all();
}
async function coloresDeSeccion(db, seccionId, todos = null) {
  todos = todos || await colores(db);
  const s = await db.prepare("SELECT colores FROM secciones WHERE id = ?").get(seccionId);
  if (s && s.colores) {
    const lista = s.colores.split(",").map((c) => c.trim()).filter(Boolean);
    const elegidos = lista.map((c) => todos.find((x) => x.codigo === c)).filter(Boolean);
    if (elegidos.length) return elegidos;
  }
  return todos.filter((c) => c.general);
}
function sumarPorUnidad(totales, cols) {
  const sumar = (u) => cols.filter((c) => c.unidad === u).reduce((a, c) => a + (totales[c.codigo] || 0), 0);
  return { total: sumar("estiba"), canastillas: sumar("canastilla") };
}
async function obtenerPasillo(db, pasilloId) {
  const p = await db.prepare(
    `SELECT p.*, s.codigo AS seccion_codigo, s.nombre AS seccion
         FROM pasillos p JOIN secciones s ON s.id = p.seccion_id WHERE p.id = ?`
  ).get(pasilloId);
  if (!p) throw new ErrorNegocio("Pasillo no encontrado", 404);
  return p;
}
async function configuracion(db) {
  const secciones = await db.prepare("SELECT * FROM secciones ORDER BY orden").all();
  const pasillos = (await db.prepare("SELECT p.*, s.nombre AS seccion FROM pasillos p JOIN secciones s ON s.id = p.seccion_id ORDER BY s.orden, p.orden, p.codigo").all()).map((p) => {
    const modulos = modulosDePasillo(p);
    return { ...p, total_modulos: modulos.length, primer_modulo: modulos[0], ultimo_modulo: modulos.at(-1) };
  });
  const todos = await colores(db);
  const lista = [];
  for (const s of secciones) {
    lista.push({ ...s, conteos: (await coloresDeSeccion(db, s.id, todos)).map((c) => c.codigo), pasillos: pasillos.filter((p) => p.seccion_id === s.id) });
  }
  return {
    secciones: lista,
    colores: todos,
    items: await db.prepare("SELECT codigo, nombre, hex, unidad, general, activo, orden FROM colores ORDER BY orden").all()
  };
}
var aCodigo = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "item";
var esquemaItem = z.object({
  nombre: z.string().trim().min(2).max(40),
  hex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "color en formato #RRGGBB"),
  unidad: z.enum(["estiba", "canastilla"]).default("estiba"),
  general: z.coerce.number().int().min(0).max(1).default(0),
  secciones: z.array(id).default([])
});
async function crearItem(db, datos) {
  const d = validar(esquemaItem, datos);
  const existentes = await db.prepare("SELECT codigo, nombre FROM colores").all();
  if (existentes.some((c) => c.nombre.toLowerCase() === d.nombre.toLowerCase())) throw new ErrorNegocio(`Ya existe "${d.nombre}"`, 409);
  const base = aCodigo(d.nombre);
  let codigo = base;
  for (let i = 2; existentes.some((c) => c.codigo === codigo); i++) codigo = `${base.slice(0, 17)}-${i}`;
  return db.transaction(async () => {
    const orden = (await db.prepare("SELECT COALESCE(MAX(orden),0) + 1 AS n FROM colores").get()).n;
    await db.prepare("INSERT INTO colores (codigo, nombre, hex, unidad, general, orden) VALUES (?, ?, ?, ?, ?, ?)").run(codigo, d.nombre, d.hex.toLowerCase(), d.unidad, d.general, orden);
    for (const sid of d.secciones) {
      if (!await db.prepare("SELECT 1 AS x FROM secciones WHERE id = ?").get(sid)) throw new ErrorNegocio("Secci\xF3n no encontrada", 404);
      const actuales = (await coloresDeSeccion(db, sid)).map((c) => c.codigo).filter((c) => c !== codigo);
      await db.prepare("UPDATE secciones SET colores = ? WHERE id = ?").run([...actuales, codigo].join(","), sid);
    }
    return db.prepare("SELECT codigo, nombre, hex, unidad, general, activo, orden FROM colores WHERE codigo = ?").get(codigo);
  })();
}
async function actualizarItem(db, codigo, datos) {
  if (!await db.prepare("SELECT 1 AS x FROM colores WHERE codigo = ?").get(codigo)) throw new ErrorNegocio("\xCDtem no encontrado", 404);
  const d = validar(
    z.object({
      nombre: z.string().trim().min(2).max(40).optional(),
      hex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "color en formato #RRGGBB").optional(),
      unidad: z.enum(["estiba", "canastilla"]).optional(),
      activo: z.coerce.number().int().min(0).max(1).optional()
    }),
    datos
  );
  if (d.activo === 0 && (await db.prepare("SELECT COUNT(*) AS n FROM colores WHERE activo = 1 AND codigo <> ?").get(codigo)).n === 0) {
    throw new ErrorNegocio("Debe quedar al menos un \xEDtem activo", 409);
  }
  const campos = Object.keys(d).filter((k) => d[k] !== void 0);
  if (!campos.length) throw new ErrorNegocio("Nada para actualizar");
  await db.prepare(`UPDATE colores SET ${campos.map((k) => `${k} = @${k}`).join(", ")} WHERE codigo = @codigo`).run({ ...Object.fromEntries(campos.map((k) => [k, k === "hex" ? d[k].toLowerCase() : d[k]])), codigo });
  return db.prepare("SELECT codigo, nombre, hex, unidad, general, activo, orden FROM colores WHERE codigo = ?").get(codigo);
}
async function actualizarSeccion(db, seccionId, datos) {
  if (!await db.prepare("SELECT 1 AS x FROM secciones WHERE id = ?").get(seccionId)) throw new ErrorNegocio("Secci\xF3n no encontrada", 404);
  const d = validar(
    z.object({ nombre: z.string().trim().min(2).max(60).optional(), conteos: z.array(z.string().trim().min(1)).min(1, "elige al menos un tipo").optional() }),
    datos
  );
  if (d.nombre) await db.prepare("UPDATE secciones SET nombre = ? WHERE id = ?").run(d.nombre, seccionId);
  if (d.conteos) {
    const validos = new Set((await colores(db)).map((c) => c.codigo));
    const malo = d.conteos.find((c) => !validos.has(c));
    if (malo) throw new ErrorNegocio(`No existe el tipo de conteo "${malo}"`);
    await db.prepare("UPDATE secciones SET colores = ? WHERE id = ?").run([...new Set(d.conteos)].join(","), seccionId);
  }
  return (await configuracion(db)).secciones.find((s) => s.id === seccionId);
}
var esquemaPasillo = z.object({
  seccion_id: id,
  codigo: z.string().trim().toUpperCase().min(1).max(12),
  nombre: z.string().trim().min(1).max(40),
  modulo_final: z.coerce.number().int().min(1).max(999).default(104),
  modulos_lista: z.string().trim().max(2e3).nullish().transform((v) => v || null),
  activo: z.coerce.number().int().min(0).max(1).default(1)
});
async function crearPasillo(db, datos) {
  const p = validar(esquemaPasillo, datos);
  try {
    const orden = (await db.prepare("SELECT COALESCE(MAX(orden),0) + 1 AS n FROM pasillos").get()).n;
    const r = await db.prepare(
      `INSERT INTO pasillos (seccion_id, codigo, nombre, modulo_final, modulos_lista, activo, orden)
         VALUES (@seccion_id, @codigo, @nombre, @modulo_final, @modulos_lista, @activo, @orden)`
    ).run({ ...p, orden });
    return await obtenerPasillo(db, r.lastInsertRowid);
  } catch (e) {
    if (esRepetido(e)) throw new ErrorNegocio(`Ya existe el pasillo ${p.codigo}`, 409);
    throw e;
  }
}
async function actualizarPasillo(db, pasilloId, datos) {
  await obtenerPasillo(db, pasilloId);
  const cambios = validar(esquemaPasillo.omit({ seccion_id: true }).partial(), datos);
  const campos = Object.keys(cambios).filter((k) => cambios[k] !== void 0);
  if (!campos.length) throw new ErrorNegocio("Nada para actualizar");
  const params = Object.fromEntries(campos.map((k) => [k, cambios[k] ?? null]));
  try {
    await db.prepare(`UPDATE pasillos SET ${campos.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...params, id: pasilloId });
  } catch (e) {
    if (esRepetido(e)) throw new ErrorNegocio(`Ya existe el pasillo ${cambios.codigo}`, 409);
    throw e;
  }
  return obtenerPasillo(db, pasilloId);
}
async function obtenerInventario(db, invId) {
  const inv = await db.prepare("SELECT * FROM inventarios WHERE id = ?").get(invId);
  if (!inv) throw new ErrorNegocio("Inventario no encontrado", 404);
  return inv;
}
async function listarInventarios(db) {
  return db.prepare(
    `SELECT i.*, (SELECT COUNT(*) FROM participantes p WHERE p.inventario_id = i.id) AS personas
         FROM inventarios i ORDER BY i.id DESC`
  ).all();
}
async function crearInventario(db, datos) {
  const d = validar(
    z.object({
      nombre: z.string().trim().min(3).max(80),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      max_verificaciones: z.coerce.number().int().min(0).max(50).default(1)
    }),
    datos
  );
  const r = await db.prepare("INSERT INTO inventarios (nombre, fecha, max_verificaciones) VALUES (?, ?, ?)").run(d.nombre, d.fecha || hoy(), d.max_verificaciones);
  return obtenerInventario(db, r.lastInsertRowid);
}
async function actualizarInventario(db, invId, datos) {
  await obtenerInventario(db, invId);
  const d = validar(
    z.object({
      nombre: z.string().trim().min(3).max(80).optional(),
      max_verificaciones: z.coerce.number().int().min(0).max(50).optional(),
      observaciones: z.string().max(2e3).nullish(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no v\xE1lida (AAAA-MM-DD)").optional(),
      archivado: z.boolean().optional()
    }),
    datos
  );
  if (d.nombre) await db.prepare("UPDATE inventarios SET nombre = ? WHERE id = ?").run(d.nombre, invId);
  if (d.fecha) await db.prepare("UPDATE inventarios SET fecha = ? WHERE id = ?").run(d.fecha, invId);
  if (d.archivado !== void 0) {
    if (d.archivado && (await obtenerInventario(db, invId)).estado === "en_curso") throw new ErrorNegocio("No se puede archivar un inventario en curso. Ci\xE9rralo primero.", 409);
    await db.prepare("UPDATE inventarios SET archivado = ? WHERE id = ?").run(d.archivado ? 1 : 0, invId);
  }
  if (d.observaciones !== void 0) await db.prepare("UPDATE inventarios SET observaciones = ? WHERE id = ?").run(textoONulo(d.observaciones), invId);
  if (d.max_verificaciones !== void 0) await db.prepare("UPDATE inventarios SET max_verificaciones = ? WHERE id = ?").run(d.max_verificaciones, invId);
  return obtenerInventario(db, invId);
}
async function eliminarInventario(db, invId, datos) {
  const i = await obtenerInventario(db, invId);
  if (i.estado === "en_curso") throw new ErrorNegocio("No se puede borrar un inventario en curso. Ci\xE9rralo primero.", 409);
  const confirmar = `${datos?.confirmar ?? ""}`.trim();
  if (confirmar.toLowerCase() !== i.nombre.trim().toLowerCase()) {
    throw new ErrorNegocio(`Para borrar escribe el nombre exacto del inventario: "${i.nombre}"`, 400);
  }
  const cuenta = async (sql2) => (await db.prepare(sql2).get(invId)).n;
  const borrado = {
    personas: await cuenta("SELECT COUNT(*) AS n FROM participantes WHERE inventario_id = ?"),
    conteos: await cuenta("SELECT COUNT(*) AS n FROM conteos WHERE asignacion_id IN (SELECT id FROM asignaciones WHERE inventario_id = ?)")
  };
  await db.transaction(async () => {
    await db.prepare("DELETE FROM eventos WHERE participante_id IN (SELECT id FROM participantes WHERE inventario_id = ?)").run(invId);
    await db.prepare("DELETE FROM conteos WHERE asignacion_id IN (SELECT id FROM asignaciones WHERE inventario_id = ?)").run(invId);
    for (const t of ["asignaciones", "resoluciones", "esperados", "observaciones_pasillo", "participantes", "aura_alertas"]) {
      await db.prepare(`DELETE FROM ${t} WHERE inventario_id = ?`).run(invId);
    }
    await db.prepare("UPDATE aura_propuestas SET inventario_id = NULL WHERE inventario_id = ?").run(invId);
    await db.prepare("DELETE FROM inventarios WHERE id = ?").run(invId);
  })();
  return { ok: true, id: invId, nombre: i.nombre, ...borrado };
}
var TRANSICIONES = { preparacion: ["en_curso"], en_curso: ["cerrado"], cerrado: ["en_curso"] };
async function cambiarEstado(db, invId, estado) {
  const inv = await obtenerInventario(db, invId);
  if (!TRANSICIONES[inv.estado].includes(estado)) {
    throw new ErrorNegocio(`No se puede pasar de "${inv.estado}" a "${estado}"`, 409);
  }
  await db.prepare(
    `UPDATE inventarios SET estado = ?, cerrado_en = CASE WHEN ? = 'cerrado' THEN datetime('now','localtime') ELSE NULL END WHERE id = ?`
  ).run(estado, estado, invId);
  if (estado === "en_curso") {
    const actualizado = await obtenerInventario(db, invId);
    for (const p of await db.prepare("SELECT * FROM participantes WHERE inventario_id = ? AND estado = 'activo'").all(invId)) {
      await revisarAvance(db, p, actualizado);
    }
  }
  return obtenerInventario(db, invId);
}
async function registrarEvento(db, participanteId, tipo, detalle = null) {
  await db.prepare("INSERT INTO eventos (participante_id, tipo, detalle) VALUES (?, ?, ?)").run(participanteId, tipo, detalle);
}
async function crearAsignacion(db, invId, pasilloId, participanteId, tipo, modulos = null) {
  const pasillo = await obtenerPasillo(db, pasilloId);
  if (!pasillo.activo) throw new ErrorNegocio(`El pasillo ${pasillo.codigo} est\xE1 desactivado`, 409);
  try {
    const r = await db.prepare("INSERT INTO asignaciones (inventario_id, pasillo_id, participante_id, tipo, modulos) VALUES (?, ?, ?, ?, ?)").run(invId, pasilloId, participanteId, tipo, modulos ? JSON.stringify(modulos) : null);
    return await db.prepare("SELECT * FROM asignaciones WHERE id = ?").get(r.lastInsertRowid);
  } catch (e) {
    if (esRepetido(e)) {
      throw new ErrorNegocio(`El pasillo ${pasillo.codigo} ya tiene ${tipo === "conteo" ? "conteo" : "verificaci\xF3n"} asignado`, 409);
    }
    throw e;
  }
}
async function obtenerParticipante(db, invId, pid) {
  const p = await db.prepare("SELECT * FROM participantes WHERE id = ? AND inventario_id = ?").get(pid, invId);
  if (!p) throw new ErrorNegocio("Persona no encontrada", 404);
  return p;
}
async function reabrirParticipante(db, p) {
  await db.prepare("UPDATE participantes SET token = ?, estado = 'pendiente', dispositivo = NULL, fin_en = NULL WHERE id = ?").run(nuevoToken(), p.id);
  await registrarEvento(db, p.id, "reabierto");
}
async function agregarParticipante(db, invId, datos) {
  const inv = await obtenerInventario(db, invId);
  if (inv.estado === "cerrado") throw new ErrorNegocio("El inventario est\xE1 cerrado", 409);
  const d = validar(
    z.object({ nombre: z.string().trim().min(2).max(60), pasillos: z.array(id).default([]) }),
    datos
  );
  return db.transaction(async () => {
    let r;
    try {
      r = await db.prepare("INSERT INTO participantes (inventario_id, nombre, token) VALUES (?, ?, ?)").run(invId, d.nombre, nuevoToken());
    } catch (e) {
      if (esRepetido(e)) throw new ErrorNegocio(`${d.nombre} ya est\xE1 en este inventario`, 409);
      throw e;
    }
    for (const pid of d.pasillos) await crearAsignacion(db, invId, pid, r.lastInsertRowid, "conteo");
    await registrarOperador(db, d.nombre);
    return obtenerParticipante(db, invId, r.lastInsertRowid);
  })();
}
async function asignarManual(db, invId, datos) {
  const inv = await obtenerInventario(db, invId);
  if (inv.estado === "cerrado") throw new ErrorNegocio("El inventario est\xE1 cerrado", 409);
  const d = validar(
    z.object({ participante_id: id, pasillo_id: id, tipo: z.enum(["conteo", "verificacion"]) }),
    datos
  );
  return db.transaction(async () => {
    const p = await obtenerParticipante(db, invId, d.participante_id);
    const otro = d.tipo === "verificacion" ? "conteo" : "verificacion";
    const ya = await db.prepare("SELECT 1 AS x FROM asignaciones WHERE inventario_id=? AND pasillo_id=? AND tipo=? AND participante_id=? AND estado<>'anulada'").get(invId, d.pasillo_id, otro, p.id);
    if (ya) throw new ErrorNegocio("La misma persona no puede contar y verificar el mismo pasillo", 409);
    const a = await crearAsignacion(db, invId, d.pasillo_id, p.id, d.tipo);
    if (p.estado === "terminado") await reabrirParticipante(db, p);
    return a;
  })();
}
async function anularAsignacion(db, invId, asignacionId) {
  const a = await db.prepare("SELECT * FROM asignaciones WHERE id = ? AND inventario_id = ?").get(asignacionId, invId);
  if (!a) throw new ErrorNegocio("Asignaci\xF3n no encontrada", 404);
  if (a.estado === "anulada") throw new ErrorNegocio("Ya estaba anulada", 409);
  await db.prepare("UPDATE asignaciones SET estado = 'anulada' WHERE id = ?").run(asignacionId);
  return db.prepare("SELECT * FROM asignaciones WHERE id = ?").get(asignacionId);
}
async function nuevoEnlace(db, invId, pid) {
  const p = await obtenerParticipante(db, invId, pid);
  await db.prepare("UPDATE participantes SET token = ?, dispositivo = NULL, estado = CASE WHEN estado = 'terminado' THEN 'terminado' ELSE 'pendiente' END WHERE id = ?").run(nuevoToken(), p.id);
  await registrarEvento(db, p.id, "enlace_nuevo");
  return obtenerParticipante(db, invId, pid);
}
async function finalizarParticipante(db, invId, pid) {
  const p = await obtenerParticipante(db, invId, pid);
  await db.prepare("UPDATE participantes SET estado = 'terminado', fin_en = datetime('now','localtime') WHERE id = ?").run(p.id);
  await registrarEvento(db, p.id, "fin", "Finalizado por el administrador");
  return obtenerParticipante(db, invId, pid);
}
async function participantes(db, invId) {
  const lista = await db.prepare("SELECT * FROM participantes WHERE inventario_id = ? ORDER BY nombre").all(invId);
  const asigs = await db.prepare(
    `SELECT a.id, a.participante_id, a.tipo, a.estado, a.modulos, p.codigo AS pasillo, p.id AS pasillo_id
         FROM asignaciones a JOIN pasillos p ON p.id = a.pasillo_id
        WHERE a.inventario_id = ? AND a.estado <> 'anulada' ORDER BY a.id`
  ).all(invId);
  return lista.map((p) => ({
    ...p,
    asignaciones: asigs.filter((a) => a.participante_id === p.id).map((a) => ({ ...a, celdas: a.modulos ? JSON.parse(a.modulos) : null, modulos: void 0 }))
  }));
}
async function registrarOperador(db, nombre) {
  await db.prepare(
    `INSERT INTO operadores (nombre, veces, usado_en) VALUES (?, 1, datetime('now','localtime'))
     ON CONFLICT (nombre) DO UPDATE SET veces = operadores.veces + 1, activo = 1, usado_en = datetime('now','localtime')`
  ).run(String(nombre).trim());
}
async function operadores(db, { todos = false } = {}) {
  return db.prepare(`SELECT * FROM operadores ${todos ? "" : "WHERE activo = 1"} ORDER BY nombre COLLATE NOCASE`).all();
}
async function guardarOperadores(db, datos) {
  const d = validar(z.object({ nombres: z.array(z.string().trim().min(2).max(60)).min(1).max(200) }), datos);
  const ins = db.prepare("INSERT INTO operadores (nombre) VALUES (?) ON CONFLICT (nombre) DO UPDATE SET activo = 1");
  await db.transaction(async () => {
    for (const n2 of [...new Set(d.nombres)]) await ins.run(n2);
  })();
  return operadores(db);
}
async function quitarOperador(db, operadorId) {
  const r = await db.prepare("UPDATE operadores SET activo = 0 WHERE id = ?").run(operadorId);
  if (!r.changes) throw new ErrorNegocio("Operador no encontrado", 404);
  return operadores(db);
}
async function trabajoPasillo(db, p, todos) {
  return modulosDePasillo(p).length * (await coloresDeSeccion(db, p.seccion_id, todos)).length;
}
async function elegirPasillos(db, invId, seleccion) {
  const activos = await db.prepare("SELECT p.*, s.codigo AS seccion_codigo, s.nombre AS seccion FROM pasillos p JOIN secciones s ON s.id = p.seccion_id WHERE p.activo = 1 ORDER BY s.orden, p.orden, p.codigo").all();
  let lista;
  if (!seleccion || seleccion === "todos" || Array.isArray(seleccion) && !seleccion.length) lista = activos;
  else {
    const partes = (Array.isArray(seleccion) ? seleccion : String(seleccion).split(/[,;\s]+/)).map((x) => String(x).trim().toUpperCase()).filter(Boolean);
    const elegidos = /* @__PURE__ */ new Set();
    for (const parte of partes) {
      const rango2 = parte.match(/^([A-Z]*)(\d+)-([A-Z]*)(\d+)$/);
      const porSeccion = activos.filter((p) => p.seccion_codigo === parte || p.seccion.toUpperCase() === parte);
      if (porSeccion.length) porSeccion.forEach((p) => elegidos.add(p.id));
      else if (rango2) {
        const [, pre, a, , b] = rango2;
        activos.filter((p) => {
          const m = p.codigo.match(/^([A-Z]*)(\d+)$/);
          return m && m[1] === pre && Number(m[2]) >= Number(a) && Number(m[2]) <= Number(b);
        }).forEach((p) => elegidos.add(p.id));
      } else {
        const p = activos.find((x) => x.codigo === parte || x.codigo === parte.padStart(2, "0"));
        if (!p) throw new ErrorNegocio(`No existe el pasillo o secci\xF3n "${parte}"`);
        elegidos.add(p.id);
      }
    }
    lista = activos.filter((p) => elegidos.has(p.id));
  }
  const ocupados = new Set((await db.prepare("SELECT pasillo_id FROM asignaciones WHERE inventario_id = ? AND tipo = 'conteo' AND estado <> 'anulada'").all(invId)).map((x) => x.pasillo_id));
  return { libres: lista.filter((p) => !ocupados.has(p.id)), ocupados: lista.filter((p) => ocupados.has(p.id)) };
}
async function elegirNombres(db, invId, { nombres, cantidad }) {
  if (nombres && nombres.length) return [...new Set(nombres.map((n3) => String(n3).trim()).filter((n3) => n3.length >= 2))];
  const n2 = Number(cantidad) || 0;
  if (n2 < 1) throw new ErrorNegocio("Dime cu\xE1ntos operadores o sus nombres");
  const yaEstan = new Set((await db.prepare("SELECT nombre FROM participantes WHERE inventario_id = ?").all(invId || 0)).map((x) => x.nombre.toLowerCase()));
  const guardados = (await db.prepare("SELECT nombre FROM operadores WHERE activo = 1 ORDER BY veces DESC, nombre COLLATE NOCASE").all()).map((x) => x.nombre);
  const lista = [...guardados.filter((x) => !yaEstan.has(x.toLowerCase())), ...guardados.filter((x) => yaEstan.has(x.toLowerCase()))].slice(0, n2);
  for (let k = 1; lista.length < n2; k++) {
    const nombre = `Operador ${String(k).padStart(2, "0")}`;
    if (!lista.some((x) => x.toLowerCase() === nombre.toLowerCase())) lista.push(nombre);
  }
  return lista;
}
var esquemaRepartir = z.object({
  nombres: z.array(z.string().trim().min(2).max(60)).max(100).optional(),
  cantidad: z.coerce.number().int().min(1).max(100).optional(),
  pasillos: z.union([z.string().trim().max(500), z.array(z.string().trim().max(20)).max(200)]).optional(),
  por_persona: z.coerce.number().int().min(1).max(50).optional()
});
async function planRepartir(db, invId, datos) {
  const d = validar(esquemaRepartir, datos);
  const nombres = await elegirNombres(db, invId, d);
  const { libres, ocupados } = await elegirPasillos(db, invId, d.pasillos);
  if (!libres.length) throw new ErrorNegocio(ocupados.length ? "Esos pasillos ya tienen quien los cuente" : "No hay pasillos para repartir");
  const todos = await colores(db);
  const trabajo = [];
  for (const p of libres) trabajo.push(await trabajoPasillo(db, p, todos));
  const grupos = nombres.map((nombre) => ({ nombre, pasillos: [], casillas: 0 }));
  if (d.por_persona) {
    libres.forEach((p, k) => {
      const g = grupos[Math.floor(k / d.por_persona)];
      if (g) {
        g.pasillos.push(p.codigo);
        g.casillas += trabajo[k];
      }
    });
  } else {
    let restante = trabajo.reduce((a, b) => a + b, 0);
    let k = 0;
    grupos.forEach((g, gi) => {
      const quedan = grupos.length - gi;
      const meta = restante / quedan;
      while (k < libres.length && (g.pasillos.length === 0 || g.casillas + trabajo[k] / 2 <= meta && libres.length - k > quedan - 1)) {
        g.pasillos.push(libres[k].codigo);
        g.casillas += trabajo[k];
        restante -= trabajo[k];
        k++;
      }
    });
    for (; k < libres.length; k++) {
      const g = grupos.at(-1);
      g.pasillos.push(libres[k].codigo);
      g.casillas += trabajo[k];
    }
  }
  const sinPasillos = grupos.filter((g) => !g.pasillos.length).map((g) => g.nombre);
  const sobrantes = d.por_persona ? libres.slice(grupos.length * d.por_persona).map((p) => p.codigo) : [];
  return { grupos: grupos.filter((g) => g.pasillos.length), sin_pasillos: sinPasillos, sobrantes, ya_asignados: ocupados.map((p) => p.codigo) };
}
async function repartir(db, invId, datos) {
  const i = await obtenerInventario(db, invId);
  if (i.estado === "cerrado") throw new ErrorNegocio("El inventario est\xE1 cerrado", 409);
  const plan = await planRepartir(db, invId, datos);
  const idDe = async (c) => (await db.prepare("SELECT id FROM pasillos WHERE codigo = ?").get(c)).id;
  await db.transaction(async () => {
    for (const g of plan.grupos) {
      const ya = await db.prepare("SELECT * FROM participantes WHERE inventario_id = ? AND nombre = ? COLLATE NOCASE").get(invId, g.nombre);
      const ids = [];
      for (const c of g.pasillos) ids.push(await idDe(c));
      if (!ya) await agregarParticipante(db, invId, { nombre: g.nombre, pasillos: ids });
      else for (const pid of ids) await asignarManual(db, invId, { participante_id: ya.id, pasillo_id: pid, tipo: "conteo" });
    }
  })();
  return { ...plan, participantes: await participantes(db, invId) };
}
async function participantePorToken(db, token, dispositivo, { registrar = true } = {}) {
  const p = await db.prepare("SELECT * FROM participantes WHERE token = ?").get(String(token || ""));
  if (!p) throw new ErrorNegocio("Este enlace no es v\xE1lido. Pide uno nuevo al administrador.", 404);
  const inv = await obtenerInventario(db, p.inventario_id);
  if (inv.estado === "cerrado") throw new ErrorNegocio("Este inventario ya se cerr\xF3. Gracias por tu ayuda.", 410);
  if (p.estado === "terminado") throw new ErrorNegocio("Este enlace ya se us\xF3 y tu inventario termin\xF3. \xA1Gracias!", 410);
  if (!dispositivo) throw new ErrorNegocio("Falta la identificaci\xF3n del celular", 400);
  if (p.dispositivo && p.dispositivo !== dispositivo) {
    throw new ErrorNegocio("Este enlace ya se abri\xF3 en otro celular. Pide un enlace nuevo al administrador.", 423);
  }
  if (registrar && !p.dispositivo) {
    await db.prepare("UPDATE participantes SET dispositivo = ?, estado = 'activo', inicio_en = COALESCE(inicio_en, datetime('now','localtime')) WHERE id = ?").run(dispositivo, p.id);
    await registrarEvento(db, p.id, "inicio");
    return { p: await db.prepare("SELECT * FROM participantes WHERE id = ?").get(p.id), inv };
  }
  return { p, inv };
}
function celdasDeAsignacion(a) {
  return a.modulos ? JSON.parse(a.modulos) : null;
}
async function modulosDeAsignacion(db, a, pasillo = null) {
  pasillo = pasillo || await obtenerPasillo(db, a.pasillo_id);
  const celdas = celdasDeAsignacion(a);
  if (!celdas) return modulosDePasillo(pasillo);
  const orden = modulosDePasillo(pasillo);
  const usados = new Set(celdas.map((c) => c.split("|")[0]));
  return orden.filter((m) => usados.has(m));
}
var permitida = (celdas, modulo, color) => !celdas || celdas.includes(`${modulo}|${color}`);
async function detalleAsignacion(db, a) {
  const pasillo = await obtenerPasillo(db, a.pasillo_id);
  const cols = await coloresDeSeccion(db, pasillo.seccion_id);
  const modulos = await modulosDeAsignacion(db, a, pasillo);
  const conteos = await db.prepare("SELECT modulo, color, valor, expresion FROM conteos WHERE asignacion_id = ? ORDER BY id").all(a.id);
  const celdas = celdasDeAsignacion(a);
  const casillas = celdas ? celdas.length : modulos.length * cols.length;
  return {
    id: a.id,
    tipo: a.tipo,
    estado: a.estado,
    pasillo: { id: pasillo.id, codigo: pasillo.codigo, nombre: pasillo.nombre, seccion: pasillo.seccion },
    colores: cols,
    modulos,
    celdas,
    conteos,
    observacion: a.observacion || "",
    avance: casillas ? Math.round(conteos.length / casillas * 100) : 0
  };
}
async function revisarAvance(db, p, inv) {
  if (inv.estado !== "en_curso" || p.estado === "terminado") return;
  const pendientes = (await db.prepare("SELECT COUNT(*) AS n FROM asignaciones WHERE participante_id = ? AND estado IN ('pendiente','en_curso')").get(p.id)).n;
  if (pendientes > 0) return;
  const conto = (await db.prepare("SELECT COUNT(*) AS n FROM asignaciones WHERE participante_id = ? AND tipo = 'conteo' AND estado = 'terminada'").get(p.id)).n;
  const verifico = (await db.prepare("SELECT COUNT(*) AS n FROM asignaciones WHERE participante_id = ? AND tipo = 'verificacion' AND estado <> 'anulada'").get(p.id)).n;
  const puedeVerificar = conto > 0 && (inv.max_verificaciones === 0 || verifico < inv.max_verificaciones);
  if (puedeVerificar) {
    const sinVerificar = `NOT EXISTS (SELECT 1 FROM asignaciones v WHERE v.inventario_id = c.inventario_id
                            AND v.pasillo_id = c.pasillo_id AND v.tipo = 'verificacion' AND v.estado <> 'anulada')`;
    for (let intento = 0; intento < 3; intento++) {
      const candidato = await db.prepare(
        `SELECT c.pasillo_id FROM asignaciones c
            WHERE c.inventario_id = ? AND c.tipo = 'conteo' AND c.estado = 'terminada'
              AND c.participante_id <> ? AND ${sinVerificar}
            ORDER BY c.terminado_en, c.id LIMIT 1`
      ).get(inv.id, p.id);
      if (!candidato) break;
      try {
        await crearAsignacion(db, inv.id, candidato.pasillo_id, p.id, "verificacion");
        await registrarEvento(db, p.id, "verificacion_asignada", String(candidato.pasillo_id));
        return;
      } catch (e) {
        if (e.status !== 409) throw e;
      }
    }
    const podrian = (await db.prepare(
      `SELECT COUNT(*) AS n FROM asignaciones c
          WHERE c.inventario_id = ? AND c.tipo = 'conteo' AND c.estado IN ('pendiente','en_curso')
            AND c.participante_id <> ? AND ${sinVerificar}`
    ).get(inv.id, p.id)).n;
    if (podrian > 0) return;
  }
  await db.prepare("UPDATE participantes SET estado = 'terminado', fin_en = datetime('now','localtime') WHERE id = ?").run(p.id);
  await registrarEvento(db, p.id, "fin");
}
async function estadoContador(db, token, dispositivo) {
  const { p, inv } = await participantePorToken(db, token, dispositivo);
  await revisarAvance(db, p, inv);
  const actual = await db.prepare("SELECT * FROM participantes WHERE id = ?").get(p.id);
  if (actual.estado === "terminado") {
    return { terminado: true, participante: { nombre: actual.nombre }, inventario: { nombre: inv.nombre } };
  }
  const cols = await colores(db);
  const asigs = [];
  for (const a of await db.prepare("SELECT * FROM asignaciones WHERE participante_id = ? AND estado <> 'anulada' ORDER BY id").all(p.id)) {
    asigs.push(await detalleAsignacion(db, a));
  }
  return {
    terminado: false,
    participante: { nombre: actual.nombre, salidas: actual.salidas },
    inventario: { nombre: inv.nombre, fecha: inv.fecha, estado: inv.estado },
    colores: cols,
    asignaciones: asigs,
    esperando: inv.estado === "en_curso" && asigs.length > 0 && asigs.every((a) => a.estado === "terminada")
  };
}
async function asignacionPropia(db, p, asignacionId) {
  const a = await db.prepare("SELECT * FROM asignaciones WHERE id = ? AND participante_id = ? AND estado <> 'anulada'").get(asignacionId, p.id);
  if (!a) throw new ErrorNegocio("Pasillo no asignado a ti", 404);
  if (a.estado === "terminada") throw new ErrorNegocio("Este pasillo ya se termin\xF3", 409);
  return a;
}
var esquemaCasillas = z.array(
  z.object({
    modulo: z.string().trim().min(1).max(12),
    color: z.string().trim().min(1).max(20),
    expresion: z.union([z.string().max(60), z.number()]).nullish()
  })
).max(2e3);
async function guardarConteos(db, token, dispositivo, asignacionId, lista, observacion) {
  const { p, inv } = await participantePorToken(db, token, dispositivo);
  if (inv.estado !== "en_curso") throw new ErrorNegocio("El inventario a\xFAn no est\xE1 abierto para contar. Espera la se\xF1al del administrador.", 409);
  const a = await asignacionPropia(db, p, asignacionId);
  const casillas = validar(esquemaCasillas, lista ?? []);
  const obs = validar(z.string().max(500, "la observaci\xF3n es muy larga (m\xE1ximo 500 letras)").nullish(), observacion);
  const modulos = new Set(await modulosDeAsignacion(db, a));
  const celdas = celdasDeAsignacion(a);
  const cols = new Set((await coloresDeSeccion(db, (await obtenerPasillo(db, a.pasillo_id)).seccion_id)).map((c) => c.codigo));
  await db.transaction(async () => {
    const borrar = db.prepare("DELETE FROM conteos WHERE asignacion_id = ? AND modulo = ? AND color = ?");
    const guardar = db.prepare(
      `INSERT INTO conteos (asignacion_id, modulo, color, valor, expresion) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (asignacion_id, modulo, color)
       DO UPDATE SET valor = excluded.valor, expresion = excluded.expresion, actualizado_en = datetime('now','localtime')`
    );
    for (const c of casillas) {
      if (!modulos.has(c.modulo)) throw new ErrorNegocio(`El m\xF3dulo ${c.modulo} no est\xE1 en este pasillo`);
      if (!cols.has(c.color)) throw new ErrorNegocio(`En este pasillo no se cuenta "${c.color}"`);
      if (!permitida(celdas, c.modulo, c.color)) throw new ErrorNegocio(`La casilla ${c.modulo} ${c.color} no est\xE1 en tu reconteo`);
      let valor;
      try {
        valor = evaluarCasilla(c.expresion);
      } catch (e) {
        throw new ErrorNegocio(`M\xF3dulo ${c.modulo} (${c.color}): ${e.message}`);
      }
      if (valor === null) await borrar.run(a.id, c.modulo, c.color);
      else await guardar.run(a.id, c.modulo, c.color, valor, String(c.expresion).includes("+") ? String(c.expresion).replace(/\s/g, "") : null);
    }
    if (obs !== void 0) await db.prepare("UPDATE asignaciones SET observacion = ? WHERE id = ?").run(textoONulo(obs), a.id);
    if (a.estado === "pendiente" && casillas.length) {
      await db.prepare("UPDATE asignaciones SET estado = 'en_curso', iniciado_en = datetime('now','localtime') WHERE id = ?").run(a.id);
    }
  })();
  return detalleAsignacion(db, await db.prepare("SELECT * FROM asignaciones WHERE id = ?").get(a.id));
}
async function terminarAsignacion(db, token, dispositivo, asignacionId) {
  const { p, inv } = await participantePorToken(db, token, dispositivo);
  if (inv.estado !== "en_curso") throw new ErrorNegocio("El inventario no est\xE1 abierto para contar", 409);
  const a = await asignacionPropia(db, p, asignacionId);
  await db.transaction(async () => {
    const llenar = db.prepare("INSERT OR IGNORE INTO conteos (asignacion_id, modulo, color, valor) VALUES (?, ?, ?, 0)");
    const cols = await coloresDeSeccion(db, (await obtenerPasillo(db, a.pasillo_id)).seccion_id);
    const celdas = celdasDeAsignacion(a);
    for (const m of await modulosDeAsignacion(db, a)) {
      for (const c of cols) if (permitida(celdas, m, c.codigo)) await llenar.run(a.id, m, c.codigo);
    }
    await db.prepare(
      "UPDATE asignaciones SET estado = 'terminada', iniciado_en = COALESCE(iniciado_en, datetime('now','localtime')), terminado_en = datetime('now','localtime') WHERE id = ?"
    ).run(a.id);
    await registrarEvento(db, p.id, "pasillo_terminado", String(a.id));
  })();
  return estadoContador(db, token, dispositivo);
}
var EVENTOS_APP = ["salio", "volvio", "pantalla_completa", "sin_pantalla_completa", "fijada"];
async function eventoDesdeApp(db, token, dispositivo, tipo) {
  if (!EVENTOS_APP.includes(tipo)) throw new ErrorNegocio("Evento no v\xE1lido");
  const { p } = await participantePorToken(db, token, dispositivo, { registrar: false });
  if (tipo === "salio") await db.prepare("UPDATE participantes SET salidas = salidas + 1 WHERE id = ?").run(p.id);
  await registrarEvento(db, p.id, tipo);
  return { salidas: (await db.prepare("SELECT salidas FROM participantes WHERE id = ?").get(p.id)).salidas };
}
async function cruce(db, invId, pasilloId, cache2 = {}) {
  if (!cache2.inventario) await obtenerInventario(db, invId);
  const pasillo = await obtenerPasillo(db, pasilloId);
  const modulos = modulosDePasillo(pasillo);
  const cols = await coloresDeSeccion(db, pasillo.seccion_id, cache2.colores);
  const asigs = (await db.prepare(
    `SELECT a.*, p.nombre AS persona FROM asignaciones a JOIN participantes p ON p.id = a.participante_id
        WHERE a.inventario_id = ? AND a.pasillo_id = ? AND a.estado <> 'anulada' ORDER BY a.id`
  ).all(invId, pasilloId)).map((a) => ({ ...a, celdas: a.modulos ? new Set(JSON.parse(a.modulos)) : null }));
  const valores = /* @__PURE__ */ new Map();
  const leer = db.prepare("SELECT modulo, color, valor FROM conteos WHERE asignacion_id = ?");
  for (const a of asigs.filter((x) => x.estado === "terminada")) {
    valores.set(a.id, new Map((await leer.all(a.id)).map((c) => [`${c.modulo}|${c.color}`, c.valor])));
  }
  const resol = new Map(
    (await db.prepare("SELECT * FROM resoluciones WHERE inventario_id = ? AND pasillo_id = ?").all(invId, pasilloId)).map((r) => [`${r.modulo}|${r.color}`, r])
  );
  const conteo = asigs.find((a) => a.tipo === "conteo");
  const verif = asigs.find((a) => a.tipo === "verificacion");
  const recs = asigs.filter((a) => a.tipo === "reconteo");
  const val = (a, k) => a && a.estado === "terminada" ? valores.get(a.id).get(k) ?? 0 : null;
  const filas = [];
  const resumen = { ok: 0, diferencia: 0, revisar: 0, resuelto: 0, ajustado: 0, en_reconteo: 0, sin_verificar: 0, verificando: 0, pendiente: 0 };
  const totales = Object.fromEntries(cols.map((c) => [c.codigo, 0]));
  for (const m of modulos) {
    for (const c of cols) {
      const k = `${m}|${c.codigo}`;
      const c1 = val(conteo, k);
      const c2 = val(verif, k);
      const aplica = recs.filter((r) => !r.celdas || r.celdas.has(k));
      const recontados = aplica.filter((r) => r.estado === "terminada").map((r) => valores.get(r.id).get(k) ?? 0);
      const recPendiente = aplica.some((r) => r.estado !== "terminada");
      const res = resol.get(k);
      let estado;
      let final = null;
      if (res) {
        estado = "ajustado";
        final = res.valor;
      } else if (recontados.length) {
        final = recontados.at(-1);
        const anteriores = [c1, c2, ...recontados.slice(0, -1)];
        estado = recPendiente ? "en_reconteo" : anteriores.includes(final) ? "resuelto" : "revisar";
      } else if (recPendiente) estado = "en_reconteo";
      else if (c1 === null) estado = "pendiente";
      else if (c2 === null) {
        estado = verif ? "verificando" : "sin_verificar";
        final = c1;
      } else if (c1 === c2) {
        estado = "ok";
        final = c1;
      } else estado = "diferencia";
      resumen[estado]++;
      totales[c.codigo] += final ?? c1 ?? 0;
      filas.push({ modulo: m, color: c.codigo, conteo: c1, verificacion: c2, reconteos: recontados, final, estado, motivo: res?.motivo });
    }
  }
  let estadoPasillo2;
  if (!conteo) estadoPasillo2 = "sin_asignar";
  else if (conteo.estado !== "terminada") estadoPasillo2 = conteo.estado === "pendiente" ? "asignado" : "contando";
  else if (resumen.diferencia + resumen.revisar > 0) estadoPasillo2 = "diferencias";
  else if (resumen.en_reconteo > 0) estadoPasillo2 = "en_reconteo";
  else if (!verif) estadoPasillo2 = "contado";
  else if (verif.estado !== "terminada") estadoPasillo2 = "verificando";
  else estadoPasillo2 = "cuadrado";
  const TIPO = { conteo: "Conteo", verificacion: "Verificaci\xF3n", reconteo: "Reconteo" };
  const observaciones = asigs.filter((a) => a.observacion).map((a) => ({ persona: a.persona, tipo: TIPO[a.tipo], texto: a.observacion }));
  const nota = await db.prepare("SELECT texto, actualizado_en FROM observaciones_pasillo WHERE inventario_id = ? AND pasillo_id = ?").get(invId, pasilloId);
  return {
    pasillo: { id: pasillo.id, codigo: pasillo.codigo, nombre: pasillo.nombre, seccion: pasillo.seccion, seccion_codigo: pasillo.seccion_codigo },
    estado: estadoPasillo2,
    observaciones,
    nota_admin: nota?.texto || "",
    conto: conteo ? { asignacion_id: conteo.id, persona: conteo.persona, estado: conteo.estado } : null,
    verifico: verif ? { asignacion_id: verif.id, persona: verif.persona, estado: verif.estado } : null,
    reconteos: recs.map((r) => ({ asignacion_id: r.id, persona: r.persona, estado: r.estado, celdas: r.celdas ? [...r.celdas] : null })),
    colores: cols,
    modulos,
    resumen,
    totales,
    ...sumarPorUnidad(totales, cols),
    // total = estibas; canastillas aparte
    filas
  };
}
async function resumenInventario(db, invId, { conFilas = false } = {}) {
  const inv = await obtenerInventario(db, invId);
  const cols = await colores(db);
  const cache2 = { inventario: inv, colores: cols };
  const pasillos = [];
  const filasPorPasillo = {};
  for (const p of await db.prepare("SELECT p.id FROM pasillos p JOIN secciones s ON s.id = p.seccion_id WHERE p.activo = 1 ORDER BY s.orden, p.orden").all()) {
    const c = await cruce(db, invId, p.id, cache2);
    if (conFilas) filasPorPasillo[p.id] = c.filas;
    pasillos.push({
      ...c.pasillo,
      estado: c.estado,
      conto: c.conto,
      verifico: c.verifico,
      reconteos: c.reconteos.length,
      colores: c.colores.map((x) => x.codigo),
      resumen: c.resumen,
      totales: c.totales,
      total: c.total,
      canastillas: c.canastillas,
      observaciones: c.observaciones,
      nota_admin: c.nota_admin
    });
  }
  const vacio = () => Object.fromEntries(cols.map((c) => [c.codigo, 0]));
  const secciones = [];
  const global = { totales: vacio(), total: 0, canastillas: 0 };
  for (const p of pasillos) {
    let s = secciones.find((x) => x.codigo === p.seccion_codigo);
    if (!s) secciones.push(s = { codigo: p.seccion_codigo, nombre: p.seccion, colores: p.colores, totales: vacio(), total: 0, canastillas: 0, pasillos: 0, cuadrados: 0 });
    cols.forEach((c) => {
      const v = p.totales[c.codigo] || 0;
      s.totales[c.codigo] += v;
      global.totales[c.codigo] += v;
    });
    s.total += p.total;
    s.canastillas += p.canastillas;
    global.total += p.total;
    global.canastillas += p.canastillas;
    s.pasillos++;
    if (p.estado === "cuadrado") s.cuadrados++;
  }
  const conteoEstados = pasillos.reduce((a, p) => ({ ...a, [p.estado]: (a[p.estado] || 0) + 1 }), {});
  return {
    inventario: inv,
    colores: cols,
    pasillos,
    secciones,
    global,
    estados: conteoEstados,
    participantes: await participantes(db, invId),
    esperados: await compararEsperados(db, invId, global, secciones),
    ...conFilas ? { filas_por_pasillo: filasPorPasillo } : {}
  };
}
async function itemsComparables(db) {
  const lista = (await colores(db)).map((c) => ({ clave: c.codigo, nombre: c.nombre, hex: c.hex, unidad: c.unidad }));
  const pilas = await db.prepare("SELECT codigo, nombre FROM secciones WHERE codigo = 'PILAS'").get();
  if (pilas) lista.push({ clave: `seccion:${pilas.codigo}`, nombre: "Pilas", detalle: pilas.nombre, hex: "#5b6472", unidad: "estiba", seccion: true });
  return lista;
}
async function guardarEsperados(db, invId, datos) {
  await obtenerInventario(db, invId);
  const d = validar(
    z.object({
      esperados: z.array(z.object({
        clave: z.string().trim().min(1).max(40),
        cantidad: z.coerce.number().int().min(0, "no puede ser negativo").max(9999999).nullish(),
        observacion: z.string().max(300, "observaci\xF3n muy larga (m\xE1ximo 300 letras)").nullish()
      })).max(100)
    }),
    datos
  );
  const validas = new Set((await itemsComparables(db)).map((i) => i.clave));
  const mala = d.esperados.find((e) => !validas.has(e.clave));
  if (mala) throw new ErrorNegocio(`No existe "${mala.clave}" para comparar`);
  await db.transaction(async () => {
    const guardar = db.prepare(
      `INSERT INTO esperados (inventario_id, clave, cantidad, observacion) VALUES (?, ?, ?, ?)
       ON CONFLICT (inventario_id, clave) DO UPDATE SET cantidad = excluded.cantidad, observacion = excluded.observacion, actualizado_en = datetime('now','localtime')`
    );
    const borrar = db.prepare("DELETE FROM esperados WHERE inventario_id = ? AND clave = ?");
    const actual = db.prepare("SELECT cantidad, observacion FROM esperados WHERE inventario_id = ? AND clave = ?");
    for (const e of d.esperados) {
      const antes = await actual.get(invId, e.clave) || {};
      const cantidad = e.cantidad !== void 0 ? e.cantidad : antes.cantidad ?? null;
      const observacion = e.observacion !== void 0 ? textoONulo(e.observacion) : antes.observacion ?? null;
      if (cantidad === null && observacion === null) await borrar.run(invId, e.clave);
      else await guardar.run(invId, e.clave, cantidad, observacion);
    }
  })();
  return (await resumenInventario(db, invId)).esperados;
}
async function compararEsperados(db, invId, global, secciones) {
  const guardados = new Map((await db.prepare("SELECT clave, cantidad, observacion FROM esperados WHERE inventario_id = ?").all(invId)).map((e) => [e.clave, e]));
  const filas = (await itemsComparables(db)).map((i) => {
    const contado = i.seccion ? secciones.find((s) => `seccion:${s.codigo}` === i.clave)?.total ?? 0 : global.totales[i.clave] ?? 0;
    const g = guardados.get(i.clave);
    const esperado = g?.cantidad ?? null;
    return { ...i, esperado, contado, diferencia: esperado === null ? null : contado - esperado, observacion: g?.observacion || "" };
  });
  const deEstiba = filas.filter((f) => !f.seccion && f.unidad === "estiba");
  const conDato = deEstiba.filter((f) => f.esperado !== null);
  const esperadoTotal = conDato.length ? conDato.reduce((a, f) => a + f.esperado, 0) : null;
  const total = {
    clave: "total",
    nombre: "Total estibas",
    unidad: "estiba",
    esperado: esperadoTotal,
    contado: global.total,
    diferencia: esperadoTotal === null ? null : global.total - esperadoTotal,
    completo: conDato.length === deEstiba.length
  };
  return { filas, total, actualizado: (await db.prepare("SELECT MAX(actualizado_en) AS f FROM esperados WHERE inventario_id = ?").get(invId)).f };
}
async function asignarReconteo(db, invId, datos) {
  const inv = await obtenerInventario(db, invId);
  if (inv.estado !== "en_curso") throw new ErrorNegocio("El inventario debe estar en curso para asignar reconteos", 409);
  const d = validar(
    z.object({
      pasillo_id: id,
      celdas: z.array(z.string().trim().regex(/^[^|]+\|[^|]+$/, "formato m\xF3dulo|color")).optional(),
      participante_id: id.optional(),
      nombre: z.string().trim().min(2).max(60).optional()
    }),
    datos
  );
  if (!d.participante_id && !d.nombre) throw new ErrorNegocio("Elige qui\xE9n hace el reconteo");
  const cr = await cruce(db, invId, d.pasillo_id);
  let celdas = d.celdas;
  if (!celdas || !celdas.length) {
    celdas = cr.filas.filter((f) => f.estado === "diferencia" || f.estado === "revisar").map((f) => `${f.modulo}|${f.color}`);
  }
  celdas = [...new Set(celdas)];
  if (!celdas.length) throw new ErrorNegocio("No hay diferencias para recontar en este pasillo", 409);
  const validas = new Set(cr.filas.map((f) => `${f.modulo}|${f.color}`));
  const mala = celdas.find((c) => !validas.has(c));
  if (mala) throw new ErrorNegocio(`La casilla ${mala.replace("|", " ")} no est\xE1 en el pasillo`);
  return db.transaction(async () => {
    let p;
    if (d.participante_id) {
      p = await obtenerParticipante(db, invId, d.participante_id);
    } else {
      p = await db.prepare("SELECT * FROM participantes WHERE inventario_id = ? AND nombre = ?").get(invId, d.nombre);
      if (!p) {
        const r = await db.prepare("INSERT INTO participantes (inventario_id, nombre, token) VALUES (?, ?, ?)").run(invId, d.nombre, nuevoToken());
        await registrarOperador(db, d.nombre);
        p = await obtenerParticipante(db, invId, r.lastInsertRowid);
      }
    }
    const a = await crearAsignacion(db, invId, d.pasillo_id, p.id, "reconteo", celdas);
    if (p.estado === "terminado") await reabrirParticipante(db, p);
    return { asignacion: { ...a, celdas }, participante: await obtenerParticipante(db, invId, p.id) };
  })();
}
async function resolver(db, invId, datos) {
  await obtenerInventario(db, invId);
  const d = validar(
    z.object({
      pasillo_id: id,
      modulo: z.string().trim().min(1),
      color: z.string().trim().min(1),
      valor: z.coerce.number().int().min(0).max(9999),
      motivo: z.string().trim().min(3, "escribe el motivo").max(200)
    }),
    datos
  );
  await db.prepare(
    `INSERT INTO resoluciones (inventario_id, pasillo_id, modulo, color, valor, motivo) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (inventario_id, pasillo_id, modulo, color) DO UPDATE SET valor = excluded.valor, motivo = excluded.motivo`
  ).run(invId, d.pasillo_id, d.modulo, d.color, d.valor, d.motivo);
  return cruce(db, invId, d.pasillo_id);
}
async function guardarObservacionPasillo(db, invId, pasilloId, datos) {
  await obtenerInventario(db, invId);
  await obtenerPasillo(db, pasilloId);
  const d = validar(z.object({ texto: z.string().max(1e3, "m\xE1ximo 1000 letras").nullish() }), datos);
  const texto = textoONulo(d.texto);
  if (texto === null) await db.prepare("DELETE FROM observaciones_pasillo WHERE inventario_id = ? AND pasillo_id = ?").run(invId, pasilloId);
  else await db.prepare(
    `INSERT INTO observaciones_pasillo (inventario_id, pasillo_id, texto) VALUES (?, ?, ?)
     ON CONFLICT (inventario_id, pasillo_id) DO UPDATE SET texto = excluded.texto, actualizado_en = datetime('now','localtime')`
  ).run(invId, pasilloId, texto);
  return cruce(db, invId, pasilloId);
}
async function eventos(db, invId) {
  return db.prepare(
    `SELECT e.*, p.nombre AS persona FROM eventos e JOIN participantes p ON p.id = e.participante_id
        WHERE p.inventario_id = ? ORDER BY e.id DESC LIMIT 200`
  ).all(invId);
}

// fnb/nucleo/dashboard.js
var TITULO = "PLANTILLA DE INVENTARIO ATS R10 VALLEDUPAR";
var esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var num = (n2) => (n2 < 0 ? "\u2212" : "") + String(Math.abs(Math.round(n2 || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
var pct = (a, b) => b ? Math.round(a / b * 100) : 0;
var corto = (nombre) => nombre.replace(/^Pallet /i, "");
var OSCURO = { azul: "#4f8be0", verde: "#2fa864", blanca: "#8a96a6", roja: "#d94a4a", canastilla: "#d6961c" };
var CLARO = { blanca: "#8a96a6" };
var ORDEN = ["azul", "verde", "blanca", "roja"];
var GRUPOS = [
  { clave: "cuadrado", nombre: "Cuadrado", icono: "\u2713", estados: ["cuadrado"] },
  { clave: "diferencias", nombre: "Con diferencias", icono: "\u2715", estados: ["diferencias"] },
  { clave: "proceso", nombre: "En proceso", icono: "\u21BB", estados: ["asignado", "contando", "contado", "verificando", "en_reconteo"] },
  { clave: "sin", nombre: "Sin asignar", icono: "\u25CB", estados: ["sin_asignar"] }
];
var NOMBRE_ESTADO = {
  sin_asignar: "Sin asignar",
  asignado: "Asignado",
  contando: "Contando",
  contado: "Contado, sin verificar",
  verificando: "Verificando",
  diferencias: "Con diferencias",
  en_reconteo: "En reconteo",
  cuadrado: "Cuadrado"
};
var grupoDe = (estado) => GRUPOS.find((g) => g.estados.includes(estado));
var ESTADO_PERSONA = { pendiente: "Sin abrir el enlace", activo: "Contando", terminado: "Termin\xF3" };
function estadoPasillo(estado) {
  const g = grupoDe(estado);
  return `<span class="estado g-${g.clave}"><i aria-hidden="true">${g.icono}</i> ${esc(NOMBRE_ESTADO[estado] || estado)}</span>`;
}
function textoDiferencia(d) {
  if (d === null) return '<span class="tenue">Sin dato del sistema</span>';
  if (d === 0) return '<span class="dif"><i class="g-cuadrado" aria-hidden="true">\u2713</i> Cuadra</span>';
  return d < 0 ? `<span class="dif"><i class="g-diferencias" aria-hidden="true">\u25BC</i> ${num(-d)} faltan</span>` : `<span class="dif"><i class="g-proceso" aria-hidden="true">\u25B2</i> ${num(d)} sobran</span>`;
}
function tile(rotulo, valor, nota = "", clase = "") {
  return `<div class="tile ${clase}"><small>${esc(rotulo)}</small><strong>${valor}</strong>${nota ? `<span>${nota}</span>` : ""}</div>`;
}
function filaBala(f, escala) {
  const ancho = escala ? f.contado / escala * 100 : 0;
  const marca = f.esperado !== null && escala ? f.esperado / escala * 100 : null;
  const tip = `${f.nombre}: contado ${num(f.contado)}${f.esperado !== null ? ` \xB7 seg\xFAn sistema ${num(f.esperado)} \xB7 diferencia ${f.diferencia > 0 ? "+" : ""}${num(f.diferencia)}` : ""}`;
  return `<div class="bala" data-tip="${esc(tip)}" tabindex="0">
    <div class="bala-nombre"><i class="punto i-${esc(f.clave.replace("seccion:", "s-"))}" aria-hidden="true"></i>${esc(corto(f.nombre))}${f.detalle ? `<small class="tenue detalle">(${esc(f.detalle)})</small>` : ""}</div>
    <div class="bala-pista">
      <div class="bala-barra i-${esc(f.clave.replace("seccion:", "s-"))}" style="width:${ancho.toFixed(2)}%"></div>
      ${marca !== null ? `<div class="bala-marca" style="left:${Math.min(marca, 100).toFixed(2)}%" aria-hidden="true"></div>` : ""}
    </div>
    <div class="bala-num"><strong>${num(f.contado)}</strong>${f.esperado !== null ? ` <span class="tenue">/ ${num(f.esperado)}</span>` : ""}</div>
    <div class="bala-dif">${textoDiferencia(f.diferencia)}</div>
  </div>`;
}
function grupoBalas(titulo, filas) {
  if (!filas.length) return "";
  const escala = Math.max(1, ...filas.flatMap((f) => [f.contado, f.esperado ?? 0]));
  return `<div class="grupo-bala"><h3>${esc(titulo)}</h3>${filas.map((f) => filaBala(f, escala)).join("")}</div>`;
}
async function htmlDashboard(db, invId, opciones = {}) {
  return htmlDesdeResumen(await resumenInventario(db, invId), opciones);
}
function htmlDesdeResumen(r, { elaboro } = {}) {
  const inv = r.inventario;
  const cols = r.colores;
  const ahora2 = /* @__PURE__ */ new Date();
  const generado = ahora2.toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });
  const fecha = inv.fecha.split("-").reverse().join("/");
  const estadoInv = { preparacion: "En preparaci\xF3n", en_curso: "En curso", cerrado: "Cerrado" }[inv.estado];
  const totalPasillos = r.pasillos.length;
  const cuadrados = r.estados.cuadrado || 0;
  const conDif = r.estados.diferencias || 0;
  const casillasDif = r.pasillos.reduce((a, p) => a + (p.resumen.diferencia || 0) + (p.resumen.revisar || 0), 0);
  const personas = r.participantes;
  const terminaron = personas.filter((p) => p.estado === "terminado").length;
  const salidas = personas.reduce((a, p) => a + (p.salidas || 0), 0);
  const esp = r.esperados;
  const hayEsperados = esp.filas.some((f) => f.esperado !== null);
  const claseItem = (codigo) => `.i-${codigo}`;
  const cssItems = [
    ...cols.map((c) => `${claseItem(c.codigo)}{--c:${CLARO[c.codigo] || c.hex}}`),
    ...esp.filas.filter((f) => f.seccion).map((f) => `.i-${f.clave.replace("seccion:", "s-")}{--c:${f.hex}}`)
  ].join("\n");
  const cssOscuro = cols.map((c) => `${claseItem(c.codigo)}{--c:${OSCURO[c.codigo] || c.hex}}`).join("\n") + esp.filas.filter((f) => f.seccion).map((f) => `
.i-${f.clave.replace("seccion:", "s-")}{--c:#8f96a3}`).join("");
  const tiles = [
    tile("Total estibas contadas", num(r.global.total), hayEsperados && esp.total.esperado !== null ? `Seg\xFAn sistema ${num(esp.total.esperado)} \xB7 ${textoDiferencia(esp.total.diferencia)}${esp.total.completo ? "" : ' <small class="tenue">(faltan colores por escribir)</small>'}` : "Pallets de todos los colores", "heroe"),
    r.global.canastillas ? tile("Canastillas", num(r.global.canastillas), "Se cuentan aparte de las estibas") : "",
    tile("Pasillos cuadrados", `${cuadrados} <small>de ${totalPasillos}</small>`, `${pct(cuadrados, totalPasillos)} % del CEDI`),
    tile("Pasillos con diferencias", num(conDif), `${num(casillasDif)} casillas por resolver`),
    tile("Personas", `${terminaron} <small>de ${personas.length}</small>`, `terminaron \xB7 ${salidas} salida(s) de la app`)
  ].join("");
  const estibas = esp.filas.filter((f) => f.unidad === "estiba");
  const otros = esp.filas.filter((f) => f.unidad !== "estiba" && (f.contado || f.esperado !== null));
  const comparacion = `
    <section class="tarjeta">
      <h2>Seg\xFAn sistema vs contado</h2>
      <p class="tenue">La barra es lo contado; la raya vertical es lo que dice el sistema. ${hayEsperados ? "" : "<strong>A\xFAn no se escribieron las cantidades seg\xFAn sistema</strong> (se escriben arriba en el Tablero del administrador)."}</p>
      ${grupoBalas("Estibas", estibas)}
      ${grupoBalas("Canastillas y otros (no son estibas)", otros)}
    </section>`;
  const deEstiba = cols.filter((c) => c.unidad === "estiba").sort((a, b) => (ORDEN.indexOf(a.codigo) + 1 || 99) - (ORDEN.indexOf(b.codigo) + 1 || 99));
  const usados = deEstiba.filter((c) => r.secciones.some((s) => s.colores.includes(c.codigo)));
  const maxSeccion = Math.max(1, ...r.secciones.map((s) => s.total));
  const barrasSeccion = r.secciones.map((s) => {
    const segmentos = usados.filter((c) => s.totales[c.codigo] > 0).map((c) => {
      const v = s.totales[c.codigo];
      return `<div class="seg i-${c.codigo}" style="flex-basis:${(v / maxSeccion * 100).toFixed(3)}%" data-tip="${esc(`${s.nombre} \xB7 ${corto(c.nombre)}: ${num(v)} estibas`)}" tabindex="0"></div>`;
    }).join("");
    return `<div class="fila-apilada">
      <div class="fa-nombre">${esc(s.nombre)}<small class="tenue">${s.cuadrados}/${s.pasillos} cuadrados</small></div>
      <div class="fa-pista">${segmentos}</div>
      <div class="fa-total">${num(s.total)}</div>
    </div>`;
  }).join("");
  const leyenda = usados.map((c) => `<span><i class="punto i-${c.codigo}" aria-hidden="true"></i>${esc(corto(c.nombre))}</span>`).join("");
  const porSeccion = `
    <section class="tarjeta">
      <h2>Estibas por secci\xF3n</h2>
      <div class="leyenda">${leyenda}</div>
      <div class="apiladas">${barrasSeccion}</div>
      ${r.global.canastillas ? `<p class="tenue pequeno">Las canastillas (${num(r.global.canastillas)}) no se suman aqu\xED porque no son estibas.</p>` : ""}
    </section>`;
  const conteoGrupo = GRUPOS.map((g) => ({ ...g, n: r.pasillos.filter((p) => g.estados.includes(p.estado)).length }));
  const barraEstado = conteoGrupo.filter((g) => g.n).map((g) => `<div class="seg g-fondo-${g.clave}" style="flex-grow:${g.n}" data-tip="${esc(`${g.nombre}: ${g.n} pasillo(s)`)}" tabindex="0"></div>`).join("");
  const estadoPasillos = `
    <section class="tarjeta">
      <h2>Estado de los pasillos</h2>
      <div class="barra-estado">${barraEstado || '<div class="seg g-fondo-sin" style="flex-grow:1"></div>'}</div>
      <div class="leyenda estados">${conteoGrupo.map((g) => `<span><i class="cuadro g-fondo-${g.clave}" aria-hidden="true"></i><i class="g-${g.clave}" aria-hidden="true">${g.icono}</i> ${esc(g.nombre)} <strong>${g.n}</strong></span>`).join("")}</div>
    </section>`;
  const difs = r.pasillos.map((p) => ({ ...p, casillas: (p.resumen.diferencia || 0) + (p.resumen.revisar || 0) })).filter((p) => p.casillas > 0).sort((a, b) => b.casillas - a.casillas);
  const listaDif = `
    <section class="tarjeta">
      <h2>Pasillos con diferencias</h2>
      ${difs.length ? `<div class="tabla-env"><table><thead><tr><th>Pasillo</th><th>Secci\xF3n</th><th class="n">Casillas con diferencia</th><th>Cont\xF3</th><th>Verific\xF3</th><th class="n">Reconteos</th></tr></thead><tbody>
        ${difs.map((p) => `<tr><td><strong>${esc(p.codigo)}</strong></td><td>${esc(p.seccion)}</td><td class="n">${num(p.casillas)}</td><td>${esc(p.conto?.persona || "\u2014")}</td><td>${esc(p.verifico?.persona || "\u2014")}</td><td class="n">${p.reconteos}</td></tr>`).join("")}
      </tbody></table></div>` : '<p><i class="g-cuadrado" aria-hidden="true">\u2713</i> No hay diferencias abiertas entre conteo y verificaci\xF3n.</p>'}
    </section>`;
  const celda = (p, c) => `<td class="n">${p.colores.includes(c.codigo) ? num(p.totales[c.codigo]) : ""}</td>`;
  const hayCanast = r.global.canastillas > 0;
  const detalle = `
    <section class="tarjeta">
      <h2>Detalle por pasillo</h2>
      <div class="tabla-env"><table>
        <thead><tr><th>Secci\xF3n</th><th>Pasillo</th>${cols.map((c) => `<th class="n">${esc(corto(c.nombre))}</th>`).join("")}<th class="n">Total estibas</th><th>Estado</th></tr></thead>
        <tbody>${r.pasillos.map((p) => `<tr><td>${esc(p.seccion)}</td><td><strong>${esc(p.codigo)}</strong></td>${cols.map((c) => celda(p, c)).join("")}<td class="n"><strong>${num(p.total)}</strong></td><td>${estadoPasillo(p.estado)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="2">TOTAL CEDI</td>${cols.map((c) => `<td class="n">${num(r.global.totales[c.codigo])}</td>`).join("")}<td class="n">${num(r.global.total)}</td><td>${hayCanast ? `${num(r.global.canastillas)} canastillas` : ""}</td></tr></tfoot>
      </table></div>
    </section>`;
  const TIPO = { conteo: "C", verificacion: "V", reconteo: "R" };
  const tablaPersonas = `
    <section class="tarjeta">
      <h2>Personas</h2>
      ${personas.length ? `<div class="tabla-env"><table><thead><tr><th>Nombre</th><th>Estado</th><th>Pasillos <small class="tenue">(C conteo \xB7 V verificaci\xF3n \xB7 R reconteo)</small></th><th class="n">Salidas de la app</th></tr></thead><tbody>
        ${personas.map((p) => `<tr><td><strong>${esc(p.nombre)}</strong></td><td>${esc(ESTADO_PERSONA[p.estado] || p.estado)}</td><td>${p.asignaciones.map((a) => `${esc(a.pasillo)} ${TIPO[a.tipo]}${a.estado === "terminada" ? "\u2713" : ""}`).join(" \xB7 ") || "\u2014"}</td><td class="n">${p.salidas ? `<i class="g-proceso" aria-hidden="true">\u26A0</i> ${p.salidas}` : "0"}</td></tr>`).join("")}
      </tbody></table></div>` : '<p class="tenue">No hay personas en este inventario.</p>'}
    </section>`;
  const obsItems = esp.filas.filter((f) => f.observacion);
  const obsPasillos = r.pasillos.filter((p) => p.observaciones.length || p.nota_admin);
  const hayObs = inv.observaciones || obsItems.length || obsPasillos.length;
  const observaciones = `
    <section class="tarjeta">
      <h2>Observaciones</h2>
      ${hayObs ? `
        ${inv.observaciones ? `<h3>Generales</h3><p class="obs-texto">${esc(inv.observaciones)}</p>` : ""}
        ${obsItems.length ? `<h3>Por \xEDtem</h3><ul class="obs">${obsItems.map((f) => `<li><strong>${esc(corto(f.nombre))}:</strong> ${esc(f.observacion)}</li>`).join("")}</ul>` : ""}
        ${obsPasillos.length ? `<h3>Por pasillo</h3><ul class="obs">${obsPasillos.map((p) => `<li><strong>${esc(p.codigo)}</strong> <span class="tenue">${esc(p.seccion)}</span><ul>${[
    ...p.observaciones.map((o) => `<li>${esc(o.persona)} <span class="tenue">(${esc(o.tipo)})</span>: ${esc(o.texto)}</li>`),
    p.nota_admin ? `<li>Administrador: ${esc(p.nota_admin)}</li>` : ""
  ].join("")}</ul></li>`).join("")}</ul>` : ""}` : '<p class="tenue">No se escribieron observaciones.</p>'}
    </section>`;
  const aviso = cuadrados < totalPasillos ? `<div class="aviso"><i class="g-proceso" aria-hidden="true">\u26A0</i> Totales provisionales: ${totalPasillos - cuadrados} de ${totalPasillos} pasillos a\xFAn no est\xE1n cuadrados.</div>` : `<div class="aviso ok"><i class="g-cuadrado" aria-hidden="true">\u2713</i> Todos los pasillos est\xE1n cuadrados.</div>`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard \xB7 ${esc(inv.nombre)}</title>
<style>
:root{
  color-scheme:light;
  --fondo:#f4f6f9; --tarjeta:#fcfcfb; --texto:#0b0b0b; --texto-2:#52514e; --tenue:#6b6a66; --borde:#e2e1dc; --pista:#eeede9; --rejilla:#e2e1dc;
  --marca:#1f3864; --tick:#0b0b0b;
  --bueno:#0ca30c; --alerta:#fab219; --critico:#d03b3b; --neutro:#b5b3ad;
}
${cssItems}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme:dark;
    --fondo:#121211; --tarjeta:#1a1a19; --texto:#f0efec; --texto-2:#c3c2b7; --tenue:#a3a29a; --borde:#33332f; --pista:#262624; --rejilla:#33332f;
    --marca:#7fa6ea; --tick:#f0efec; --neutro:#5a5955;
  }
  ${cssOscuro.split("\n").map((l) => `:root:not([data-theme="light"]) ${l}`).join("\n  ")}
}
:root[data-theme="dark"]{
  color-scheme:dark;
  --fondo:#121211; --tarjeta:#1a1a19; --texto:#f0efec; --texto-2:#c3c2b7; --tenue:#a3a29a; --borde:#33332f; --pista:#262624; --rejilla:#33332f;
  --marca:#7fa6ea; --tick:#f0efec; --neutro:#5a5955;
}
${cssOscuro.split("\n").map((l) => `:root[data-theme="dark"] ${l}`).join("\n")}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--texto);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.pagina{max-width:1100px;margin:0 auto;padding:20px 16px 40px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
header .ceja{font-size:.75rem;font-weight:800;letter-spacing:.06em;color:var(--marca);margin:0}
header h1{margin:2px 0 4px;font-size:1.6rem}
header p{margin:0;color:var(--texto-2)}
.botones{display:flex;gap:8px}
button{font:inherit;font-weight:700;border:1px solid var(--borde);background:var(--tarjeta);color:var(--texto);border-radius:10px;padding:9px 14px;cursor:pointer;min-height:44px}
.tenue{color:var(--tenue)} .pequeno{font-size:.85rem}
.aviso{background:var(--tarjeta);border:1px solid var(--borde);border-left:5px solid var(--alerta);border-radius:12px;padding:10px 14px;margin-bottom:14px;font-weight:600}
.aviso.ok{border-left-color:var(--bueno)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px}
.tile{background:var(--tarjeta);border:1px solid var(--borde);border-radius:12px;padding:12px 14px;display:grid;gap:2px;align-content:start}
.tile small{color:var(--texto-2);font-weight:700;font-size:.8rem}
.tile strong{font-size:1.8rem;line-height:1.1;font-variant-numeric:tabular-nums}
.tile strong small{font-size:1rem;color:var(--tenue)}
.tile span{color:var(--texto-2);font-size:.85rem}
.tile.heroe{grid-column:span 2} .tile.heroe strong{font-size:2.6rem}
@media (max-width:520px){.tiles{grid-template-columns:1fr 1fr}.tile.heroe{grid-column:1/-1}.tile strong{font-size:1.5rem}}
.tarjeta{background:var(--tarjeta);border:1px solid var(--borde);border-radius:12px;padding:16px;margin-bottom:14px;break-inside:avoid}
.tarjeta h2{font-size:1.1rem;margin:0 0 6px}
.tarjeta h3{font-size:.85rem;margin:14px 0 6px;color:var(--texto-2);text-transform:uppercase;letter-spacing:.04em}
.tarjeta>p{margin:0 0 6px}
.punto{width:10px;height:10px;border-radius:50%;display:inline-block;background:var(--c);margin-right:6px;flex:none}
.cuadro{width:12px;height:12px;border-radius:3px;display:inline-block;margin-right:4px;vertical-align:-1px}
/* Seg\xFAn sistema vs contado */
.bala{display:grid;grid-template-columns:minmax(110px,170px) 1fr 110px minmax(110px,140px);gap:10px;align-items:center;padding:7px 4px;border-radius:8px}
.bala:hover,.bala:focus{background:var(--pista);outline:none}
.bala-nombre{font-weight:700;display:flex;align-items:center;flex-wrap:wrap}
.detalle{font-weight:400;margin-left:5px}
.bala-pista{position:relative;height:18px;background:var(--pista);border-radius:4px}
.bala-barra{height:100%;background:var(--c);border-radius:0 4px 4px 0;min-width:2px}
.bala-marca{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1.5px;background:var(--tick);border-radius:2px;box-shadow:0 0 0 2px var(--tarjeta)}
.bala-num{text-align:right;font-variant-numeric:tabular-nums}
.dif{white-space:nowrap} .dif i{font-style:normal;margin-right:3px}
@media (max-width:640px){
  .bala{grid-template-columns:1fr auto;row-gap:4px}
  .bala-pista{grid-column:1/-1;grid-row:2}
  .bala-dif{grid-column:1/-1}
}
/* Barras apiladas */
.leyenda{display:flex;flex-wrap:wrap;gap:14px;margin:4px 0 10px;color:var(--texto-2);font-size:.88rem}
.leyenda span{display:inline-flex;align-items:center;gap:2px}
.leyenda i{font-style:normal}
.apiladas{display:grid;gap:8px}
.fila-apilada{display:grid;grid-template-columns:minmax(120px,190px) 1fr 64px;gap:10px;align-items:center}
.fa-nombre{font-weight:700;display:grid;line-height:1.2} .fa-nombre small{font-weight:400;font-size:.78rem}
.fa-pista{display:flex;gap:2px;align-items:center;height:22px}
.seg{height:100%;background:var(--c);flex-shrink:0;min-width:3px}
.fa-pista .seg:last-of-type{border-radius:0 4px 4px 0}
.fa-total{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.seg:hover,.seg:focus{filter:brightness(1.12);outline:none}
.barra-estado{display:flex;gap:2px;height:26px;margin:6px 0 10px}
.barra-estado .seg{flex-basis:0;border-radius:0}
.barra-estado .seg:first-child{border-radius:4px 0 0 4px} .barra-estado .seg:last-child{border-radius:0 4px 4px 0}
.barra-estado .seg:only-child{border-radius:4px}
.g-fondo-cuadrado{background:var(--bueno)} .g-fondo-diferencias{background:var(--critico)} .g-fondo-proceso{background:var(--alerta)} .g-fondo-sin{background:var(--neutro)}
.g-cuadrado{color:var(--bueno)} .g-diferencias{color:var(--critico)} .g-proceso{color:#c58a00} .g-sin{color:var(--tenue)}
.estado i,.leyenda.estados i,td i{font-style:normal}
@media (max-width:640px){.fila-apilada{grid-template-columns:1fr 56px;row-gap:2px}.fa-nombre{grid-column:1/-1}}
/* Tablas */
.tabla-env{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.88rem;font-variant-numeric:tabular-nums}
th,td{padding:7px 8px;border-bottom:1px solid var(--rejilla);text-align:left;white-space:nowrap}
th{color:var(--texto-2);font-size:.78rem;text-transform:uppercase;letter-spacing:.03em}
.n{text-align:right}
tfoot td{font-weight:800;border-top:2px solid var(--borde);border-bottom:0}
.obs-texto{white-space:pre-wrap;margin:0}
ul.obs{margin:0;padding-left:18px;display:grid;gap:6px} ul.obs ul{margin:4px 0 0;padding-left:18px}
footer{color:var(--tenue);font-size:.8rem;text-align:center;margin-top:20px}
/* Ayuda flotante al pasar el mouse o tocar */
#tip{position:fixed;z-index:9;pointer-events:none;background:var(--texto);color:var(--tarjeta);padding:6px 10px;border-radius:8px;font-size:.85rem;font-weight:600;max-width:280px;opacity:0;transition:opacity .1s}
#tip.ver{opacity:1}
@media print{
  :root{color-scheme:light}
  body{background:#fff;font-size:12px}
  .botones,#tip{display:none!important}
  .pagina{padding:0;max-width:none}
  .tarjeta,.tile,.aviso{border-color:#ccc}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="pagina">
  <header>
    <div>
      <p class="ceja">${esc(TITULO)}</p>
      <h1>${esc(inv.nombre)}</h1>
      <p>Fecha del inventario ${esc(fecha)} \xB7 ${esc(estadoInv)} \xB7 Elabor\xF3: ${esc(elaboro || "________________")}</p>
    </div>
    <div class="botones"><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button></div>
  </header>
  ${aviso}
  <div class="tiles">${tiles}</div>
  ${comparacion}
  ${porSeccion}
  ${estadoPasillos}
  ${listaDif}
  ${detalle}
  ${observaciones}
  ${tablaPersonas}
  <footer>Datos al ${esc(generado)} \xB7 App de inventario mensual de estibas</footer>
</div>
<div id="tip" role="tooltip"></div>
<script>
(function(){
  var tip=document.getElementById('tip');
  function ver(e){var t=e.target.closest('[data-tip]');if(!t){tip.className='';return}
    tip.textContent=t.getAttribute('data-tip');tip.className='ver';
    var x=e.clientX,y=e.clientY;if(x===undefined||e.type==='focusin'){var r=t.getBoundingClientRect();x=r.left+r.width/2;y=r.top}
    var w=tip.offsetWidth;tip.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+'px';tip.style.top=Math.max(8,y-tip.offsetHeight-12)+'px'}
  document.addEventListener('pointermove',ver);document.addEventListener('focusin',ver);
  document.addEventListener('pointerleave',function(){tip.className=''});
  document.addEventListener('focusout',function(){tip.className=''});
})();
</script>
</body>
</html>`;
}

// fnb/nucleo/excel.js
var AZUL = "FF1F3864";
var NOMBRE_ESTADO2 = {
  ok: "Cuadra",
  diferencia: "Diferencia",
  revisar: "Revisar",
  resuelto: "Resuelto por reconteo",
  ajustado: "Ajustado por admin",
  en_reconteo: "En reconteo",
  sin_verificar: "Sin verificar",
  verificando: "Verificando",
  pendiente: "Pendiente",
  sin_asignar: "Sin asignar",
  asignado: "Asignado",
  contando: "Contando",
  contado: "Contado (sin verificar)",
  diferencias: "Con diferencias",
  cuadrado: "Cuadrado"
};
function hojaTabla(libro, nombre, columnas, filas) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho || 12 }));
  filas.forEach((f) => hoja.addRow(f));
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  cab.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cab.height = 30;
  if (filas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return hoja;
}
async function datosExcel(db, invId) {
  const { filas_por_pasillo: cruces, ...r } = await resumenInventario(db, invId, { conFilas: true });
  return { r, cruces, eventos: await eventos(db, invId) };
}
async function libroInventario(ExcelJS, db, invId, opciones = {}) {
  return armarLibro(ExcelJS, await datosExcel(db, invId), opciones);
}
function armarLibro(ExcelJS, { r, cruces, eventos: bitacora }, { elaboro } = {}) {
  const cols = r.colores;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Inventario mensual de estibas";
  libro.created = /* @__PURE__ */ new Date();
  const res = libro.addWorksheet("Resumen");
  res.columns = [{ width: 28 }, ...cols.map(() => ({ width: 13 })), { width: 14 }, { width: 13 }, { width: 16 }];
  res.addRow([r.inventario.nombre]).font = { bold: true, size: 16, color: { argb: AZUL } };
  res.addRow([`Fecha: ${r.inventario.fecha}   \xB7   Estado: ${r.inventario.estado}`]);
  res.addRow([]);
  const cab = res.addRow(["Secci\xF3n", ...cols.map((c) => c.nombre), "Total estibas", "Canastillas", "Pasillos cuadrados"]);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  r.secciones.forEach((s) => res.addRow([
    s.nombre,
    ...cols.map((c) => s.colores.includes(c.codigo) ? s.totales[c.codigo] : ""),
    s.total,
    s.canastillas || "",
    `${s.cuadrados} de ${s.pasillos}`
  ]));
  const tot = res.addRow(["TOTAL CEDI", ...cols.map((c) => r.global.totales[c.codigo]), r.global.total, r.global.canastillas, ""]);
  tot.font = { bold: true };
  tot.border = { top: { style: "thin" } };
  res.addRow([]);
  const pend = r.pasillos.filter((p) => p.estado !== "cuadrado");
  res.addRow([pend.length ? `Atenci\xF3n: ${pend.length} pasillos a\xFAn no est\xE1n cuadrados (los totales son provisionales).` : "Todos los pasillos est\xE1n cuadrados."]).font = { italic: true, color: { argb: pend.length ? "FFB3261E" : "FF1E7D4F" } };
  res.addRow([]);
  const esp = r.esperados;
  const cabE = res.addRow(["Seg\xFAn sistema vs contado", "Seg\xFAn sistema", "Contado", "Diferencia", "Resultado", "Observaci\xF3n"]);
  cabE.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabE.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  const resultado = (d) => d === null ? "Sin dato del sistema" : d === 0 ? "Cuadra" : d < 0 ? `Faltan ${-d}` : `Sobran ${d}`;
  [...esp.filas, esp.total].forEach((f) => {
    const fila = res.addRow([f.detalle ? `${f.nombre} (${f.detalle})` : f.nombre, f.esperado ?? "", f.contado, f.diferencia ?? "", resultado(f.diferencia), f.observacion || ""]);
    if (f.clave === "total") {
      fila.font = { bold: true };
      fila.border = { top: { style: "thin" } };
    }
    if (f.diferencia) fila.getCell(5).font = { bold: true, color: { argb: f.diferencia < 0 ? "FFB3261E" : "FF9A6700" } };
  });
  res.addRow([]);
  res.addRow(["Observaciones generales"]).font = { bold: true, color: { argb: AZUL } };
  const obsG = res.addRow([r.inventario.observaciones || "Sin observaciones."]);
  res.mergeCells(obsG.number, 1, obsG.number, 6);
  obsG.alignment = { wrapText: true, vertical: "top" };
  obsG.height = Math.min(120, 18 * Math.max(1, Math.ceil(String(r.inventario.observaciones || "").length / 90)));
  res.addRow([]);
  res.addRow([`Elabor\xF3: ${elaboro || "______________________"}`]).font = { bold: true };
  hojaTabla(libro, "Pasillos", [
    { titulo: "Secci\xF3n", clave: "seccion", ancho: 16 },
    { titulo: "Pasillo", clave: "codigo", ancho: 10 },
    ...cols.map((c) => ({ titulo: c.nombre, clave: c.codigo })),
    { titulo: "Total estibas", clave: "total" },
    { titulo: "Canastillas", clave: "canastillas" },
    { titulo: "Estado", clave: "estado", ancho: 22 },
    { titulo: "Cont\xF3", clave: "conto", ancho: 20 },
    { titulo: "Verific\xF3", clave: "verifico", ancho: 20 },
    { titulo: "Diferencias", clave: "difs", ancho: 12 },
    { titulo: "Observaciones", clave: "obs", ancho: 50 }
  ], r.pasillos.map((p) => ({
    seccion: p.seccion,
    codigo: p.codigo,
    ...p.totales,
    total: p.total,
    canastillas: p.canastillas || "",
    estado: NOMBRE_ESTADO2[p.estado] || p.estado,
    conto: p.conto?.persona || "",
    verifico: p.verifico?.persona || "",
    difs: p.resumen.diferencia + p.resumen.revisar,
    obs: [...p.observaciones.map((o) => `${o.persona} (${o.tipo}): ${o.texto}`), p.nota_admin ? `Admin: ${p.nota_admin}` : null].filter(Boolean).join(" | ")
  })));
  const nombreColor = Object.fromEntries(cols.map((c) => [c.codigo, c.nombre.replace("Pallet ", "")]));
  const detalle = [];
  r.pasillos.forEach((p) => {
    cruces[p.id].forEach((f) => detalle.push({
      seccion: p.seccion,
      pasillo: p.codigo,
      modulo: f.modulo,
      color: nombreColor[f.color] || f.color,
      conteo: f.conteo,
      verificacion: f.verificacion,
      reconteo: f.reconteos.join(" / "),
      final: f.final,
      estado: NOMBRE_ESTADO2[f.estado] || f.estado,
      motivo: f.motivo || ""
    }));
  });
  const colsDetalle = [
    { titulo: "Secci\xF3n", clave: "seccion", ancho: 16 },
    { titulo: "Pasillo", clave: "pasillo", ancho: 10 },
    { titulo: "M\xF3dulo", clave: "modulo", ancho: 9 },
    { titulo: "Qu\xE9 se cont\xF3", clave: "color", ancho: 13 },
    { titulo: "Conteo 1", clave: "conteo", ancho: 10 },
    { titulo: "Verificaci\xF3n", clave: "verificacion", ancho: 12 },
    { titulo: "Reconteo(s)", clave: "reconteo", ancho: 12 },
    { titulo: "Valor final", clave: "final", ancho: 11 },
    { titulo: "Estado", clave: "estado", ancho: 22 },
    { titulo: "Motivo ajuste", clave: "motivo", ancho: 30 }
  ];
  hojaTabla(
    libro,
    "Diferencias",
    colsDetalle,
    detalle.filter((f) => ["Diferencia", "Revisar", "Resuelto por reconteo", "Ajustado por admin", "En reconteo"].includes(f.estado))
  );
  hojaTabla(libro, "Detalle", colsDetalle, detalle.filter((f) => f.conteo !== null || f.final !== null));
  hojaTabla(libro, "Personas", [
    { titulo: "Nombre", clave: "nombre", ancho: 24 },
    { titulo: "Cont\xF3", clave: "conto", ancho: 24 },
    { titulo: "Verific\xF3", clave: "verifico", ancho: 18 },
    { titulo: "Reconteos", clave: "reconto", ancho: 14 },
    { titulo: "Estado", clave: "estado", ancho: 12 },
    { titulo: "Salidas de la app", clave: "salidas", ancho: 12 },
    { titulo: "Inicio", clave: "inicio_en", ancho: 18 },
    { titulo: "Fin", clave: "fin_en", ancho: 18 }
  ], r.participantes.map((p) => {
    const por = (t) => p.asignaciones.filter((a) => a.tipo === t).map((a) => a.pasillo).join(", ");
    return { ...p, conto: por("conteo"), verifico: por("verificacion"), reconto: por("reconteo") };
  }));
  hojaTabla(libro, "Bit\xE1cora", [
    { titulo: "Fecha y hora", clave: "creado_en", ancho: 20 },
    { titulo: "Persona", clave: "persona", ancho: 24 },
    { titulo: "Evento", clave: "tipo", ancho: 22 },
    { titulo: "Detalle", clave: "detalle", ancho: 30 }
  ], bitacora);
  return libro;
}

// fnb/nucleo/aura.js
import { z as z2 } from "npm:zod@3.25.76";
var normal = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[¿?¡!.,;:()"'«»]/g, " ").replace(/\s+/g, " ").trim();
var VACIAS = new Set("a al como con cual cuales de del el en es esta este esto hay la las lo los me mi mis o para por que se si su sus te tu un una uno y yo hago puedo debo quiero necesito favor aura hola dime explica explicame ayudame ayuda".split(" "));
var raiz = (p) => p.replace(/(es|s)$/, "");
var palabras = (t) => normal(t).split(" ").filter((p) => p.length > 2 && !VACIAS.has(p)).map(raiz);
var ORDEN2 = /\b(asigna|asignale|crea|creale|cambia|corrige|arregla|quita|anula|agrega|fija|cierra|reabre|inicia|finaliza|propon|edita|recuenta|reconta|borra|activa|desactiva|guarda|manda|envia)\b/;
var PREGUNTA = /\b(como|que|cual|donde|cuando|por que|porque|para que|se puede|sirve|funciona|significa)\b/;
function puntaje(q, claves) {
  const ps = q.split(" ");
  const exacta = (cn) => cn.includes(" ") ? q.includes(cn) : ps.some((p) => p === cn || raiz(p) === raiz(cn));
  const parecida = (cn) => exacta(cn) || !cn.includes(" ") && ps.some((p) => cn.length >= 5 && p.length >= 5 && p.slice(0, 5) === cn.slice(0, 5));
  let s = 0;
  let exactos = 0;
  for (const grupo of claves) {
    const cns = grupo.map(normal);
    if (cns.some(parecida)) s++;
    if (cns.some(exacta)) exactos++;
  }
  return { s, exactos };
}
function parecido(a, b) {
  const A = new Set(palabras(a));
  const B = new Set(palabras(b));
  if (!A.size || !B.size) return 0;
  let comun = 0;
  A.forEach((x) => {
    if (B.has(x)) comun++;
  });
  return comun / Math.max(A.size, B.size);
}
var BASE = [
  {
    id: "saludo",
    titulo: "Saludo",
    claves: [["hola", "buenos", "buenas", "saludos", "gracias"]],
    minimo: 1,
    corta: true,
    respuesta: "\xA1Hola! Soy Aura. Te digo c\xF3mo va el inventario, qu\xE9 pasillos tienen diferencias, qui\xE9n falta por contar y si hay problemas. Te explico cualquier parte de la app. Si me pides un cambio te dejo una propuesta para que la apruebes. Lo que no s\xE9 se lo pregunto a THEMENDO en Copilot."
  },
  {
    id: "aura",
    titulo: "Qu\xE9 es Aura",
    claves: [["aura", "eres", "asistente"], ["que", "quien", "eres", "haces", "puedes", "sirve", "sabe"]],
    minimo: 2,
    respuesta: `Soy Aura, la asistente del inventario en la nube. Vivo en el panel del administrador y:
\u2022 Te explico la app paso a paso (lo que ya s\xE9 lo contesto al instante).
\u2022 Reviso los datos: avance, diferencias, personas y problemas (agentes vigilantes).
\u2022 Para cambiar algo (enlaces, asignaciones, reconteos, repartir pasillos\u2026) te dejo una PROPUESTA: nada se hace sin que toques Aprobar.
\u2022 Lo que no s\xE9 lo paso a THEMENDO en Copilot con el contexto del inventario; la respuesta que pegues queda guardada.
\u2022 Aprendo de las lecciones de inventario que THEMENDO guarda en su Cuaderno.`
  },
  {
    id: "copilot",
    titulo: "Aura y Copilot",
    claves: [["copilot", "themendo", "microsoft", "cuaderno"]],
    minimo: 1,
    respuesta: `Aura trabaja con Copilot as\xED:
1. Si no s\xE9 algo, toco "Preguntar a THEMENDO en Copilot": copio tu pregunta con el estado del inventario y se abre Copilot.
2. Pega (mant\xE9n presionado \u2192 Pegar) y env\xEDa.
3. Copia la respuesta de Copilot, vuelve aqu\xED y p\xE9gala en "Guardar la respuesta de Copilot".
4. La pr\xF3xima vez que alguien pregunte lo mismo, contesto al instante.
Tambi\xE9n aprendo solas las lecciones de inventario que THEMENDO guarda en su Cuaderno.`
  },
  {
    id: "instalar",
    titulo: "Instalar la app en el celular",
    claves: [["instalar", "instalo", "apk", "descargar", "celular", "telefono", "app"], ["instalar", "instalo", "apk", "actualizar", "actualizo", "nueva", "version"]],
    minimo: 2,
    respuesta: `Para instalar el inventario en un celular Android:
\u2022 Como APK: abre la Central de Luis \u2192 Mis APK \u2192 "Inventario de estibas" \u2192 Descargar e instalar. Si pregunta, permite instalar apps de esa fuente. Las actualizaciones se instalan encima.
\u2022 Sin instalar: abre la p\xE1gina del inventario en Chrome \u2192 men\xFA \u22EE \u2192 "Agregar a pantalla principal".
El operador NO necesita instalar nada: abre su enlace de WhatsApp.`
  },
  {
    id: "escritorio",
    titulo: "App del PC",
    claves: [["pc", "computador", "escritorio", "windows", "portatil", "usb", "iniciar inventario"]],
    minimo: 1,
    respuesta: "La app del PC (INICIAR-INVENTARIO, USB port\xE1til) sigue igual y es aparte: sus datos est\xE1n en ese PC. Esta versi\xF3n est\xE1 en la nube: funciona en cualquier celular con internet, sin dejar un PC prendido, y sus datos est\xE1n en la nube del equipo. Para preguntas de la app del PC, preg\xFAntale a THEMENDO en Copilot."
  },
  {
    id: "enlace_no_abre",
    titulo: "El enlace de un operador no abre",
    claves: [["enlace", "link", "linck"], ["abre", "funciona", "sirve", "entra", "error", "celular", "otro", "cambio", "perdio", "bloqueado"]],
    minimo: 2,
    respuesta: `Si a un operador no le abre su enlace:
\u2022 "Este enlace ya se abri\xF3 en otro celular": cada enlace queda amarrado al primer celular. En Personas y enlaces toca "Enlace nuevo" y env\xEDaselo (el anterior deja de servir).
\u2022 "Este enlace no es v\xE1lido": le lleg\xF3 incompleto o ya le creaste uno nuevo. Env\xEDale el actual.
\u2022 "Ya termin\xF3": esa persona termin\xF3 sus pasillos. Si debe contar m\xE1s, as\xEDgnale un pasillo y la app le crea enlace nuevo.
\u2022 La primera vez debe abrirlo con Wi-Fi o datos; despu\xE9s cuenta sin se\xF1al.`
  },
  {
    id: "sin_senal",
    titulo: "Contar sin se\xF1al",
    claves: [["senal", "internet", "conexion", "datos", "offline", "wifi"]],
    minimo: 1,
    respuesta: `Sin se\xF1al:
\u2022 El operador abre su enlace UNA vez con Wi-Fi o datos. Despu\xE9s puede contar y terminar sin conexi\xF3n.
\u2022 Lo que escribe queda guardado en el celular y se env\xEDa solo cuando vuelve la se\xF1al.
\u2022 No debe borrar los datos del navegador ni cambiar de celular con conteos sin enviar.
\u2022 El panel del administrador s\xED necesita internet.`
  },
  {
    id: "acceso_admin",
    titulo: "Entrar como administrador",
    claves: [["clave", "contrasena", "password", "codigo", "entrar", "acceso", "ingresar"], ["admin", "administrador", "panel", "olvide", "vence", "vencio", "celular", "otro"]],
    minimo: 2,
    respuesta: `Para entrar al panel:
\u2022 Administrador: escribe tu c\xF3digo personal (te lo da el creador). Sirve en UN solo celular, el primero donde lo usas, y tiene fecha de vencimiento.
\u2022 Si dice "ya se us\xF3 en otro celular" o "venci\xF3", pide un c\xF3digo nuevo.
\u2022 El creador entra con su cuenta y es quien crea o quita administradores.
Yo no puedo ver ni cambiar c\xF3digos.`
  },
  {
    id: "repartir",
    titulo: "Repartir pasillos entre operadores",
    claves: [["repartir", "reparto", "distribuir", "dividir", "organizar", "automatico"], ["pasillo", "operador", "persona", "inventario"]],
    minimo: 2,
    respuesta: `Para repartir pasillos sin hacerlo uno por uno:
\u2022 P\xEDdemelo: "crea el inventario para 10 operadores con todos los pasillos", "reparte seco entre 3 operadores" o "asigna los pasillos 05 al 10 a 2 operadores". Te dejo la propuesta.
\u2022 O en Personas y enlaces \u2192 "Repartir autom\xE1tico": eliges operadores y pasillos, "Vista previa" y "Repartir".
Reparte parejo por casillas, deja juntos los pasillos vecinos y respeta los que ya tienen persona.`
  },
  {
    id: "inicio",
    titulo: "C\xF3mo hacer el inventario del mes",
    claves: [["empezar", "empiezo", "iniciar", "inicio", "comenzar", "paso", "pasos", "nuevo", "mes", "hacer"], ["inventario", "conteo", "mes"]],
    minimo: 2,
    respuesta: `El inventario del mes, paso a paso:
1. Abre el panel y entra con tu c\xF3digo.
2. "+ Nuevo mes": nombre, fecha y cu\xE1ntos pasillos verifica cada persona.
3. Personas y enlaces: agrega a cada persona con sus pasillos (o "Repartir autom\xE1tico") y env\xEDale SOLO su enlace por WhatsApp.
4. En el Tablero escribe "Se cuenta con\u2026" (seg\xFAn sistema).
5. Toca "\u25B6 Iniciar inventario".
6. Al terminar cada uno, la app le asigna verificar a ciegas el pasillo de un compa\xF1ero.
7. Cruce y reconteos: resuelve diferencias.
8. Totales: descarga Excel y dashboard.
9. "\u25A0 Cerrar inventario".`
  },
  {
    id: "asignar",
    titulo: "Agregar personas y asignar pasillos",
    claves: [["asignar", "asignacion", "agregar", "anadir", "meter", "poner", "quitar"], ["pasillo", "persona", "operador", "gente", "verificacion"]],
    minimo: 2,
    respuesta: `En Personas y enlaces:
1. Escribe el nombre, marca sus pasillos y toca "Agregar y crear enlace".
2. Env\xEDale SOLO su enlace por WhatsApp.
3. Para darle otro pasillo: en su tarjeta elige el pasillo y si es Conteo o Verificaci\xF3n y toca "+ Asignar".
4. Para quitarlo toca la \xD7 junto al pasillo.
Tambi\xE9n puedes decirme "asigna el pasillo 05 a Ana".`
  },
  {
    id: "verificacion",
    titulo: "Verificaci\xF3n autom\xE1tica",
    claves: [["verificacion", "verificar", "verifica", "ciega", "companero"]],
    minimo: 1,
    respuesta: "Cuando una persona termina sus pasillos, la app le asigna sola verificar el pasillo de un compa\xF1ero que ya termin\xF3, a ciegas (no ve lo que cont\xF3 el otro). Si nadie ha terminado, queda esperando. Cu\xE1ntos pasillos verifica cada uno se define al crear el inventario."
  },
  {
    id: "reconteo",
    titulo: "Diferencias y reconteos",
    claves: [["reconteo", "recontar", "recuento", "diferencia", "descuadre", "cuadra", "cuadrar"]],
    minimo: 1,
    respuesta: `Para resolver diferencias:
1. Cruce y reconteos \u2192 elige el pasillo (los que tienen diferencias salen primero).
2. Marca las casillas en rojo (o ninguna para recontar todas).
3. Elige a alguien distinto de quien cont\xF3 y verific\xF3 y toca "Asignar reconteo".
4. Si el reconteo coincide con el conteo o la verificaci\xF3n, queda "Resuelto".
5. Tambi\xE9n puedes "Fijar valor" con un motivo.`
  },
  {
    id: "editar_inventario",
    titulo: "Editar, archivar o borrar inventarios",
    claves: [["editar", "edito", "renombrar", "borrar", "borro", "eliminar", "elimino", "archivar", "desarchivar", "antiguo", "viejo", "viejos", "anterior"]],
    minimo: 1,
    respuesta: `Elige el inventario arriba y toca "\u270E Editar":
\u2022 EDITAR: nombre, fecha o verificaciones \u2192 "Guardar cambios".
\u2022 ARCHIVAR: lo pasa a "Archivados" sin borrar nada.
\u2022 BORRAR: escribe el nombre exacto y toca "\u{1F5D1} Borrar inventario". Antes se guarda una copia completa en la nube. No se puede borrar uno en curso.
Yo no borro inventarios.`
  },
  {
    id: "cerrar",
    titulo: "Cerrar el inventario",
    claves: [["cerrar", "cierro", "terminar", "termino", "finalizar", "reabrir"], ["inventario", "mes"]],
    minimo: 2,
    respuesta: 'Toca "\u25A0 Cerrar inventario" en la franja de arriba. Te avisa cu\xE1ntos pasillos no est\xE1n cuadrados. Al cerrar, los enlaces dejan de funcionar. Si te equivocaste, toca "Reabrir". Antes descarga el Excel y el dashboard.'
  },
  {
    id: "excel",
    titulo: "Excel, dashboard y planillas",
    claves: [["excel", "dashboard", "dasboard", "informe", "reporte", "pdf", "imprimir", "planilla", "descargar"]],
    minimo: 1,
    respuesta: `En la pesta\xF1a Totales:
\u2022 "Descargar Excel": Resumen, Pasillos, Diferencias, Detalle, Personas y Bit\xE1cora.
\u2022 "Descargar dashboard": p\xE1gina con gr\xE1ficos; con "Imprimir / Guardar PDF" lo sacas en PDF.
\u2022 "Imprimir planilla": la plantilla de papel.
Escribe tu nombre en "Elabor\xF3" antes de descargar. En la APK el archivo se comparte (WhatsApp, Drive, correo).`
  },
  {
    id: "segun_sistema",
    titulo: "Seg\xFAn sistema vs contado",
    claves: [["sistema", "esperado", "cuenta con", "se cuenta"]],
    minimo: 1,
    respuesta: 'En el Tablero, en "Se cuenta con\u2026 (seg\xFAn sistema)", escribe cu\xE1ntas hay de cada \xEDtem seg\xFAn el sistema y toca "Guardar cantidades". Al lado sale lo contado y la diferencia: \u25BC faltan, \u25B2 sobran.'
  },
  {
    id: "item",
    titulo: "Agregar \xEDtems",
    claves: [["item", "items", "tipo", "color", "columna", "pallet", "estiba"], ["agregar", "nuevo", "crear", "ocultar", "quitar"]],
    minimo: 2,
    respuesta: 'Pasillos \u2192 "\xCDtems que se cuentan": nombre, color, si es estiba o canastilla, las secciones donde se cuenta y "+ Agregar \xEDtem". Sale como columna nueva en las planillas, los totales, el Excel y "Se cuenta con\u2026".'
  },
  {
    id: "pasillos",
    titulo: "Pasillos y m\xF3dulos",
    claves: [["pasillo", "modulo", "rack", "seccion"], ["agregar", "cambiar", "nuevo", "desactivar", "configurar", "lista", "cuantos", "multiplo"]],
    minimo: 2,
    respuesta: 'Pesta\xF1a Pasillos: cada pasillo usa los m\xF3dulos del 001 al "M\xF3dulo final" sin los m\xFAltiplos de 3 (001, 002, 004, 005\u2026). Si un pasillo es distinto, escribe la "Lista especial" separada por comas. Puedes cambiar el nombre o desactivarlo.'
  },
  {
    id: "observaciones",
    titulo: "Observaciones",
    claves: [["observacion", "nota", "comentario"]],
    minimo: 1,
    respuesta: 'El operador escribe "\u{1F4DD} Observaciones de este pasillo" debajo de su planilla. En el Tablero van las generales y por \xEDtem; en Cruce y reconteos, la tuya por pasillo. Todas salen en el Excel, el dashboard y la planilla impresa.'
  },
  {
    id: "canastillas",
    titulo: "Canastillas, pallets rojos y pilas",
    claves: [["canastilla", "roja", "rojo", "pila", "rack"]],
    minimo: 1,
    respuesta: `\u2022 Canastillas y pallets rojos se cuentan en su zona (pasillo ZC, por filas). Se puede sumar en la casilla, ej. 40+40+20.
\u2022 Las canastillas NO se suman en el total de estibas.
\u2022 Pilas: Rack 1 a 5 con azul, blanca y verde; la fila Pilas de "Se cuenta con\u2026" compara con esa secci\xF3n.`
  }
];
async function ultimoInventario(db, invId) {
  return invId || (await listarInventarios(db))[0]?.id || null;
}
async function estadoInventario(db, invId) {
  invId = await ultimoInventario(db, invId);
  if (!invId) return "No hay inventarios creados todav\xEDa.";
  let r;
  try {
    r = await resumenInventario(db, invId);
  } catch {
    return "No se encontr\xF3 el inventario abierto.";
  }
  const e = r.estados;
  const conDif = r.pasillos.filter((p) => p.estado === "diferencias").map((p) => p.codigo);
  const personas = r.participantes.map((p) => `${p.nombre} (${p.estado}${p.salidas ? `, sali\xF3 ${p.salidas} veces` : ""})`);
  const esp = r.esperados.filas.filter((f) => f.esperado !== null).map((f) => `${f.nombre}: sistema ${f.esperado}, contado ${f.contado}`);
  return [
    `Inventario abierto: "${r.inventario.nombre}" (id ${r.inventario.id}), fecha ${r.inventario.fecha}, estado ${r.inventario.estado}.`,
    `Pasillos: ${r.pasillos.length} \xB7 cuadrados ${e.cuadrado || 0} \xB7 con diferencias ${e.diferencias || 0}${conDif.length ? ` (${conDif.join(", ")})` : ""} \xB7 sin asignar ${e.sin_asignar || 0}.`,
    `Total estibas contadas: ${r.global.total}; canastillas: ${r.global.canastillas}.`,
    esp.length ? `Seg\xFAn sistema vs contado: ${esp.join("; ")}.` : "A\xFAn no se escribieron cantidades seg\xFAn sistema.",
    `Personas (${personas.length}): ${personas.join(", ") || "ninguna"}.`,
    r.inventario.observaciones ? `Observaciones generales: ${r.inventario.observaciones}` : ""
  ].filter(Boolean).join("\n");
}
async function problemas(db, invId) {
  const avisos = [];
  if (!invId) return ["No hay inventario abierto."];
  const r = await resumenInventario(db, invId);
  if (r.inventario.estado === "preparacion") avisos.push('El inventario a\xFAn no est\xE1 iniciado: nadie puede contar hasta que toques "\u25B6 Iniciar inventario".');
  const sinAsignar = r.pasillos.filter((p) => p.estado === "sin_asignar").map((p) => p.codigo);
  if (sinAsignar.length) avisos.push(`${sinAsignar.length} pasillo(s) sin persona asignada: ${sinAsignar.slice(0, 20).join(", ")}${sinAsignar.length > 20 ? "\u2026" : ""}.`);
  const dif = r.pasillos.filter((p) => p.estado === "diferencias").map((p) => p.codigo);
  if (dif.length) avisos.push(`${dif.length} pasillo(s) con diferencias: ${dif.join(", ")}.`);
  const sinAbrir = r.participantes.filter((p) => p.estado === "pendiente").map((p) => p.nombre);
  if (sinAbrir.length && r.inventario.estado === "en_curso") avisos.push(`No han abierto su enlace: ${sinAbrir.join(", ")}.`);
  const salen = r.participantes.filter((p) => p.salidas > 0).map((p) => `${p.nombre} (${p.salidas})`);
  if (salen.length) avisos.push(`Salieron de la app mientras contaban: ${salen.join(", ")}.`);
  for (const x of await db.prepare("SELECT mensaje FROM aura_alertas WHERE estado = 'abierta' AND nivel <> 'info' AND (inventario_id = ? OR inventario_id IS NULL) ORDER BY id DESC LIMIT 8").all(invId)) {
    if (!avisos.some((v) => v.includes(x.mensaje.slice(0, 30)))) avisos.push(`Agentes: ${x.mensaje}`);
  }
  if (r.esperados.filas.every((f) => f.esperado === null)) avisos.push('No se han escrito las cantidades "Se cuenta con\u2026" (seg\xFAn sistema).');
  return avisos;
}
var DINAMICAS = [
  {
    id: "estado",
    claves: [["como va", "avance", "resumen", "estado", "progreso", "vamos", "total", "cuantas", "cuantos", "llevamos"]],
    minimo: 1,
    responder: async (db, invId) => `As\xED va el inventario:
${await estadoInventario(db, invId)}`
  },
  {
    id: "diferencias",
    claves: [["diferencia", "descuadre", "cuadra", "cuadran", "reconteo", "recontar"], ["cuale", "que", "hay", "tienen", "quien", "pasillo", "pasillos", "lista"]],
    minimo: 2,
    responder: async (db, invId) => {
      const r = await resumenInventario(db, invId);
      const dif = r.pasillos.filter((p) => p.estado === "diferencias" || p.resumen.revisar > 0);
      if (!dif.length) return "\u2713 Ahora no hay pasillos con diferencias entre conteo y verificaci\xF3n.";
      return `Pasillos con diferencias:
${dif.map((p) => `\u2022 ${p.codigo} (${p.seccion}): ${p.resumen.diferencia + p.resumen.revisar} casilla(s) \xB7 cont\xF3 ${p.conto?.persona || "\u2014"}, verific\xF3 ${p.verifico?.persona || "\u2014"}`).join("\n")}

Para el reconteo elige a alguien distinto de quien cont\xF3 y verific\xF3 (Cruce y reconteos).`;
    }
  },
  {
    id: "personas",
    claves: [["quien", "quiene", "falta", "faltan", "trabajando", "contando", "personas"]],
    minimo: 1,
    responder: async (db, invId) => {
      const ps = await participantes(db, invId);
      if (!ps.length) return "Todav\xEDa no hay personas en este inventario. Agr\xE9galas en Personas y enlaces.";
      const grupo = (e) => ps.filter((p) => p.estado === e);
      const linea = (p) => `${p.nombre} (${p.asignaciones.map((a) => `${a.pasillo}${a.estado === "terminada" ? "\u2713" : ""}`).join(", ") || "sin pasillos"})${p.salidas ? ` \u26A0 sali\xF3 ${p.salidas}` : ""}`;
      return [
        grupo("activo").length ? `Contando: ${grupo("activo").map(linea).join("; ")}` : null,
        grupo("pendiente").length ? `Sin abrir el enlace: ${grupo("pendiente").map(linea).join("; ")}` : null,
        grupo("terminado").length ? `Terminaron: ${grupo("terminado").map((p) => p.nombre).join(", ")}` : null
      ].filter(Boolean).join("\n");
    }
  },
  {
    id: "problemas",
    claves: [["problema", "revisa", "revisar", "diagnostico", "falla", "fallas", "error", "errores", "pendiente"]],
    minimo: 1,
    responder: async (db, invId) => {
      const a = await problemas(db, invId);
      return a.length ? `Revis\xE9 el inventario:
${a.map((x) => `\u2022 ${x}`).join("\n")}` : "\u2713 Revis\xE9 el inventario: no veo problemas.";
    }
  }
];
var SECCIONES_TXT = { seco: "SECO", lacteo: "LACTEOS", lacteos: "LACTEOS", temperado: "TEMPERADO", fruver: "FRUVER", congelado: "CONGELADO", pila: "PILAS", pilas: "PILAS", rack: "PILAS", racks: "PILAS", canastilla: "CANASTILLAS", canastillas: "CANASTILLAS" };
function interpretarOrden(texto) {
  const q = normal(texto);
  if (!/\b(crea|crear|creame|arma|armar|armame|reparte|repartir|repartelos|asigna|asignar|organiza|organizar|prepara|preparar|distribuye|distribuir|divide|dividir|monta|montar)\b/.test(q)) return null;
  const cuantos = q.match(/\b(\d{1,3})\s*(operador|operadores|persona|personas|contador|contadores|trabajador|trabajadores)\b/);
  if (!cuantos) return null;
  const args = { cantidad: Number(cuantos[1]) };
  const porPersona = q.match(/\b(\d{1,2})\s*pasillos?\s*(por|a cada|cada|para cada)\b/) || q.match(/\b(?:de|con)\s*(\d{1,2})\s*pasillos?\s*(?:cada uno|c\/u|por persona)/);
  if (porPersona) args.por_persona = Number(porPersona[1]);
  const partes = [];
  for (const [txt, cod] of Object.entries(SECCIONES_TXT)) if (new RegExp(`\\b${txt}\\b`).test(q) && !partes.includes(cod)) partes.push(cod);
  for (const m of q.matchAll(/\b([a-z]{0,2})\s?(\d{1,3})\s*(?:al|a|hasta|-)\s*([a-z]{0,2})\s?(\d{1,3})\b/g)) {
    if (/operador|persona/.test(q.slice(m.index + m[0].length, m.index + m[0].length + 12))) continue;
    partes.push(`${m[1].toUpperCase()}${m[2].padStart(2, "0")}-${(m[3] || m[1]).toUpperCase()}${m[4].padStart(2, "0")}`);
  }
  if (!/\btodo|todos|total|completo|completa|toda\b/.test(q) && partes.length) args.pasillos = partes.join(",");
  else args.pasillos = "todos";
  if (/\b(nuevo|nueva|otro)\b.*\binventario|\binventario\b.*\b(nuevo|nueva)\b/.test(q)) args.nuevo_inventario = "";
  return { accion: "proponer_repartir", args };
}
async function responderLocal(db, texto, { invId } = {}) {
  const q = normal(texto);
  if (!q || q.split(" ").length > 40) return null;
  const orden = interpretarOrden(texto);
  if (orden) return { orden, id: "orden_repartir", titulo: "Armar inventario" };
  if (ORDEN2.test(q) && !PREGUNTA.test(q)) return null;
  invId = await ultimoInventario(db, invId);
  const guardadas = await db.prepare("SELECT * FROM aura_respuestas").all();
  const mejorG = guardadas.map((g) => ({ g, s: parecido(texto, g.pregunta) })).sort((a, b) => b.s - a.s)[0];
  if (mejorG && mejorG.s >= 0.6) {
    await db.prepare("UPDATE aura_respuestas SET usos = usos + 1 WHERE id = ?").run(mejorG.g.id);
    return { respuesta: mejorG.g.respuesta, id: `guardada-${mejorG.g.id}`, titulo: mejorG.g.fuente === "copilot" ? "Aprendido de Copilot" : "Respuesta guardada" };
  }
  const candidatos = [
    ...invId ? DINAMICAS.map((d) => ({ ...d, dinamica: true })) : [],
    ...BASE
  ].filter((c) => !c.corta || q.split(" ").length <= 4).map((c) => ({ c, ...puntaje(q, c.claves) })).filter((x) => x.s >= x.c.minimo).sort((a, b) => b.s / b.c.claves.length - a.s / a.c.claves.length || b.exactos - a.exactos || b.s - a.s);
  const mejor = candidatos[0];
  const segundo = candidatos[1];
  const empate = mejor && segundo && segundo.s === mejor.s && segundo.exactos === mejor.exactos && segundo.c.claves.length === mejor.c.claves.length && mejor.s < 2;
  if (mejor && !empate) {
    try {
      const respuesta = mejor.c.dinamica ? await mejor.c.responder(db, invId) : mejor.c.respuesta;
      return { respuesta, id: mejor.c.id, titulo: mejor.c.titulo || "Datos del momento" };
    } catch {
    }
  }
  const notas = await db.prepare("SELECT * FROM aura_notas ORDER BY id DESC LIMIT 300").all();
  const mejorN = notas.map((n2) => ({ n: n2, s: parecido(texto, n2.texto) })).sort((a, b) => b.s - a.s)[0];
  if (mejorN && mejorN.s >= 0.35) {
    return { respuesta: `Esto es lo que aprend\xED${mejorN.n.tema === "copilot" ? " de THEMENDO (Copilot)" : ""}:
${mejorN.n.texto}`, id: `nota-${mejorN.n.id}`, titulo: "Lo aprendido" };
  }
  return null;
}
async function buscarPersona(db, invId, nombre) {
  const todas = await db.prepare("SELECT * FROM participantes WHERE inventario_id = ?").all(invId);
  const n2 = normal(nombre);
  const exactas = todas.filter((p) => normal(p.nombre) === n2);
  const parecidas = exactas.length ? exactas : todas.filter((p) => normal(p.nombre).includes(n2));
  if (parecidas.length === 1) return parecidas[0];
  if (!parecidas.length) throw new ErrorNegocio(`No encuentro a "${nombre}" en este inventario. Personas: ${todas.map((p) => p.nombre).join(", ") || "ninguna"}`);
  throw new ErrorNegocio(`Hay varias personas que coinciden con "${nombre}": ${parecidas.map((p) => p.nombre).join(", ")}`);
}
async function buscarPasillo(db, codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  const p = await db.prepare("SELECT p.*, s.nombre AS seccion FROM pasillos p JOIN secciones s ON s.id = p.seccion_id WHERE UPPER(p.codigo) = ? OR UPPER(p.codigo) = ?").get(c, c.padStart(2, "0"));
  if (!p) throw new ErrorNegocio(`No existe el pasillo "${codigo}"`);
  return p;
}
var necesitaInventario = (ctx) => {
  if (!ctx.invId) throw new ErrorNegocio("No hay un inventario abierto en el panel");
  return ctx.invId;
};
var PROPUESTAS = {
  proponer_enlace_nuevo: {
    preparar: async (ctx, a) => {
      const p = await buscarPersona(ctx.db, necesitaInventario(ctx), a.persona);
      return { datos: { participante_id: p.id }, resumen: `Crear un enlace nuevo para ${p.nombre} (el anterior deja de servir).` };
    },
    ejecutar: async (ctx, d) => {
      const p = await nuevoEnlace(ctx.db, d.inventario_id, d.participante_id);
      return `Enlace nuevo creado para ${p.nombre}. Env\xEDaselo desde "Personas y enlaces".`;
    }
  },
  proponer_asignacion: {
    preparar: async (ctx, a) => {
      const id2 = necesitaInventario(ctx);
      const p = await buscarPersona(ctx.db, id2, a.persona);
      const pa = await buscarPasillo(ctx.db, a.pasillo);
      const tipo = a.tipo === "verificacion" ? "verificacion" : "conteo";
      return { datos: { participante_id: p.id, pasillo_id: pa.id, tipo }, resumen: `Asignar a ${p.nombre} el pasillo ${pa.codigo} para ${tipo === "conteo" ? "contar" : "verificar"}.` };
    },
    ejecutar: async (ctx, d) => {
      await asignarManual(ctx.db, d.inventario_id, d);
      return "Asignado. Le aparece en el celular en unos segundos (si ya hab\xEDa terminado, necesita su enlace nuevo).";
    }
  },
  proponer_quitar_asignacion: {
    preparar: async (ctx, a) => {
      const id2 = necesitaInventario(ctx);
      const p = await buscarPersona(ctx.db, id2, a.persona);
      const pa = await buscarPasillo(ctx.db, a.pasillo);
      const asig = await ctx.db.prepare("SELECT * FROM asignaciones WHERE inventario_id=? AND participante_id=? AND pasillo_id=? AND tipo=? AND estado<>'anulada' ORDER BY id DESC").get(id2, p.id, pa.id, a.tipo);
      if (!asig) throw new ErrorNegocio(`${p.nombre} no tiene ${a.tipo} en ${pa.codigo}`);
      return { datos: { asignacion_id: asig.id }, resumen: `Quitar a ${p.nombre} el ${a.tipo} del pasillo ${pa.codigo}${asig.estado === "terminada" ? " (ya estaba terminado: se descarta lo que cont\xF3)" : ""}.` };
    },
    ejecutar: async (ctx, d) => {
      await anularAsignacion(ctx.db, d.inventario_id, d.asignacion_id);
      return "Asignaci\xF3n quitada.";
    }
  },
  proponer_reconteo: {
    preparar: async (ctx, a) => {
      const id2 = necesitaInventario(ctx);
      const pa = await buscarPasillo(ctx.db, a.pasillo);
      let persona;
      try {
        persona = await buscarPersona(ctx.db, id2, a.persona);
      } catch {
        persona = null;
      }
      const celdas = Array.isArray(a.celdas) && a.celdas.length ? a.celdas : void 0;
      return {
        datos: { pasillo_id: pa.id, celdas, ...persona ? { participante_id: persona.id } : { nombre: String(a.persona).trim() } },
        resumen: `Reconteo en ${pa.codigo} para ${persona ? persona.nombre : `${a.persona} (persona nueva)`}: ${celdas ? `${celdas.length} casilla(s)` : "todas las diferencias"}.`
      };
    },
    ejecutar: async (ctx, d) => {
      const r = await asignarReconteo(ctx.db, d.inventario_id, d);
      return `Reconteo asignado a ${r.participante.nombre} (${r.asignacion.celdas.length} casillas).`;
    }
  },
  proponer_estado_inventario: {
    preparar: async (ctx, a) => {
      const i = await obtenerInventario(ctx.db, necesitaInventario(ctx));
      const txtE = { en_curso: i.estado === "cerrado" ? "Reabrir" : "Iniciar", cerrado: "Cerrar" }[a.estado];
      if (!txtE) throw new ErrorNegocio("Estado no v\xE1lido");
      return { datos: { estado: a.estado }, resumen: `${txtE} el inventario "${i.nombre}".` };
    },
    ejecutar: async (ctx, d) => {
      const i = await cambiarEstado(ctx.db, d.inventario_id, d.estado);
      return `Inventario ahora: ${i.estado}.`;
    }
  },
  proponer_repartir: {
    preparar: async (ctx, a) => {
      const actual = ctx.invId ? await obtenerInventario(ctx.db, ctx.invId) : null;
      const mes = (/* @__PURE__ */ new Date()).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" });
      const crear = a.nuevo_inventario || !actual || actual.estado === "cerrado" ? String(a.nuevo_inventario || `Inventario ${mes}`).slice(0, 80) : null;
      const args = { nombres: Array.isArray(a.nombres) && a.nombres.length ? a.nombres : void 0, cantidad: a.cantidad ? Number(a.cantidad) : void 0, pasillos: a.pasillos || "todos", por_persona: a.por_persona ? Number(a.por_persona) : void 0 };
      const plan = await planRepartir(ctx.db, crear ? 0 : actual.id, args);
      const total = plan.grupos.reduce((x, g) => x + g.pasillos.length, 0);
      const lineas = plan.grupos.map((g) => `${g.nombre}: ${g.pasillos.join(", ")}`).join(" \xB7 ");
      const extras = [plan.ya_asignados.length ? `ya ten\xEDan persona: ${plan.ya_asignados.join(", ")}` : "", plan.sobrantes.length ? `quedan sin asignar: ${plan.sobrantes.join(", ")}` : "", plan.sin_pasillos.length ? `sin pasillos: ${plan.sin_pasillos.join(", ")}` : ""].filter(Boolean).join("; ");
      return {
        datos: { crear, args },
        resumen: `${crear ? `Crear el inventario "${crear}" y repartir` : `Repartir en "${actual.nombre}"`} ${total} pasillo(s) entre ${plan.grupos.length} operador(es) \u2192 ${lineas}${extras ? ` (${extras})` : ""}.`
      };
    },
    ejecutar: async (ctx, d) => {
      let invId = d.inventario_id;
      if (d.crear) invId = (await crearInventario(ctx.db, { nombre: d.crear })).id;
      const r = await repartir(ctx.db, invId, d.args);
      return `${d.crear ? `Inventario "${d.crear}" creado. ` : ""}${r.grupos.length} operador(es) con sus pasillos y enlaces listos. Ahora env\xEDa los enlaces (Personas y enlaces \u2192 Copiar todos los enlaces), escribe "Se cuenta con\u2026" y toca "Iniciar inventario".${d.crear ? " Elige el inventario nuevo en la lista de arriba." : ""}`;
    }
  }
};
var AGENTES = {
  datos: { nombre: "Guardi\xE1n de datos", icono: "\u{1F6E1}\uFE0F", hace: "Revisa valores raros, quien cont\xF3 y verific\xF3 lo mismo, asignaciones hu\xE9rfanas y pasillos desactivados." },
  avance: { nombre: "Supervisor del conteo", icono: "\u{1F4CB}", hace: "Vigila diferencias sin reconteo, reconteos que no cuadran, pasillos sin persona y personas detenidas." }
};
var LECCIONES = {
  diferencias_sin_reconteo: "Cuando un pasillo queda con diferencias, se resuelve asignando el reconteo de esas casillas a alguien distinto de quien cont\xF3 y verific\xF3.",
  reconteo_no_cuadra: "Si un reconteo no coincide ni con el conteo ni con la verificaci\xF3n, se pide otro reconteo a una tercera persona o el admin fija el valor con motivo.",
  pasillo_sin_asignar: "Con el inventario en curso, todo pasillo activo debe tener una persona asignada para contar; si no, nunca se cuadra.",
  asignacion_huerfana: "Si una persona termin\xF3 pero tiene pasillos pendientes, necesita un enlace nuevo (al asignarle algo, la app la reabre sola).",
  valor_raro: "Un valor muy alto en una casilla suele ser un error de digitaci\xF3n (ej. 44 en vez de 4); se confirma con reconteo.",
  salidas_app: "Si alguien sale muchas veces de la app mientras cuenta, conviene revisar su conteo o pedirle fijar la aplicaci\xF3n en el celular."
};
var minutosDesde = (fecha) => fecha ? (Date.now() - Date.parse(`${fecha.replace(" ", "T")}-05:00`)) / 6e4 : null;
async function leerAjuste(db, clave, defecto) {
  const f = await db.prepare("SELECT valor FROM ajustes WHERE clave = ?").get(clave);
  try {
    return f ? { ...defecto, ...JSON.parse(f.valor) } : { ...defecto };
  } catch {
    return { ...defecto };
  }
}
async function guardarAjuste(db, clave, valor) {
  await db.prepare("INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor").run(clave, JSON.stringify(valor));
}
function crearVigilantes(db, { crearPropuesta, ejecutarPropuesta }) {
  const estado = { automaticas: [] };
  const config = () => leerAjuste(db, "vigilantes", { auto_reconteo: false, activos: true });
  const configurar = async (cambios) => {
    const n2 = { ...await config(), ...cambios };
    await guardarAjuste(db, "vigilantes", n2);
    return n2;
  };
  async function quienRecuenta(invId, pasilloId) {
    const involucrados = new Set((await db.prepare("SELECT participante_id FROM asignaciones WHERE inventario_id = ? AND pasillo_id = ? AND estado <> 'anulada'").all(invId, pasilloId)).map((x) => x.participante_id));
    const libres = (await db.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM asignaciones a WHERE a.participante_id = p.id AND a.estado IN ('pendiente','en_curso')) AS pendientes,
              (SELECT COUNT(*) FROM asignaciones a WHERE a.participante_id = p.id AND a.estado <> 'anulada') AS total
         FROM participantes p WHERE p.inventario_id = ? ORDER BY p.id`
    ).all(invId)).filter((p) => !involucrados.has(p.id));
    libres.sort((a, b) => a.pendientes - b.pendientes || (a.estado === "activo" ? 0 : 1) - (b.estado === "activo" ? 0 : 1) || a.total - b.total);
    return libres[0] || null;
  }
  async function revisarDatos(invId) {
    const h = [];
    if (!invId) return h;
    const raros = await db.prepare(
      `SELECT c.modulo, c.color, c.valor, p.codigo, p.id AS pasillo_id, pe.nombre, a.tipo FROM conteos c
         JOIN asignaciones a ON a.id = c.asignacion_id JOIN pasillos p ON p.id = a.pasillo_id
         JOIN participantes pe ON pe.id = a.participante_id JOIN colores co ON co.codigo = c.color
        WHERE a.inventario_id = ? AND a.estado <> 'anulada' AND c.valor > CASE co.unidad WHEN 'canastilla' THEN 400 ELSE 20 END`
    ).all(invId);
    const finales = /* @__PURE__ */ new Map();
    for (const r of raros) {
      if (!finales.has(r.pasillo_id)) finales.set(r.pasillo_id, new Map((await cruce(db, invId, r.pasillo_id)).filas.map((f2) => [`${f2.modulo}|${f2.color}`, f2])));
      const f = finales.get(r.pasillo_id).get(`${r.modulo}|${r.color}`);
      if (f && !["diferencia", "revisar", "sin_verificar", "verificando", "pendiente"].includes(f.estado) && f.final !== r.valor) continue;
      h.push({
        tipo: "valor_raro",
        clave: `valor_raro:${invId}:${r.codigo}:${r.modulo}:${r.color}:${r.valor}`,
        nivel: "aviso",
        mensaje: `Valor muy alto en ${r.codigo} m\xF3dulo ${r.modulo} (${r.color}): ${r.valor}, digitado por ${r.nombre} (${r.tipo}).`,
        sugerencia: "Puede ser un error de digitaci\xF3n. Rev\xEDsalo en Cruce y reconteos; si la verificaci\xF3n no coincide, pide reconteo."
      });
    }
    for (const r of await db.prepare(
      `SELECT p.codigo, pe.nombre FROM asignaciones c JOIN asignaciones v ON v.pasillo_id = c.pasillo_id AND v.inventario_id = c.inventario_id
         JOIN pasillos p ON p.id = c.pasillo_id JOIN participantes pe ON pe.id = c.participante_id
        WHERE c.inventario_id = ? AND c.tipo = 'conteo' AND v.tipo = 'verificacion' AND c.participante_id = v.participante_id
          AND c.estado <> 'anulada' AND v.estado <> 'anulada'`
    ).all(invId)) {
      h.push({
        tipo: "autoverificacion",
        clave: `autoverificacion:${invId}:${r.codigo}`,
        nivel: "critico",
        mensaje: `${r.nombre} cont\xF3 y verific\xF3 el mismo pasillo ${r.codigo}: la verificaci\xF3n no es independiente.`,
        sugerencia: `Quita su verificaci\xF3n de ${r.codigo} y as\xEDgnasela a otra persona.`
      });
    }
    for (const r of await db.prepare(
      `SELECT pe.nombre, p.codigo, a.tipo FROM asignaciones a JOIN participantes pe ON pe.id = a.participante_id JOIN pasillos p ON p.id = a.pasillo_id
        WHERE a.inventario_id = ? AND a.estado IN ('pendiente','en_curso') AND pe.estado = 'terminado'`
    ).all(invId)) {
      h.push({
        tipo: "asignacion_huerfana",
        clave: `huerfana:${invId}:${r.nombre}:${r.codigo}:${r.tipo}`,
        nivel: "aviso",
        mensaje: `${r.nombre} ya termin\xF3, pero tiene ${r.codigo} (${r.tipo}) pendiente: su enlace est\xE1 cerrado.`,
        sugerencia: `Crea un enlace nuevo para ${r.nombre} o as\xEDgnale el pasillo a otra persona.`,
        arreglo: { accion: "proponer_enlace_nuevo", args: { persona: r.nombre } }
      });
    }
    for (const r of await db.prepare(
      `SELECT DISTINCT p.codigo FROM asignaciones a JOIN pasillos p ON p.id = a.pasillo_id
        WHERE a.inventario_id = ? AND a.estado IN ('pendiente','en_curso') AND p.activo = 0`
    ).all(invId)) {
      h.push({
        tipo: "pasillo_inactivo",
        clave: `inactivo:${invId}:${r.codigo}`,
        nivel: "aviso",
        mensaje: `El pasillo ${r.codigo} est\xE1 desactivado pero alguien lo tiene asignado.`,
        sugerencia: "Act\xEDvalo en Pasillos o quita esa asignaci\xF3n."
      });
    }
    return h;
  }
  async function revisarAvance2(invId) {
    const h = [];
    if (!invId) return h;
    const i = await obtenerInventario(db, invId);
    if (i.estado !== "en_curso") return h;
    const r = await resumenInventario(db, invId);
    const sinAsignar = r.pasillos.filter((p) => p.estado === "sin_asignar").map((p) => p.codigo);
    if (sinAsignar.length) {
      h.push({
        tipo: "pasillo_sin_asignar",
        clave: `sin_asignar:${invId}`,
        nivel: "aviso",
        mensaje: `${sinAsignar.length} pasillo(s) sin persona para contar: ${sinAsignar.slice(0, 15).join(", ")}${sinAsignar.length > 15 ? "\u2026" : ""}.`,
        sugerencia: "As\xEDgnalos en Personas y enlaces; si no se cuentan, el inventario nunca cuadra."
      });
    }
    for (const p of r.pasillos) {
      const dif = p.resumen.diferencia || 0;
      const revisar2 = p.resumen.revisar || 0;
      if (dif + revisar2 > 0 && !(p.resumen.en_reconteo || 0)) {
        const quien = await quienRecuenta(invId, p.id);
        const tipo = revisar2 > 0 ? "reconteo_no_cuadra" : "diferencias_sin_reconteo";
        h.push({
          tipo,
          clave: `${tipo}:${invId}:${p.codigo}:${dif}:${revisar2}:${p.reconteos}`,
          nivel: "aviso",
          pasilloId: p.id,
          mensaje: revisar2 > 0 ? `En ${p.codigo} el reconteo no coincidi\xF3 con el conteo ni con la verificaci\xF3n (${revisar2} casilla(s)).` : `${p.codigo} tiene ${dif} casilla(s) con diferencias y nadie las est\xE1 recontando.`,
          sugerencia: quien ? `Que las recuente ${quien.nombre} (no particip\xF3 en ese pasillo${quien.estado === "terminado" ? "; se le crea enlace nuevo" : ""}).` : "Agrega una persona nueva para el reconteo (todos ya participaron en ese pasillo).",
          arreglo: quien ? { accion: "proponer_reconteo", args: { pasillo: p.codigo, persona: quien.nombre } } : null
        });
      }
    }
    for (const a of await db.prepare(
      `SELECT pe.nombre, p.codigo, a.tipo, a.iniciado_en, (SELECT MAX(c.actualizado_en) FROM conteos c WHERE c.asignacion_id = a.id) AS ultimo
         FROM asignaciones a JOIN participantes pe ON pe.id = a.participante_id JOIN pasillos p ON p.id = a.pasillo_id
        WHERE a.inventario_id = ? AND a.estado = 'en_curso'`
    ).all(invId)) {
      const quieto = minutosDesde(a.ultimo || a.iniciado_en);
      if (quieto !== null && quieto > 25) h.push({ tipo: "conteo_detenido", clave: `detenido:${invId}:${a.nombre}:${a.codigo}:${a.tipo}`, nivel: "info", mensaje: `${a.nombre} lleva ${Math.round(quieto)} min sin anotar nada en ${a.codigo} (${a.tipo}).`, sugerencia: "Preg\xFAntale si tiene problemas de se\xF1al o con el celular. Lo que ya escribi\xF3 est\xE1 guardado." });
    }
    for (const p of r.participantes) {
      if (p.salidas >= 3) h.push({ tipo: "salidas_app", clave: `salidas:${invId}:${p.id}`, nivel: "aviso", mensaje: `${p.nombre} ha salido ${p.salidas} veces de la app mientras cuenta.`, sugerencia: "Revisa su conteo con m\xE1s cuidado o p\xEDdele fijar la aplicaci\xF3n en el celular." });
      if (p.estado === "pendiente" && p.asignaciones.length && minutosDesde(i.creado_en) > 15) h.push({ tipo: "enlace_sin_abrir", clave: `sin_abrir:${invId}:${p.id}`, nivel: "info", mensaje: `${p.nombre} no ha abierto su enlace.`, sugerencia: "Reenv\xEDale su enlace desde Personas y enlaces." });
    }
    if (r.pasillos.length && r.pasillos.every((p) => p.estado === "cuadrado")) {
      h.push({ tipo: "listo_para_cerrar", clave: `listo:${invId}`, nivel: "info", mensaje: "Todos los pasillos est\xE1n cuadrados.", sugerencia: "Descarga el Excel y el dashboard y cierra el inventario." });
    }
    return h;
  }
  async function registrar(agente, invId, hallazgos) {
    const vistas = /* @__PURE__ */ new Set();
    for (const x of hallazgos) {
      vistas.add(x.clave);
      const previa = await db.prepare("SELECT * FROM aura_alertas WHERE clave = ?").get(x.clave);
      if (!previa) {
        await db.prepare("INSERT INTO aura_alertas (inventario_id, agente, tipo, clave, nivel, mensaje, sugerencia, arreglo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(invId, agente, x.tipo, x.clave, x.nivel, x.mensaje, x.sugerencia || null, x.arreglo ? JSON.stringify(x.arreglo) : null);
      } else if (previa.estado !== "descartada") {
        await db.prepare("UPDATE aura_alertas SET estado = 'abierta', mensaje = ?, sugerencia = ?, arreglo = ?, nivel = ?, veces = veces + 1, actualizado_en = datetime('now','localtime'), resuelto_en = NULL WHERE id = ?").run(x.mensaje, x.sugerencia || null, x.arreglo ? JSON.stringify(x.arreglo) : null, x.nivel, previa.id);
      }
    }
    for (const a of await db.prepare("SELECT * FROM aura_alertas WHERE agente = ? AND estado = 'abierta'").all(agente)) {
      if (vistas.has(a.clave)) continue;
      await db.prepare("UPDATE aura_alertas SET estado = 'resuelta', resuelto_en = datetime('now','localtime') WHERE id = ?").run(a.id);
      const leccion = LECCIONES[a.tipo];
      if (leccion && !await db.prepare("SELECT 1 AS x FROM aura_notas WHERE texto = ?").get(leccion)) {
        await db.prepare("INSERT INTO aura_notas (texto, tema) VALUES (?, 'vigilancia')").run(leccion);
      }
    }
  }
  async function corregirSolo(invId, hallazgos) {
    if (!(await config()).auto_reconteo) return;
    for (const x of hallazgos) {
      if (!x.arreglo || x.arreglo.accion !== "proponer_reconteo") continue;
      try {
        const quien = x.pasilloId ? await quienRecuenta(invId, x.pasilloId) : null;
        if (!quien) continue;
        const args = { ...x.arreglo.args, persona: quien.nombre };
        const p = await crearPropuesta(invId, x.arreglo.accion, args);
        const r = await ejecutarPropuesta(p.id, { automatica: true });
        estado.automaticas.push({ cuando: (/* @__PURE__ */ new Date()).toISOString(), pasillo: args.pasillo, persona: args.persona, estado: r.estado });
        estado.automaticas = estado.automaticas.slice(-20);
      } catch {
      }
    }
  }
  async function inventarioActivo(invId) {
    if (invId) return invId;
    return (await db.prepare("SELECT id FROM inventarios WHERE estado = 'en_curso' ORDER BY id DESC").get())?.id || (await db.prepare("SELECT id FROM inventarios ORDER BY id DESC").get())?.id || null;
  }
  async function revisar(invId) {
    const id2 = await inventarioActivo(invId);
    await registrar("datos", id2, await revisarDatos(id2));
    const avance = await revisarAvance2(id2);
    await registrar("avance", id2, avance);
    await corregirSolo(id2, avance);
    if ((await config()).auto_reconteo && avance.some((x) => x.arreglo?.accion === "proponer_reconteo")) await registrar("avance", id2, await revisarAvance2(id2));
    await guardarAjuste(db, "vigilantes_ultima", { cuando: ahora() });
    return resumen(id2);
  }
  async function resumen(invId) {
    const alertas = (await db.prepare("SELECT * FROM aura_alertas WHERE estado = 'abierta' ORDER BY CASE nivel WHEN 'critico' THEN 0 WHEN 'aviso' THEN 1 ELSE 2 END, id DESC").all()).filter((a) => !invId || a.inventario_id === null || a.inventario_id === invId).map((a) => ({ ...a, arreglo: a.arreglo ? JSON.parse(a.arreglo) : null }));
    const resueltas = await db.prepare("SELECT id, agente, nivel, mensaje, resuelto_en FROM aura_alertas WHERE estado = 'resuelta' ORDER BY resuelto_en DESC LIMIT 15").all();
    const ultima = await leerAjuste(db, "vigilantes_ultima", { cuando: null });
    return {
      config: await config(),
      ultima_revision: ultima.cuando,
      ultimo_respaldo: null,
      automaticas: estado.automaticas,
      agentes: Object.entries(AGENTES).map(([id2, a]) => ({ id: id2, ...a, abiertas: alertas.filter((x) => x.agente === id2).length })),
      alertas,
      resueltas
    };
  }
  async function descartar(id2) {
    const a = await db.prepare("SELECT * FROM aura_alertas WHERE id = ?").get(id2);
    if (!a) throw new ErrorNegocio("Alerta no encontrada", 404);
    await db.prepare("UPDATE aura_alertas SET estado = 'descartada', resuelto_en = datetime('now','localtime') WHERE id = ?").run(id2);
    return { ok: true };
  }
  async function proponerArreglo(id2) {
    const a = await db.prepare("SELECT * FROM aura_alertas WHERE id = ? AND estado = 'abierta'").get(id2);
    if (!a || !a.arreglo) throw new ErrorNegocio("Esta alerta no tiene un arreglo autom\xE1tico", 409);
    const { accion, args } = JSON.parse(a.arreglo);
    return crearPropuesta(a.inventario_id, accion, args);
  }
  return { AGENTES, revisar, resumen, descartar, proponerArreglo, configurar, config, quienRecuenta };
}
var TEMA_INVENTARIO = /(inventari|estiba|pallet|palet|canastilla|pasillo|reconteo|conteo|verificaci|cedi|operador|bodega|almacen)/;
function leccionDeCopilot(l) {
  const lineas = String(l.texto || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const cuerpo = lineas.filter((y) => !/^lecci[oó]n\b/i.test(y) && !/^fecha\s*:/i.test(y));
  const texto = cuerpo.join(" \xB7 ").replace(/\s+/g, " ").slice(0, 1500);
  return texto;
}
function crearAura(db) {
  const contexto = (invId) => ({ db, invId: invId || null });
  async function crearPropuesta(ctx, accion, args) {
    if (!PROPUESTAS[accion]) throw new ErrorNegocio(`No s\xE9 hacer "${accion}"`);
    const { datos, resumen } = await PROPUESTAS[accion].preparar(ctx, args || {});
    const r = await db.prepare("INSERT INTO aura_propuestas (inventario_id, accion, datos, resumen) VALUES (?, ?, ?, ?)").run(ctx.invId, accion, JSON.stringify(datos), resumen);
    return { id: Number(r.lastInsertRowid), accion, resumen, estado: "pendiente" };
  }
  async function paraCopilot(pregunta, invId) {
    return [
      "Hola THEMENDO. Soy el administrador del inventario mensual de estibas ATS R10 Valledupar (app en la nube con Aura).",
      "Resp\xF3ndeme en espa\xF1ol sencillo, paso a paso. No me pidas claves.",
      "",
      `Estado actual:
${await estadoInventario(db, invId)}`,
      "",
      `Mi pregunta: ${pregunta}`
    ].join("\n");
  }
  async function chat(datos) {
    const d = validar(z2.object({
      mensajes: z2.array(z2.object({ role: z2.enum(["user", "assistant"]), content: z2.string().max(8e3) })).min(1).max(40),
      inventario_id: z2.coerce.number().int().positive().nullish()
    }).passthrough(), datos);
    const pregunta = [...d.mensajes].reverse().find((m) => m.role === "user")?.content || "";
    const vacio = { propuestas: [], consultas: [], aprendido: [] };
    const local = await responderLocal(db, pregunta, { invId: d.inventario_id });
    if (local?.orden) {
      try {
        const p = await crearPropuesta(contexto(d.inventario_id), local.orden.accion, local.orden.args);
        return { respuesta: `Listo, te prepar\xE9 el reparto. Rev\xEDsalo en "Propuestas para aprobar" y toca Aprobar:

${p.resumen}`, rapida: { id: local.id, titulo: local.titulo }, ...vacio, propuestas: [p] };
      } catch (e) {
        return { respuesta: `No pude armar el reparto: ${e.message}`, rapida: { id: local.id, titulo: local.titulo }, ...vacio };
      }
    }
    if (local) return { respuesta: local.respuesta, rapida: { id: local.id, titulo: local.titulo }, ...vacio };
    return {
      respuesta: 'Eso todav\xEDa no lo s\xE9. Toca "Preguntar a THEMENDO en Copilot": copio tu pregunta con el estado del inventario y abro Copilot. Cuando te responda, pega la respuesta aqu\xED abajo y la guardo para la pr\xF3xima vez.',
      copilot: { pregunta, texto: await paraCopilot(pregunta, d.inventario_id) },
      ...vacio
    };
  }
  const leerPropuesta = (p) => ({ ...p, datos: JSON.parse(p.datos) });
  async function propuestas() {
    const pendientes = await db.prepare("SELECT * FROM aura_propuestas WHERE estado = 'pendiente' ORDER BY id").all();
    const recientes = await db.prepare("SELECT * FROM aura_propuestas WHERE estado <> 'pendiente' ORDER BY id DESC LIMIT 20").all();
    return { pendientes: pendientes.map(leerPropuesta), recientes: recientes.map(leerPropuesta) };
  }
  async function obtenerPendiente(id2) {
    const p = await db.prepare("SELECT * FROM aura_propuestas WHERE id = ?").get(id2);
    if (!p) throw new ErrorNegocio("Propuesta no encontrada", 404);
    if (p.estado !== "pendiente") throw new ErrorNegocio("Esa propuesta ya se resolvi\xF3", 409);
    return p;
  }
  async function aprobar(id2, { automatica = false } = {}) {
    const p = await obtenerPendiente(id2);
    const datos = { ...JSON.parse(p.datos), inventario_id: p.inventario_id };
    let estado = "aprobada";
    let resultado;
    try {
      resultado = await db.transaction(() => PROPUESTAS[p.accion].ejecutar(contexto(p.inventario_id), datos, p.id))();
    } catch (e) {
      estado = "fallida";
      resultado = e.message;
    }
    if (automatica && estado === "aprobada") resultado = `${resultado} (hecho solo por el Supervisor del conteo, modo autom\xE1tico)`;
    await db.prepare("UPDATE aura_propuestas SET estado = ?, resultado = ?, resuelto_en = datetime('now','localtime') WHERE id = ?").run(estado, String(resultado), p.id);
    return leerPropuesta(await db.prepare("SELECT * FROM aura_propuestas WHERE id = ?").get(p.id));
  }
  async function rechazar(id2) {
    await obtenerPendiente(id2);
    await db.prepare("UPDATE aura_propuestas SET estado = 'rechazada', resultado = 'Rechazada por el administrador', resuelto_en = datetime('now','localtime') WHERE id = ?").run(id2);
    return leerPropuesta(await db.prepare("SELECT * FROM aura_propuestas WHERE id = ?").get(id2));
  }
  const vigilantes = crearVigilantes(db, {
    crearPropuesta: (invId, accion, args) => crearPropuesta(contexto(invId), accion, args),
    ejecutarPropuesta: (id2, opciones) => aprobar(id2, opciones)
  });
  const notas = () => db.prepare("SELECT * FROM aura_notas ORDER BY id DESC").all();
  async function agregarNota(datos) {
    const d = validar(z2.object({ texto: z2.string().trim().min(5).max(1500), tema: z2.string().trim().max(30).nullish() }), datos);
    const r = await db.prepare("INSERT INTO aura_notas (texto, tema) VALUES (?, ?)").run(d.texto, d.tema || "ense\xF1ado por el admin");
    return db.prepare("SELECT * FROM aura_notas WHERE id = ?").get(r.lastInsertRowid);
  }
  async function borrarNota(id2) {
    const r = await db.prepare("DELETE FROM aura_notas WHERE id = ?").run(id2);
    if (!r.changes) throw new ErrorNegocio("Nota no encontrada", 404);
    return { ok: true };
  }
  const respuestas = () => db.prepare("SELECT * FROM aura_respuestas ORDER BY id DESC").all();
  async function guardarRespuesta(datos) {
    const d = validar(z2.object({
      pregunta: z2.string().trim().min(5).max(300),
      respuesta: z2.string().trim().min(5).max(6e3),
      fuente: z2.enum(["admin", "copilot"]).nullish()
    }), datos);
    const ya = await db.prepare("SELECT id FROM aura_respuestas WHERE pregunta = ?").get(d.pregunta);
    if (ya) await db.prepare("UPDATE aura_respuestas SET respuesta = ?, fuente = ? WHERE id = ?").run(d.respuesta, d.fuente || "admin", ya.id);
    else await db.prepare("INSERT INTO aura_respuestas (pregunta, respuesta, fuente) VALUES (?, ?, ?)").run(d.pregunta, d.respuesta, d.fuente || "admin");
    return respuestas();
  }
  async function borrarRespuesta(id2) {
    if (!(await db.prepare("DELETE FROM aura_respuestas WHERE id = ?").run(id2)).changes) throw new ErrorNegocio("Respuesta no encontrada", 404);
    return { ok: true };
  }
  async function aprenderDeCopilot(lecciones) {
    let nuevas = 0;
    for (const l of lecciones || []) {
      const fuente = `themendo:${l.id}`;
      const previa = await db.prepare("SELECT id FROM aura_notas WHERE fuente = ?").get(fuente);
      if (l.estado === "descartada") {
        if (previa) await db.prepare("DELETE FROM aura_notas WHERE id = ?").run(previa.id);
        continue;
      }
      if (previa || !TEMA_INVENTARIO.test(normal(`${l.tema || ""} ${l.texto || ""}`))) continue;
      const texto = leccionDeCopilot(l);
      if (texto.length < 10) continue;
      await db.prepare("INSERT INTO aura_notas (texto, tema, fuente) VALUES (?, 'copilot', ?)").run(texto, fuente);
      nuevas++;
    }
    return { nuevas };
  }
  return { chat, paraCopilot, propuestas, aprobar, rechazar, notas, agregarNota, borrarNota, respuestas, guardarRespuesta, borrarRespuesta, vigilantes, aprenderDeCopilot, crearPropuesta: (invId, accion, args) => crearPropuesta(contexto(invId), accion, args) };
}

// fnb/nucleo/rutas.js
var nombreArchivo = (t) => `${t}`.replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, "").trim().replace(/\s+/g, "_") || "inventario";
var CREADO = /* @__PURE__ */ Symbol("creado");
var creado = (valor) => ({ [CREADO]: true, valor });
var n = (v) => {
  const x = Number(v);
  if (!Number.isInteger(x) || x <= 0) throw new ErrorNegocio("Identificador no v\xE1lido", 400);
  return x;
};
async function sha256(texto) {
  const b = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
var limpiarCodigo = (c) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function codigoAdmin() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  const s = [...b].map((x) => letras[x % letras.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
function aBase64(bytes) {
  let s = "";
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
  return btoa(s);
}
async function respaldarInventario(db, invId, motivo) {
  const i = await obtenerInventario(db, invId);
  const porInv = async (t) => db.prepare(`SELECT * FROM ${t} WHERE inventario_id = ?`).all(invId);
  const datos = {
    inventario: i,
    participantes: await porInv("participantes"),
    asignaciones: await porInv("asignaciones"),
    conteos: await db.prepare("SELECT * FROM conteos WHERE asignacion_id IN (SELECT id FROM asignaciones WHERE inventario_id = ?)").all(invId),
    eventos: await db.prepare("SELECT * FROM eventos WHERE participante_id IN (SELECT id FROM participantes WHERE inventario_id = ?)").all(invId),
    resoluciones: await porInv("resoluciones"),
    esperados: await porInv("esperados"),
    observaciones_pasillo: await porInv("observaciones_pasillo")
  };
  const sello = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const nombre = `inventario-${invId}-${sello}.json`;
  await db.prepare("INSERT INTO respaldos (nombre, inventario_id, motivo, datos) VALUES (?, ?, ?, ?)").run(nombre, invId, motivo, JSON.stringify(datos));
  return nombre;
}
function tabla(opciones) {
  const R = [];
  const ruta = (metodo, patron, rol, fn) => R.push({ metodo, partes: patron.split("/").filter(Boolean), rol, fn });
  const A = "admin";
  ruta("GET", "contar/:token", "contar", ({ db, p, disp }) => estadoContador(db, p.token, disp));
  ruta("PUT", "contar/:token/asignaciones/:aid", "contar", ({ db, p, disp, cuerpo }) => guardarConteos(db, p.token, disp, n(p.aid), cuerpo?.casillas, cuerpo?.observacion));
  ruta("POST", "contar/:token/asignaciones/:aid/terminar", "contar", ({ db, p, disp }) => terminarAsignacion(db, p.token, disp, n(p.aid)));
  ruta("POST", "contar/:token/eventos", "contar", ({ db, p, disp, cuerpo }) => eventoDesdeApp(db, p.token, disp, cuerpo?.tipo));
  ruta("GET", "admin/info", A, ({ acceso }) => ({ base_url: null, nube: true, rol: acceso.rol, nombre: acceso.nombre || "" }));
  ruta("GET", "admin/config", A, ({ db }) => configuracion(db));
  ruta("PUT", "admin/secciones/:id", A, ({ db, p, cuerpo }) => actualizarSeccion(db, n(p.id), cuerpo));
  ruta("POST", "admin/pasillos", A, ({ db, cuerpo }) => creado(crearPasillo(db, cuerpo)));
  ruta("PUT", "admin/pasillos/:id", A, ({ db, p, cuerpo }) => actualizarPasillo(db, n(p.id), cuerpo));
  ruta("POST", "admin/items", A, ({ db, cuerpo }) => creado(crearItem(db, cuerpo)));
  ruta("PUT", "admin/items/:codigo", A, ({ db, p, cuerpo }) => actualizarItem(db, p.codigo, cuerpo));
  ruta("GET", "admin/operadores", A, ({ db }) => operadores(db));
  ruta("POST", "admin/operadores", A, ({ db, cuerpo }) => creado(guardarOperadores(db, cuerpo)));
  ruta("DELETE", "admin/operadores/:id", A, ({ db, p }) => quitarOperador(db, n(p.id)));
  ruta("POST", "admin/inventarios/:id/repartir", A, ({ db, p, cuerpo }) => {
    const { vista_previa: previa, ...datos } = cuerpo || {};
    return previa ? planRepartir(db, n(p.id), datos) : repartir(db, n(p.id), datos);
  });
  ruta("GET", "admin/inventarios", A, ({ db }) => listarInventarios(db));
  ruta("POST", "admin/inventarios", A, ({ db, cuerpo }) => creado(crearInventario(db, cuerpo)));
  ruta("GET", "admin/inventarios/:id", A, ({ db, p }) => resumenInventario(db, n(p.id)));
  ruta("PUT", "admin/inventarios/:id", A, ({ db, p, cuerpo }) => actualizarInventario(db, n(p.id), cuerpo));
  ruta("DELETE", "admin/inventarios/:id", A, async ({ db, p, cuerpo }) => {
    const id2 = n(p.id);
    const actual = await obtenerInventario(db, id2);
    let respaldo = null;
    if (actual.estado !== "en_curso" && `${cuerpo?.confirmar ?? ""}`.trim().toLowerCase() === actual.nombre.trim().toLowerCase()) {
      respaldo = await respaldarInventario(db, id2, `antes de borrar el inventario "${actual.nombre}"`);
    }
    return { ...await eliminarInventario(db, id2, cuerpo), respaldo };
  });
  ruta("PUT", "admin/inventarios/:id/esperados", A, ({ db, p, cuerpo }) => guardarEsperados(db, n(p.id), cuerpo));
  ruta("POST", "admin/inventarios/:id/estado", A, ({ db, p, cuerpo }) => cambiarEstado(db, n(p.id), cuerpo?.estado));
  ruta("POST", "admin/inventarios/:id/participantes", A, ({ db, p, cuerpo }) => creado(agregarParticipante(db, n(p.id), cuerpo)));
  ruta("POST", "admin/inventarios/:id/participantes/:pid/enlace", A, ({ db, p }) => nuevoEnlace(db, n(p.id), n(p.pid)));
  ruta("POST", "admin/inventarios/:id/participantes/:pid/finalizar", A, ({ db, p }) => finalizarParticipante(db, n(p.id), n(p.pid)));
  ruta("POST", "admin/inventarios/:id/asignaciones", A, ({ db, p, cuerpo }) => creado(asignarManual(db, n(p.id), cuerpo)));
  ruta("POST", "admin/inventarios/:id/asignaciones/:aid/anular", A, ({ db, p }) => anularAsignacion(db, n(p.id), n(p.aid)));
  ruta("GET", "admin/inventarios/:id/cruce/:pasilloId", A, ({ db, p }) => cruce(db, n(p.id), n(p.pasilloId)));
  ruta("POST", "admin/inventarios/:id/reconteos", A, ({ db, p, cuerpo }) => creado(asignarReconteo(db, n(p.id), cuerpo)));
  ruta("PUT", "admin/inventarios/:id/pasillos/:pasilloId/observacion", A, ({ db, p, cuerpo }) => guardarObservacionPasillo(db, n(p.id), n(p.pasilloId), cuerpo));
  ruta("POST", "admin/inventarios/:id/resoluciones", A, ({ db, p, cuerpo }) => resolver(db, n(p.id), cuerpo));
  ruta("GET", "admin/inventarios/:id/eventos", A, ({ db, p }) => eventos(db, n(p.id)));
  ruta("GET", "admin/inventarios/:id/excel", A, async ({ db, p, consulta }) => {
    const ExcelJS = opciones.ExcelJS || (opciones.cargarExcel ? await opciones.cargarExcel() : null);
    if (!ExcelJS) throw new ErrorNegocio("El Excel no est\xE1 disponible en este momento", 503);
    const id2 = n(p.id);
    const datos = await obtenerInventario(db, id2);
    const libro = await libroInventario(ExcelJS, db, id2, { elaboro: consulta.elaboro });
    const bytes = await libro.xlsx.writeBuffer();
    return { archivo: { nombre: `${nombreArchivo(datos.nombre)}.xlsx`, tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: aBase64(bytes) } };
  });
  ruta("GET", "admin/inventarios/:id/dashboard", A, async ({ db, p, consulta }) => {
    const id2 = n(p.id);
    const datos = await obtenerInventario(db, id2);
    const html = await htmlDashboard(db, id2, { elaboro: consulta.elaboro });
    return { archivo: { nombre: `Dashboard_${nombreArchivo(datos.nombre)}.html`, tipo: "text/html; charset=utf-8", base64: aBase64(new TextEncoder().encode(html)) } };
  });
  ruta("GET", "admin/aura/config", A, () => ({ nube: true, proveedor: "copilot", activa: true, tiene_clave: false, copilot: "https://copilot.microsoft.com/", proveedores: [] }));
  ruta("PUT", "admin/aura/config", A, () => ({ nube: true, proveedor: "copilot", activa: true, tiene_clave: false, copilot: "https://copilot.microsoft.com/", proveedores: [] }));
  ruta("POST", "admin/aura/probar", A, () => ({ ok: true, respuesta: "Aura trabaja con Copilot: no necesita clave." }));
  ruta("POST", "admin/aura/chat", A, async ({ aura, cuerpo }) => {
    if (opciones.leccionesCopilot) {
      try {
        await aura.aprenderDeCopilot(await opciones.leccionesCopilot());
      } catch {
      }
    }
    return aura.chat(cuerpo);
  });
  ruta("POST", "admin/aura/copilot", A, async ({ aura, cuerpo }) => {
    const d = validar(z3.object({ pregunta: z3.string().trim().min(5).max(300), respuesta: z3.string().trim().min(5).max(6e3) }), cuerpo);
    return creado(aura.guardarRespuesta({ ...d, fuente: "copilot" }));
  });
  ruta("POST", "admin/aura/aprender", A, async ({ aura }) => opciones.leccionesCopilot ? aura.aprenderDeCopilot(await opciones.leccionesCopilot()) : { nuevas: 0 });
  ruta("GET", "admin/aura/propuestas", A, ({ aura }) => aura.propuestas());
  ruta("POST", "admin/aura/propuestas/:id/aprobar", A, ({ aura, p }) => aura.aprobar(n(p.id)));
  ruta("POST", "admin/aura/propuestas/:id/rechazar", A, ({ aura, p }) => aura.rechazar(n(p.id)));
  ruta("GET", "admin/aura/notas", A, ({ aura }) => aura.notas());
  ruta("POST", "admin/aura/notas", A, ({ aura, cuerpo }) => creado(aura.agregarNota(cuerpo)));
  ruta("DELETE", "admin/aura/notas/:id", A, ({ aura, p }) => aura.borrarNota(n(p.id)));
  ruta("GET", "admin/aura/respuestas", A, ({ aura }) => aura.respuestas());
  ruta("POST", "admin/aura/respuestas", A, ({ aura, cuerpo }) => creado(aura.guardarRespuesta(cuerpo)));
  ruta("DELETE", "admin/aura/respuestas/:id", A, ({ aura, p }) => aura.borrarRespuesta(n(p.id)));
  ruta("GET", "admin/aura/vigilantes", A, ({ aura, consulta }) => aura.vigilantes.resumen(consulta.inventario ? n(consulta.inventario) : void 0));
  ruta("POST", "admin/aura/vigilantes/revisar", A, ({ aura, cuerpo }) => aura.vigilantes.revisar(cuerpo?.inventario_id ? n(cuerpo.inventario_id) : void 0));
  ruta("PUT", "admin/aura/vigilantes", A, ({ aura, cuerpo }) => {
    const c = {};
    if (cuerpo?.auto_reconteo !== void 0) c.auto_reconteo = Boolean(cuerpo.auto_reconteo);
    if (cuerpo?.activos !== void 0) c.activos = Boolean(cuerpo.activos);
    return aura.vigilantes.configurar(c);
  });
  ruta("POST", "admin/aura/vigilantes/respaldar", A, () => ({ archivo: null, mensaje: "En la nube los datos ya quedan guardados; antes de borrar un inventario se guarda una copia completa." }));
  ruta("POST", "admin/aura/alertas/:id/descartar", A, ({ aura, p }) => aura.vigilantes.descartar(n(p.id)));
  ruta("POST", "admin/aura/alertas/:id/proponer", A, ({ aura, p }) => creado(aura.vigilantes.proponerArreglo(n(p.id))));
  ruta("GET", "admin/aura/cambios", A, () => []);
  ruta("GET", "admin/administradores", "propietario", async ({ db }) => (await db.prepare("SELECT id, nombre, creado_en, ultimo_uso, vence_en, dispositivo FROM admins WHERE quitado = ? ORDER BY creado_en").all(false)).map(({ dispositivo, ...a }) => ({ ...a, celular: !!dispositivo })));
  ruta("POST", "admin/administradores", "propietario", async ({ db, cuerpo }) => {
    const d = validar(z3.object({ nombre: z3.string().trim().min(2).max(60), dias: z3.coerce.number().int().min(1).max(365).default(30) }), cuerpo || {});
    const codigo = codigoAdmin();
    const vence = new Date(Date.now() + d.dias * 864e5).toISOString();
    await db.prepare("INSERT INTO admins (nombre, hash, vence_en) VALUES (?, ?, ?)").run(d.nombre, await sha256(`admin:${limpiarCodigo(codigo)}`), vence);
    return creado({ codigo, nombre: d.nombre, vence_en: vence });
  });
  ruta("DELETE", "admin/administradores/:id", "propietario", async ({ db, p }) => {
    if (!/^[0-9a-f-]{36}$/.test(p.id)) throw new ErrorNegocio("Administrador no v\xE1lido");
    const r = await db.prepare("UPDATE admins SET quitado = ?, quitado_en = ? WHERE id = ?").run(true, (/* @__PURE__ */ new Date()).toISOString(), p.id);
    if (!r.changes) throw new ErrorNegocio("Administrador no encontrado", 404);
    return { ok: true };
  });
  return R;
}
function crearRutas(opciones = {}) {
  const R = tabla(opciones);
  return async function manejar2(db, { metodo, ruta, cuerpo, consulta = {}, acceso = { rol: "" }, dispositivo }) {
    const partes = String(ruta || "").replace(/^\/?api\//, "").split("?")[0].split("/").filter(Boolean).map((x) => decodeURIComponent(x));
    const r = R.find((x) => x.metodo === metodo && x.partes.length === partes.length && x.partes.every((c, i) => c.startsWith(":") || c === partes[i]));
    if (!r) return { status: 404, cuerpo: { error: "Ruta no encontrada" } };
    if (r.rol === "admin" && !["admin", "propietario"].includes(acceso.rol)) return { status: 401, cuerpo: { error: acceso.motivo || "Entra como administrador" } };
    if (r.rol === "propietario" && acceso.rol !== "propietario") return { status: 404, cuerpo: { error: "Ruta no encontrada" } };
    const p = Object.fromEntries(r.partes.map((c, i) => [c, partes[i]]).filter(([c]) => c.startsWith(":")).map(([c, v]) => [c.slice(1), v]));
    try {
      const aura = r.partes[1] === "aura" ? crearAura(db) : null;
      let salida = await r.fn({ db, p, cuerpo: cuerpo ?? {}, consulta, acceso, disp: dispositivo, aura });
      let status = 200;
      if (salida && salida[CREADO]) {
        status = 201;
        salida = await salida.valor;
      }
      if (salida && salida.archivo) return { status, archivo: salida.archivo };
      return { status, cuerpo: salida ?? { ok: true } };
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      return { status, cuerpo: { error: status >= 500 ? "Error interno del servidor" : e.message, detalle: e.detalle } };
    }
  };
}

// fnb/nucleo/sql.js
var AHORA = "to_char(clock_timestamp() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS')";
var HOY = "to_char(clock_timestamp() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')";
var cache = /* @__PURE__ */ new Map();
function traducirSql(sql2) {
  const previa = cache.get(sql2);
  if (previa) return previa;
  const partes = [];
  let i = 0;
  let actual = "";
  while (i < sql2.length) {
    const c = sql2[i];
    if (c === "'") {
      let j = i + 1;
      while (j < sql2.length) {
        if (sql2[j] === "'" && sql2[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql2[j] === "'") break;
        j++;
      }
      partes.push({ codigo: actual });
      partes.push({ texto: sql2.slice(i, j + 1) });
      actual = "";
      i = j + 1;
      continue;
    }
    actual += c;
    i++;
  }
  partes.push({ codigo: actual });
  let unido = partes.map((p) => p.texto ?? p.codigo).join("");
  unido = unido.replace(/datetime\(\s*'now'\s*,\s*'localtime'\s*\)/gi, AHORA).replace(/datetime\(\s*'now'\s*\)/gi, AHORA).replace(/date\(\s*'now'\s*,\s*'localtime'\s*\)/gi, HOY);
  const nombres = [];
  let posicional = 0;
  let salida = "";
  const trozos = unido.split(/('(?:[^']|'')*')/);
  for (let k = 0; k < trozos.length; k++) {
    let t = trozos[k];
    if (k % 2 === 1) {
      salida += t;
      continue;
    }
    t = t.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT /*IGNORAR*/ INTO").replace(/([\w.]+)\s*=\s*\?\s+COLLATE\s+NOCASE/gi, "lower($1) = lower(?)").replace(/([\w.]+)\s+COLLATE\s+NOCASE/gi, "lower($1)").replace(/\bLIKE\b/gi, "ILIKE").replace(/\?|@([a-zA-Z_]\w*)/g, (m, nombre) => {
      if (nombre) {
        let idx = nombres.indexOf(nombre);
        if (idx < 0) {
          nombres.push(nombre);
          idx = nombres.length - 1;
        }
        return `$${idx + 1}`;
      }
      posicional++;
      return `$${posicional}`;
    });
    salida += t;
  }
  let texto = salida.trim().replace(/;\s*$/, "");
  if (/\/\*IGNORAR\*\//.test(texto)) {
    texto = texto.replace("/*IGNORAR*/ ", "");
    texto = /\bRETURNING\b/i.test(texto) ? texto.replace(/\s+RETURNING\b/i, " ON CONFLICT DO NOTHING RETURNING") : `${texto} ON CONFLICT DO NOTHING`;
  }
  const esInsert = /^INSERT\b/i.test(texto);
  if (esInsert && !/\bRETURNING\b/i.test(texto)) texto += " RETURNING id";
  const r = { texto, nombres, posicionales: posicional, esInsert, esLectura: /^(SELECT|WITH)\b/i.test(texto) };
  cache.set(sql2, r);
  return r;
}
function valoresDe(t, args) {
  const limpiar = (v) => v === void 0 ? null : typeof v === "boolean" ? v ? 1 : 0 : v;
  if (t.nombres.length) {
    const obj = args[0] && typeof args[0] === "object" && !Array.isArray(args[0]) ? args[0] : {};
    return t.nombres.map((n2) => limpiar(obj[n2] ?? obj[`@${n2}`]));
  }
  const planos = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return planos.slice(0, t.posicionales).map(limpiar);
}
var NUMERICOS = /* @__PURE__ */ new Set([20, 21, 23, 26, 700, 701, 1700]);
function convertir(fila, columnas) {
  for (const c of columnas) {
    const v = fila[c.nombre];
    if (v === null || v === void 0) continue;
    if (NUMERICOS.has(c.tipo) && typeof v !== "number") fila[c.nombre] = Number(v);
    else if (c.tipo === 16) fila[c.nombre] = v === true || v === "t" ? 1 : 0;
  }
  return fila;
}

// fnb/nucleo/adaptador-pg.js
function crearAdaptadorPg(ejecutar) {
  let nivel = 0;
  let puntos = 0;
  const correr = async (sql2, args) => {
    const t = traducirSql(sql2);
    const valores = valoresDe(t, args);
    if (t.esLectura) {
      const r = await ejecutar(t.texto, valores);
      return { ...r, filas: r.filas.map((f) => convertir(f, r.columnas)) };
    }
    const punto = `w_${++puntos}`;
    await ejecutar(`SAVEPOINT ${punto}`, []);
    try {
      const r = await ejecutar(t.texto, valores);
      await ejecutar(`RELEASE SAVEPOINT ${punto}`, []);
      return { ...r, filas: r.filas.map((f) => convertir(f, r.columnas)), esInsert: t.esInsert };
    } catch (e) {
      await ejecutar(`ROLLBACK TO SAVEPOINT ${punto}`, []);
      await ejecutar(`RELEASE SAVEPOINT ${punto}`, []);
      throw normalizarError(e);
    }
  };
  const db = {
    motor: "postgres",
    prepare(sql2) {
      return {
        get: async (...a) => (await correr(sql2, a)).filas[0],
        all: async (...a) => (await correr(sql2, a)).filas,
        run: async (...a) => {
          const r = await correr(sql2, a);
          return { changes: r.cantidad, lastInsertRowid: r.esInsert ? r.filas[0]?.id : void 0 };
        }
      };
    },
    async exec(sql2) {
      await ejecutar(sql2, []);
    },
    transaction(fn) {
      return async (...args) => {
        const punto = `t_${++nivel}_${++puntos}`;
        await ejecutar(`SAVEPOINT ${punto}`, []);
        try {
          const r = await fn(...args);
          await ejecutar(`RELEASE SAVEPOINT ${punto}`, []);
          return r;
        } catch (e) {
          await ejecutar(`ROLLBACK TO SAVEPOINT ${punto}`, []);
          await ejecutar(`RELEASE SAVEPOINT ${punto}`, []);
          throw e;
        } finally {
          nivel--;
        }
      };
    }
  };
  return db;
}
function normalizarError(e) {
  if (e?.code === "23505") e.message = `UNIQUE constraint failed: ${e.message}`;
  if (e?.code === "23514") e.message = `CHECK constraint failed: ${e.message}`;
  if (e?.code === "23503") e.message = `FOREIGN KEY constraint failed: ${e.message}`;
  return e;
}

// fnb/nucleo/semilla.js
var rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
var pad = (n2) => String(n2).padStart(2, "0");
var ESTRUCTURA = [
  { codigo: "SECO", nombre: "Seco", pasillos: rango(5, 19).map((n2) => ({ codigo: pad(n2), nombre: `Pasillo ${pad(n2)}` })) },
  { codigo: "LACTEOS", nombre: "L\xE1cteos", pasillos: rango(52, 54).map((n2) => ({ codigo: `LA${n2}`, nombre: `Pasillo LA${n2}` })) },
  { codigo: "TEMPERADO", nombre: "Temperado", pasillos: rango(62, 63).map((n2) => ({ codigo: `TE${n2}`, nombre: `Pasillo TE${n2}` })) },
  { codigo: "FRUVER", nombre: "Fruver", pasillos: [{ codigo: "FV42", nombre: "Pasillo FV42" }] },
  { codigo: "CONGELADO", nombre: "Congelado", pasillos: rango(31, 32).map((n2) => ({ codigo: `CO${n2}`, nombre: `Pasillo CO${n2}` })) },
  { codigo: "PILAS", nombre: "Conteo de pilas", pasillos: rango(1, 5).map((n2) => ({ codigo: `RACK${n2}`, nombre: `Rack ${n2}`, modulos_lista: "PILAS" })) }
];
var COLORES = [
  ["azul", "Pallet azul", "#1f5fbf", "estiba", 1],
  ["blanca", "Pallet blanca", "#e9edf2", "estiba", 1],
  ["verde", "Pallet verde", "#1e8a4c", "estiba", 1],
  ["roja", "Pallet roja", "#c62828", "estiba", 0],
  ["canastilla", "Canastillas", "#e08a00", "canastilla", 0]
];
var ZONA_CANASTILLAS = {
  codigo: "CANASTILLAS",
  nombre: "Canastillas y pallets rojos",
  colores: "canastilla,roja",
  pasillos: [{ codigo: "ZC", nombre: "Zona canastillas y rojas", modulos_lista: rango(1, 10).map(pad).join(",") }]
};
async function sembrar(db) {
  const vacio = async (t) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).n === 0;
  await db.transaction(async () => {
    if (await vacio("secciones")) {
      const insS = db.prepare("INSERT INTO secciones (codigo, nombre, orden) VALUES (?, ?, ?)");
      const insP = db.prepare("INSERT INTO pasillos (seccion_id, codigo, nombre, modulos_lista, orden) VALUES (?, ?, ?, ?, ?)");
      let orden = 0;
      for (const [i, s] of ESTRUCTURA.entries()) {
        const { lastInsertRowid: sid } = await insS.run(s.codigo, s.nombre, i + 1);
        for (const p of s.pasillos) await insP.run(sid, p.codigo, p.nombre, p.modulos_lista || null, ++orden);
      }
    }
    const ins = db.prepare("INSERT OR IGNORE INTO colores (codigo, nombre, hex, unidad, general, orden) VALUES (?, ?, ?, ?, ?, ?)");
    for (const [i, c] of COLORES.entries()) await ins.run(c[0], c[1], c[2], c[3], c[4], i + 1);
    if (!await db.prepare("SELECT 1 AS x FROM secciones WHERE codigo = ?").get(ZONA_CANASTILLAS.codigo)) {
      const orden = (await db.prepare("SELECT COALESCE(MAX(orden),0) + 1 AS n FROM secciones").get()).n;
      const { lastInsertRowid: sid } = await db.prepare("INSERT INTO secciones (codigo, nombre, orden, colores) VALUES (?, ?, ?, ?)").run(ZONA_CANASTILLAS.codigo, ZONA_CANASTILLAS.nombre, orden, ZONA_CANASTILLAS.colores);
      const ordenP = (await db.prepare("SELECT COALESCE(MAX(orden),0) AS n FROM pasillos").get()).n;
      for (const [i, p] of ZONA_CANASTILLAS.pasillos.entries()) {
        await db.prepare("INSERT OR IGNORE INTO pasillos (seccion_id, codigo, nombre, modulos_lista, orden) VALUES (?, ?, ?, ?, ?)").run(sid, p.codigo, p.nombre, p.modulos_lista, ordenP + i + 1);
      }
    }
  })();
}

// fnb/index.ts
var sql = postgres(Deno.env.get("SUPABASE_DB_URL"), { prepare: false, max: 4, idle_timeout: 20 });
var URL_SB = Deno.env.get("SUPABASE_URL");
var ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin, x-dispositivo",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};
var json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
var manejar = crearRutas({
  cargarExcel: async () => (await import("npm:exceljs@4.4.0")).default,
  // Lecciones que THEMENDO guarda en su Cuaderno (Copilot); las escritas a mano por Claude no cuentan
  leccionesCopilot: async () => await sql`SELECT id::text, texto, tema, estado FROM public.themendo_lecciones
      WHERE coalesce(origen, '') <> 'claude-manual' ORDER BY creado DESC LIMIT 300`.catch(() => [])
});
function ejecutor(tx) {
  return async (texto, valores) => {
    const r = await tx.unsafe(texto, valores);
    return {
      filas: [...r].map((f) => ({ ...f })),
      columnas: (r.columns || []).map((c) => ({ nombre: c.name, tipo: c.type })),
      cantidad: r.count ?? r.length ?? 0
    };
  };
}
var sembrado = false;
async function esPropietario(req) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3 || jwt === ANON) return false;
  const r = await fetch(`${URL_SB}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: ANON || jwt } });
  if (!r.ok) return false;
  const u = await r.json().catch(() => null);
  if (!u?.id) return false;
  const [duenio] = await sql`SELECT id::text FROM auth.users ORDER BY created_at LIMIT 1`;
  return !!duenio && duenio.id === u.id;
}
async function quienEs(req, tx, dispositivo) {
  if (await esPropietario(req)) return { rol: "propietario", nombre: "Administraci\xF3n" };
  const c = limpiarCodigo(req.headers.get("x-admin"));
  if (c.length < 10) return { rol: "", nombre: "" };
  const [a] = await tx`SELECT id::text, nombre, dispositivo, vence_en, ultimo_uso FROM inventario.admins WHERE hash = ${await sha256(`admin:${c}`)} AND NOT quitado`;
  if (!a) return { rol: "", nombre: "", motivo: "C\xF3digo no v\xE1lido o ya fue quitado." };
  if (a.vence_en && new Date(a.vence_en).getTime() < Date.now()) return { rol: "", nombre: "", motivo: "Tu c\xF3digo de administrador venci\xF3. Pide uno nuevo." };
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(dispositivo)) return { rol: "", nombre: "", motivo: "Celular no identificado." };
  if (a.dispositivo && a.dispositivo !== dispositivo) return { rol: "", nombre: "", motivo: "Este c\xF3digo ya se us\xF3 en otro celular. Pide uno nuevo." };
  if (!a.dispositivo) await tx`UPDATE inventario.admins SET dispositivo = ${dispositivo}, ultimo_uso = now() WHERE id = ${a.id}::uuid`;
  else if (!a.ultimo_uso || Date.now() - new Date(a.ultimo_uso).getTime() > 3e5) await tx`UPDATE inventario.admins SET ultimo_uso = now() WHERE id = ${a.id}::uuid`;
  return { rol: "admin", nombre: a.nombre };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const i = url.pathname.indexOf("/api/");
  if (i < 0) return json({ ok: true, servicio: "inventario de estibas" });
  const ruta = url.pathname.slice(i + 1);
  const consulta = Object.fromEntries(url.searchParams);
  const dispositivo = String(req.headers.get("x-dispositivo") || "").slice(0, 64);
  let cuerpo;
  if (req.method !== "GET") cuerpo = await req.json().catch(() => ({}));
  try {
    const r = await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL search_path = inventario, extensions, public");
      await tx.unsafe("SELECT pg_advisory_xact_lock(84726)");
      const db = crearAdaptadorPg(ejecutor(tx));
      if (!sembrado) {
        await sembrar(db);
        sembrado = true;
      }
      const acceso = ruta.startsWith("api/admin/") ? await quienEs(req, tx, dispositivo) : { rol: "" };
      if (ruta === "api/admin/quien") return { status: 200, cuerpo: { rol: acceso.rol || "ninguno", nombre: acceso.rol === "admin" ? acceso.nombre : "", motivo: acceso.motivo || "" } };
      const salida = await manejar(db, { metodo: req.method, ruta, cuerpo, consulta, acceso, dispositivo });
      if (salida.status >= 500) throw Object.assign(new Error("fall\xF3"), { salida });
      return salida;
    }).catch((e) => {
      if (e?.salida) return e.salida;
      throw e;
    });
    if (r.archivo) return json({ archivo: r.archivo });
    return json(r.cuerpo, r.status);
  } catch (e) {
    console.error(e);
    return json({ error: "Error interno del servidor" }, 500);
  }
});
