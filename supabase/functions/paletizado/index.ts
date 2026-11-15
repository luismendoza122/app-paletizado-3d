// Función "paletizado" (proyecto Supabase de la Central).
// Una sola información para todos los celulares: posiciones, tareas por enlace, usuarios, sugerencias y aprendizaje.
// Niveles de acceso:
// - Público: registrar el celular, leer el aprendizaje y los ajustes, sugerir, avisar preguntas sin respuesta,
//   abrir/enviar una tarea con su enlace (token).
// - Administrador (código personal en el encabezado x-admin): todo lo de la app — tareas, usuarios, posiciones,
//   ajustes para todos, sugerencias y enseñar al agente. No ve al propietario ni maneja administradores.
// - Propietario (sesión de la cuenta principal; no aparece en ninguna lista): lo mismo + invitar y quitar administradores.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PASILLOS = ["05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "LA52", "LA53", "LA54", "TE62", "TE63", "FV42", "CO31", "CO32"];
const RE_CODIGO = /^([A-Z0-9]{2,4})-\d{3}[xyz][1-3][AB]?$/;
const CAMPOS = ["CODIGO", "SECCION", "PASILLO", "MODULO", "POSICION", "SUBPOSICION", "SECUENCIA_RUTA", "ARTICULO", "CODIGO_ARTICULO",
  "LARGO_A_MM", "ANCHO_B_MM", "ALTO_H_MM", "PESO_KG", "EMPAQUE", "LIQUIDO", "DELICADO", "MAX_CAJAS_ENCIMA", "NIVEL", "HUECO_ANCHO_MM",
  "HUECO_FONDO_MM", "HUECO_ALTO_MM", "PESO_MAX_KG", "TIPO", "BLOQUEADA", "ESTADO", "OBSERVACIONES", "ACTUALIZADO"];

const texto = (v: unknown, max = 120) => String(v ?? "").slice(0, max);

function limpiarDatos(d: Record<string, unknown>) {
  const o: Record<string, string | number> = {};
  for (const k of CAMPOS) {
    const v = d?.[k];
    if (v === undefined || v === null || v === "") continue;
    o[k] = typeof v === "number" ? v : texto(v, k === "OBSERVACIONES" || k === "ARTICULO" ? 200 : 60);
  }
  return o;
}

async function esPropietario(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return false;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) return false;
  const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
  const duenio = (lista?.users || []).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return !!duenio && duenio.id === data.user.id;
}

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const limpiarCodigo = (c: unknown) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// ¿Quién hace la petición? propietario (oculto), administrador (código personal) o nadie.
async function quienEs(req: Request): Promise<{ rol: "propietario" | "admin" | ""; nombre: string; id?: string }> {
  if (await esPropietario(req)) return { rol: "propietario", nombre: "Administración" };
  const c = limpiarCodigo(req.headers.get("x-admin"));
  if (c.length < 10) return { rol: "", nombre: "" };
  const { data: a } = await sb.from("paletizado_admins").select("id,nombre,ultimo_uso").eq("hash", await sha256("admin:" + c)).eq("quitado", false).maybeSingle();
  if (!a) return { rol: "", nombre: "" };
  if (!a.ultimo_uso || Date.now() - Date.parse(a.ultimo_uso) > 300_000) {
    await sb.from("paletizado_admins").update({ ultimo_uso: new Date().toISOString() }).eq("id", a.id);
  }
  return { rol: "admin", nombre: a.nombre, id: a.id };
}

