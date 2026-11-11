// Función "paletizado" (proyecto Supabase de la Central de Luis).
// Una sola información para todos los celulares: posiciones, tareas por enlace, usuarios y aprendizaje.
// - Público: registrar el celular, leer el aprendizaje, abrir/enviar una tarea con su enlace (token).
// - Solo Luis (sesión de la Central): crear/anular tareas, ver usuarios, bajar todo y guardar.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PASILLOS = ["05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "LA52", "LA53", "LA54", "TE62", "TE63", "FV42", "CO31", "CO32"];
const RE_CODIGO = /^([A-Z0-9]{2,4})-\d{3}x[12][AB]?$/;
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

async function esLuis(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return false;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) return false;
  const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
  const duenio = (lista?.users || []).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return !!duenio && duenio.id === data.user.id;
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
      const { data } = await sb.from("paletizado_conocimiento").select("fecha,tema,titulo,contenido,fuentes").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(Math.min(Number(b.limite) || 30, 100));
      return json({ conocimiento: data || [] });
    }

    if (accion === "tarea_abrir" || accion === "tarea_enviar") {
      const { data: t } = await sb.from("paletizado_tareas").select("*").eq("token", texto(b.token, 64)).maybeSingle();
      if (!t) return json({ error: "Enlace no válido" }, 404);
      if (t.estado === "CERRADA") return json({ error: "Este enlace ya se usó: la tarea fue enviada y quedó cerrada." }, 410);
      if (t.estado === "ANULADA") return json({ error: "Esta tarea fue anulada por Luis." }, 410);
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

    // ---------- Solo Luis ----------
    if (!(await esLuis(req))) return json({ error: "Solo Luis puede hacer esto. Inicia sesión en la pestaña Tareas." }, 401);

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
    if (accion === "guardar") return json(await guardarCambios(b.cambios, texto(b.por, 40) || "Luis", dispositivo, null, null));

    return json({ error: "acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