function codigoAdmin() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sin O/0 ni I/1
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  const s = [...b].map((x) => letras[x % letras.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

const ESTADOS_SUG = ["NUEVA", "EN REVISION", "APROBADA", "HECHA", "DESCARTADA"];
const CATEGORIAS = ["Mejora de la app", "Ubicación o reubicación", "Dato equivocado", "Agente", "Otro"];
const claveDe = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
const hace24h = () => new Date(Date.now() - 864e5).toISOString();

// Lecciones de THEMENDO (Copilot) → aprendizaje del agente de la app.
// Solo las de trabajo (logística, CEDI, Excel, SAP…) y que no estén descartadas en el Cuaderno.
const TRABAJO = /(logist|cedi|bodega|inventari|palet|estiba|picking|slotting|ubicaci|pasillo|wpms|wms|sap|excel|power bi|kpi|otif|recibo|despacho|transporte|conteo|operador|reabastec|arrume|abastec|proveedor|merma|averia|turno|camion|muelle|garita)/;
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function leccionCopilot(l: { texto: string; tema: string | null }) {
  const lineas = String(l.texto || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const campo = (re: RegExp) => { const x = lineas.find((y) => re.test(y)); return x ? x.replace(re, "").trim() : ""; };
  const tema = l.tema || campo(/^tema(\s*\/\s*pedido)?\s*:\s*/i);
  const pedido = campo(/^pedido\s*:\s*/i);
  const cuerpo = lineas.filter((y) => !/^lecci[oó]n\b/i.test(y) && !/^fecha\s*:/i.test(y) && !/^tema(\s*\/\s*pedido)?\s*:/i.test(y));
  return { titulo: (tema || pedido || cuerpo[0] || "Lección de Copilot").slice(0, 120), contenido: cuerpo.join(" · ").slice(0, 2000) };
}
async function importarCopilot() {
  const { data: lecciones } = await sb.from("themendo_lecciones").select("id,texto,tema,estado,creado").order("creado", { ascending: false }).limit(300);
  if (!lecciones?.length) return;
  const { data: ya } = await sb.from("paletizado_conocimiento").select("id,fuente_id,activo").like("fuente_id", "themendo:%");
  const copiadas = new Map<string, { id: number; activo: boolean }>((ya || []).map((k: { id: number; fuente_id: string; activo: boolean }) => [k.fuente_id, k]));
  for (const l of lecciones) {
    const fuente = `themendo:${l.id}`;
    const previa = copiadas.get(fuente);
    if (l.estado === "descartada") {                       // si la descartan en el Cuaderno, el agente la olvida
      if (previa?.activo) await sb.from("paletizado_conocimiento").update({ activo: false }).eq("id", previa.id);
      continue;
    }
    if (previa || !TRABAJO.test(norm(`${l.tema || ""} ${l.texto}`))) continue;
    const { titulo, contenido } = leccionCopilot(l);
    if (contenido.length < 10) continue;
    await sb.from("paletizado_conocimiento").insert({ fecha: String(l.creado).slice(0, 10), tema: "Aprendido en Copilot", titulo, contenido, fuentes: [], origen: "copilot", fuente_id: fuente });
  }
}

function token() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Guarda cambios con control de versión: si otro ya cambió la posición, se devuelve como conflicto.
async function guardarCambios(cambios: unknown, por: string, dispositivo: string, tareaId: string | null, permitidos: string[] | null) {
  const guardadas: { codigo: string; version: number }[] = [];
  const conflictos: unknown[] = [];
  const rechazadas: string[] = [];
  const lista = Array.isArray(cambios) ? cambios.slice(0, 500) : [];
  for (const c of lista as Record<string, unknown>[]) {
    const codigo = texto(c?.codigo, 20);
    const m = codigo.match(RE_CODIGO);
    if (!m || !PASILLOS.includes(m[1]) || (permitidos && !permitidos.includes(m[1]))) { rechazadas.push(codigo); continue; }
    const datos = limpiarDatos((c?.datos || {}) as Record<string, unknown>);
    const base = Number(c?.version_base) || 0;
    const { data: actual } = await sb.from("paletizado_posiciones").select("*").eq("codigo", codigo).maybeSingle();
    if (actual && JSON.stringify(actual.datos) === JSON.stringify(datos)) { guardadas.push({ codigo, version: actual.version }); continue; }
    if (actual && actual.version !== base) {
      conflictos.push({ codigo, servidor: actual.datos, version: actual.version, por: actual.actualizado_por, en: actual.actualizado_en });
      continue;
    }
    const version = (actual?.version || 0) + 1;
    const fila = { codigo, datos, version, actualizado_por: por, dispositivo, actualizado_en: new Date().toISOString() };
    const { error } = await sb.from("paletizado_posiciones").upsert(fila, { onConflict: "codigo" });
    if (error) { rechazadas.push(codigo); continue; }
    await sb.from("paletizado_historial").insert({ codigo, datos, version, actualizado_por: por, dispositivo, tarea: tareaId });
    guardadas.push({ codigo, version });
  }
  return { guardadas, conflictos, rechazadas };
}

async function posicionesDe(pasillos: string[] | null) {
  let q = sb.from("paletizado_posiciones").select("codigo,datos,version,actualizado_por,actualizado_en").limit(5000);
  if (pasillos) q = q.or(pasillos.map((p) => `codigo.like.${p}-*`).join(","));
  const { data } = await q;
  return data || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const accion = String(b.accion || "");
  const dispositivo = texto(b.dispositivo, 64);

  try {
    // ---------- Público ----------
    if (accion === "registrar") {
      const id = texto(b.id, 64);
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return json({ error: "id inválido" }, 400);
      const { data: previo } = await sb.from("paletizado_dispositivos").select("veces").eq("id", id).maybeSingle();
      await sb.from("paletizado_dispositivos").upsert({
        id, nombre: texto(b.nombre, 60) || null, plataforma: texto(b.plataforma, 20), version_app: texto(b.version, 20),
        ultima_vez: new Date().toISOString(), veces: (previo?.veces || 0) + 1,
      }, { onConflict: "id" });
      return json({ ok: true });
    }

    if (accion === "conocimiento") {
      try { await importarCopilot(); } catch { /* si falla, se entrega lo que ya hay */ }
      const { data } = await sb.from("paletizado_conocimiento").select("id,fecha,tema,titulo,contenido,fuentes,origen").eq("activo", true).order("fecha", { ascending: false }).order("id", { ascending: false }).limit(Math.min(Number(b.limite) || 30, 200));
      return json({ conocimiento: data || [] });
    }

    if (accion === "config") {
      const { data } = await sb.from("paletizado_config").select("datos,version,actualizado_en").eq("id", "principal").maybeSingle();
      return json({ config: data || null });
    }

    // ¿Qué rol tiene este código o esta sesión? (para mostrar las opciones de administración)
    if (accion === "quien") {
      const q = await quienEs(req);
      return json({ rol: q.rol || "ninguno", nombre: q.rol === "admin" ? q.nombre : "" });
    }

    // Sugerencias: cualquiera puede enviar (máx. 20 por celular al día)
    if (accion === "sugerir") {
      const txt = String(b.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
      if (txt.length < 5) return json({ error: "Escribe la sugerencia (mínimo 5 letras)" }, 400);
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(dispositivo)) return json({ error: "Celular no identificado" }, 400);
      const { count } = await sb.from("paletizado_sugerencias").select("id", { count: "exact", head: true }).eq("dispositivo", dispositivo).gte("creado_en", hace24h());
      if ((count || 0) >= 20) return json({ error: "Ya enviaste muchas sugerencias hoy. Intenta mañana." }, 429);
      const categoria = CATEGORIAS.includes(String(b.categoria)) ? String(b.categoria) : "Otro";
      const { data, error } = await sb.from("paletizado_sugerencias").insert({ texto: txt, categoria, nombre: texto(b.nombre, 60) || null, dispositivo }).select("id,creado_en").single();
      if (error) return json({ error: "No se pudo guardar la sugerencia" }, 500);
      return json({ ok: true, id: data.id, creado_en: data.creado_en });
    }
    if (accion === "mis_sugerencias") {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(dispositivo)) return json({ sugerencias: [] });
      const { data } = await sb.from("paletizado_sugerencias").select("id,texto,categoria,estado,respuesta,creado_en,actualizado_en").eq("dispositivo", dispositivo).order("creado_en", { ascending: false }).limit(50);
      return json({ sugerencias: data || [] });
    }

    // Preguntas que el agente no supo responder (para que un administrador le enseñe)
    if (accion === "pregunta") {
      const texto = String(b.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      const clave = claveDe(texto);
      if (clave.length < 4) return json({ ok: true });
      const { data: previa } = await sb.from("paletizado_preguntas").select("id,veces,estado").eq("clave", clave).maybeSingle();
      if (previa) {
        await sb.from("paletizado_preguntas").update({ veces: previa.veces + 1, actualizado_en: new Date().toISOString() }).eq("id", previa.id);
      } else {
        const { count } = await sb.from("paletizado_preguntas").select("id", { count: "exact", head: true }).eq("dispositivo", dispositivo).gte("creado_en", hace24h());
        if ((count || 0) < 30) await sb.from("paletizado_preguntas").insert({ texto, clave, dispositivo });
      }
      return json({ ok: true });
    }

    if (accion === "tarea_abrir" || accion === "tarea_enviar") {
      const { data: t } = await sb.from("paletizado_tareas").select("*").eq("token", texto(b.token, 64)).maybeSingle();
      if (!t) return json({ error: "Enlace no válido" }, 404);
      if (t.estado === "CERRADA") return json({ error: "Este enlace ya se usó: la tarea fue enviada y quedó cerrada." }, 410);
      if (t.estado === "ANULADA") return json({ error: "Esta tarea fue anulada por la administración." }, 410);
      if (new Date(t.expira_en) < new Date()) return json({ error: "Este enlace venció. Pide uno nuevo." }, 410);
      if (t.dispositivo && t.dispositivo !== dispositivo) return json({ error: "Este enlace ya se abrió en otro celular." }, 409);

      if (accion === "tarea_abrir") {
        if (!t.dispositivo) {
          await sb.from("paletizado_tareas").update({ dispositivo, estado: "EN CURSO", abierta_en: new Date().toISOString() }).eq("id", t.id);
        }
        return json({ tarea: { id: t.id, titulo: t.titulo, asignado_a: t.asignado_a, pasillos: t.pasillos, expira_en: t.expira_en }, posiciones: await posicionesDe(t.pasillos) });
      }
      const r = await guardarCambios(b.cambios, t.asignado_a, dispositivo, t.id, t.pasillos);
      let cerrada = false;
      if (b.cerrar && r.conflictos.length === 0) {
        const previo = (t.resumen?.guardadas as number) || 0;
        await sb.from("paletizado_tareas").update({ estado: "CERRADA", cerrada_en: new Date().toISOString(), resumen: { guardadas: previo + r.guardadas.length } }).eq("id", t.id);
        cerrada = true;
      } else if (r.guardadas.length) {
        const previo = (t.resumen?.guardadas as number) || 0;
        await sb.from("paletizado_tareas").update({ resumen: { guardadas: previo + r.guardadas.length } }).eq("id", t.id);
      }
      return json({ ...r, cerrada, posiciones: await posicionesDe(t.pasillos) });
    }

    // ---------- Administración ----------
    const yo = await quienEs(req);
    if (!yo.rol) return json({ error: "Solo un administrador puede hacer esto. Entra como administrador en la pestaña Tareas." }, 401);

    // Solo el propietario: invitar, ver y quitar administradores
    if (accion === "invitar_admin" || accion === "admins" || accion === "quitar_admin") {
      if (yo.rol !== "propietario") return json({ error: "acción desconocida" }, 400);   // no revela que existe
      if (accion === "admins") {
        const { data } = await sb.from("paletizado_admins").select("id,nombre,creado_en,ultimo_uso").eq("quitado", false).order("creado_en", { ascending: true });
        return json({ admins: data || [] });
      }
      if (accion === "quitar_admin") {
        const id = texto(b.id, 40);
        if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Administrador inválido" }, 400);
        await sb.from("paletizado_admins").update({ quitado: true, quitado_en: new Date().toISOString() }).eq("id", id);
        return json({ ok: true });
      }
      const nombre = String(b.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (nombre.length < 2) return json({ error: "Escribe el nombre del administrador" }, 400);
      const codigo = codigoAdmin();
      const { data, error } = await sb.from("paletizado_admins").insert({ nombre, hash: await sha256("admin:" + limpiarCodigo(codigo)) }).select("id").single();
      if (error) return json({ error: "No se pudo crear el administrador" }, 500);
      return json({ codigo, id: data.id, nombre });
    }

    if (accion === "sugerencias") {
      let q = sb.from("paletizado_sugerencias").select("id,texto,categoria,nombre,estado,respuesta,respondido_por,creado_en,actualizado_en").order("creado_en", { ascending: false }).limit(200);
      if (ESTADOS_SUG.includes(String(b.estado))) q = q.eq("estado", String(b.estado));
      const { data } = await q;
      return json({ sugerencias: data || [] });
    }
    if (accion === "responder_sugerencia") {
      const id = texto(b.id, 40);
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Sugerencia inválida" }, 400);
      const estado = ESTADOS_SUG.includes(String(b.estado)) ? String(b.estado) : "EN REVISION";
      const respuesta = String(b.respuesta ?? "").trim().slice(0, 1000) || null;
      const { error } = await sb.from("paletizado_sugerencias").update({ estado, respuesta, respondido_por: yo.nombre, actualizado_en: new Date().toISOString() }).eq("id", id);
      if (error) return json({ error: "No se pudo guardar" }, 500);
      return json({ ok: true });
    }

    if (accion === "preguntas") {
      const { data } = await sb.from("paletizado_preguntas").select("id,texto,veces,estado,creado_en,actualizado_en").eq("estado", "PENDIENTE").order("veces", { ascending: false }).order("actualizado_en", { ascending: false }).limit(100);
      return json({ preguntas: data || [] });
    }
    if (accion === "ignorar_pregunta") {
      await sb.from("paletizado_preguntas").update({ estado: "IGNORADA", actualizado_en: new Date().toISOString() }).eq("id", Number(b.id) || 0);
      return json({ ok: true });
    }
    // Enseñar al agente: una lección que reciben todos los celulares
    if (accion === "ensenar") {
      const titulo = String(b.titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const contenido = String(b.contenido ?? "").trim().slice(0, 2000);
      if (titulo.length < 4 || contenido.length < 10) return json({ error: "Escribe la pregunta o tema y la respuesta" }, 400);
      const tema = texto(b.tema, 60) || "Enseñado por administración";
      const { data, error } = await sb.from("paletizado_conocimiento").insert({ tema, titulo, contenido, fuentes: [], origen: "ensenado" }).select("id").single();
      if (error) return json({ error: "No se pudo guardar la lección" }, 500);
      if (b.pregunta_id) await sb.from("paletizado_preguntas").update({ estado: "ENSENADA", actualizado_en: new Date().toISOString() }).eq("id", Number(b.pregunta_id) || 0);
      return json({ ok: true, id: data.id });
    }
    if (accion === "olvidar") {
      await sb.from("paletizado_conocimiento").update({ activo: false }).eq("id", Number(b.id) || 0);
      return json({ ok: true });
    }

    // Ajustes del palet y reglas para todos los celulares
    if (accion === "guardar_config") {
      const d = (b.datos || {}) as Record<string, Record<string, unknown>>;
      const num = (v: unknown, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; };
      const p = d.palet || {};
      const palet = { largo: num(p.largo, 400, 2500), ancho: num(p.ancho, 400, 2500), altoBase: num(p.altoBase, 50, 300), tara: num(p.tara, 0, 100),
        cargaMax: num(p.cargaMax, 50, 3000), alturaMaxTotal: num(p.alturaMaxTotal, 500, 3000), voladizoMax: num(p.voladizoMax, 0, 100) };
      if (Object.values(palet).some((v) => v === undefined)) return json({ error: "Ajustes del palet incompletos" }, 400);
      const reglas = { soporteMinimo: num(d.reglas?.soporteMinimo, 0.3, 1) ?? 0.7 };
      const { data: actual } = await sb.from("paletizado_config").select("version").eq("id", "principal").maybeSingle();
      const version = (actual?.version || 0) + 1;
      const { error } = await sb.from("paletizado_config").upsert({ id: "principal", datos: { palet, reglas }, version, actualizado_por: yo.nombre, actualizado_en: new Date().toISOString() });
      if (error) return json({ error: "No se pudieron guardar los ajustes" }, 500);
      return json({ ok: true, version });
    }

    if (accion === "crear_tarea") {
      const pasillos = (Array.isArray(b.pasillos) ? b.pasillos : []).map((p: unknown) => texto(p, 6)).filter((p: string) => PASILLOS.includes(p));
      if (!pasillos.length) return json({ error: "Elige al menos un pasillo" }, 400);
      const dias = Math.min(Math.max(Number(b.dias) || 3, 1), 30);
      const fila = { token: token(), titulo: texto(b.titulo, 80) || `Pasillos ${pasillos.join(", ")}`, asignado_a: texto(b.asignado_a, 60) || "Operador", pasillos, expira_en: new Date(Date.now() + dias * 864e5).toISOString() };
      const { data, error } = await sb.from("paletizado_tareas").insert(fila).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ tarea: data });
    }
    if (accion === "tareas") {
      const { data } = await sb.from("paletizado_tareas").select("id,token,titulo,asignado_a,pasillos,estado,creado_en,expira_en,abierta_en,cerrada_en,resumen").order("creado_en", { ascending: false }).limit(60);
      return json({ tareas: data || [] });
    }
    if (accion === "anular_tarea") {
      await sb.from("paletizado_tareas").update({ estado: "ANULADA" }).eq("id", texto(b.id, 40)).neq("estado", "CERRADA");
      return json({ ok: true });
    }
    if (accion === "usuarios") {
      const { data } = await sb.from("paletizado_dispositivos").select("id,nombre,plataforma,version_app,primera_vez,ultima_vez,veces").order("ultima_vez", { ascending: false }).limit(1000);
      const lista = data || [];
      const hace7 = Date.now() - 7 * 864e5;
      return json({
        total: lista.length,
        apk: lista.filter((d) => d.plataforma === "android").length,
        web: lista.filter((d) => d.plataforma !== "android").length,
        activos7: lista.filter((d) => new Date(d.ultima_vez).getTime() > hace7).length,
        lista: lista.slice(0, 50),
      });
    }
    if (accion === "posiciones") return json({ posiciones: await posicionesDe(null) });
    if (accion === "guardar") return json(await guardarCambios(b.cambios, yo.rol === "admin" ? yo.nombre : (texto(b.por, 40) || "Administración"), dispositivo, null, null));

    return json({ error: "acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
