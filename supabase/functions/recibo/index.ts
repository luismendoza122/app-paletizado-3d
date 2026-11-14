// Función "recibo" (proyecto Supabase de la Central de Luis).
// Guarda la información compartida de Seguimiento de Recibo: planillas, artículos, ajustes y fotos.
// Entra Luis con su sesión de la Central, o los equipos que tengan el código de equipo que él crea.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-equipo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const COLECCIONES = ["planillas", "articulos", "config", "fotos", "drivefotos"];
const RE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const MAX_DOC = 400_000; // bytes por documento (las fotos van comprimidas)

async function esLuis(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return false;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) return false;
  const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
  const duenio = (lista?.users || []).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return !!duenio && duenio.id === data.user.id;
}

async function sha256(texto: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Devuelve quién entra con ese código: el código general del equipo o una persona invitada (código personal).
async function quienCodigo(codigo: string): Promise<null | { tipo: "equipo" } | { tipo: "persona"; id: string; nombre: string }> {
  const c = String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length < 8) return null;
  const { data } = await sb.from("recibo_equipo").select("hash,sal").eq("id", "principal").maybeSingle();
  if (data && (await sha256(data.sal + c)) === data.hash) return { tipo: "equipo" };
  const { data: m } = await sb.from("recibo_miembros").select("id,nombre,ultimo_uso").eq("hash", await sha256("persona:" + c)).eq("quitado", false).maybeSingle();
  if (!m) return null;
  // se anota el último uso (como mucho cada 5 minutos)
  if (!m.ultimo_uso || Date.now() - Date.parse(m.ultimo_uso) > 300_000) {
    await sb.from("recibo_miembros").update({ ultimo_uso: new Date().toISOString() }).eq("id", m.id);
  }
  return { tipo: "persona", id: m.id, nombre: m.nombre };
}

function codigoNuevo() {
  // Sin letras que se confunden (O/0, I/1)
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  const s = [...b].map((x) => letras[x % letras.length]).join("");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }
  const accion = String(b.accion || "");

  const luis = await esLuis(req);
  const acceso = luis ? null : await quienCodigo(req.headers.get("x-equipo") || "");
  const equipo = !!acceso;
  const persona = acceso && acceso.tipo === "persona" ? acceso.nombre : "";
  const quien = luis ? "Luis" : persona ? `persona:${persona.slice(0, 40)}` : equipo ? `equipo:${String(b.dispositivo || "").slice(0, 40)}` : "";

  if (accion === "estado") {
    const { data } = await sb.from("recibo_equipo").select("id").eq("id", "principal").maybeSingle();
    return json({ luis, equipo, persona, hayCodigo: !!data, ahora: new Date().toISOString() });
  }

  if (accion === "crear_codigo" || accion === "quitar_codigo") {
    if (!luis) return json({ error: "Solo Luis puede cambiar el código de equipo" }, 403);
    if (accion === "quitar_codigo") {
      await sb.from("recibo_equipo").delete().eq("id", "principal");
      return json({ ok: true });
    }
    const codigo = codigoNuevo();
    const sal = crypto.randomUUID();
    const hash = await sha256(sal + codigo.replace("-", ""));
    const { error } = await sb.from("recibo_equipo").upsert({ id: "principal", hash, sal, creado: new Date().toISOString() });
    if (error) return json({ error: "No se pudo guardar el código" }, 500);
    return json({ codigo });
  }

  // Personas invitadas: cada una con su código; Luis las ve y las puede quitar.
  if (accion === "invitar" || accion === "personas" || accion === "quitar_persona") {
    if (!luis) return json({ error: "Solo Luis puede manejar las personas del equipo" }, 403);
    if (accion === "personas") {
      const { data, error } = await sb.from("recibo_miembros").select("id,nombre,creado,ultimo_uso").eq("quitado", false).order("creado", { ascending: true });
      if (error) return json({ error: "No se pudo leer la lista" }, 500);
      return json({ personas: data || [] });
    }
    if (accion === "quitar_persona") {
      const id = String(b.id || "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Persona inválida" }, 400);
      const { error } = await sb.from("recibo_miembros").update({ quitado: true, quitado_en: new Date().toISOString() }).eq("id", id);
      if (error) return json({ error: "No se pudo quitar" }, 500);
      return json({ ok: true });
    }
    const nombre = String(b.nombre || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (nombre.length < 2) return json({ error: "Escribe el nombre de la persona" }, 400);
    const codigo = codigoNuevo();
    const { data, error } = await sb.from("recibo_miembros").insert({ nombre, hash: await sha256("persona:" + codigo.replace("-", "")) }).select("id").single();
    if (error) return json({ error: "No se pudo crear la invitación" }, 500);
    return json({ codigo, id: data.id, nombre });
  }

  if (!luis && !equipo) return json({ error: "Sin acceso: inicia sesión o escribe el código de equipo" }, 401);

  if (accion === "cambios") {
    const desde = typeof b.desde === "string" && !isNaN(Date.parse(b.desde)) ? b.desde : "1970-01-01T00:00:00Z";
    const ahora = new Date().toISOString();
    const { data, error } = await sb.from("recibo_docs")
      .select("coleccion,id,datos,version,borrado,actualizado_en")
      .gt("actualizado_en", desde).order("actualizado_en", { ascending: true }).limit(2000);
    if (error) return json({ error: "No se pudo leer" }, 500);
    // Las fotos no viajan aquí (pesan): solo se avisa que existen; se piden con "obtener".
    const docs = (data || []).map((d) => d.coleccion === "fotos" ? { ...d, datos: { pid: (d.datos as Record<string, unknown>)?.pid ?? null } } : d);
    return json({ docs, ahora });
  }

  const coleccion = String(b.coleccion || "");
  const id = String(b.id || "");
  if (!COLECCIONES.includes(coleccion) || !RE_ID.test(id)) return json({ error: "Documento inválido" }, 400);

  if (accion === "obtener") {
    const { data } = await sb.from("recibo_docs").select("datos,version,borrado").eq("coleccion", coleccion).eq("id", id).maybeSingle();
    if (!data || data.borrado) return json({ existe: false });
    return json({ existe: true, datos: data.datos, version: data.version });
  }

  if (accion === "guardar" || accion === "borrar") {
    const datos = accion === "guardar" ? (b.datos ?? {}) : {};
    if (typeof datos !== "object" || Array.isArray(datos)) return json({ error: "Datos inválidos" }, 400);
    if (JSON.stringify(datos).length > MAX_DOC) return json({ error: "Documento demasiado grande" }, 413);
    const { data: actual } = await sb.from("recibo_docs").select("version").eq("coleccion", coleccion).eq("id", id).maybeSingle();
    if (accion === "borrar" && !actual) return json({ ok: true, version: 0 });
    const fila = {
      coleccion, id, datos, version: (actual?.version || 0) + 1, borrado: accion === "borrar",
      actualizado_por: quien, actualizado_en: new Date().toISOString(),
    };
    const { error } = await sb.from("recibo_docs").upsert(fila, { onConflict: "coleccion,id" });
    if (error) return json({ error: "No se pudo guardar" }, 500);
    return json({ ok: true, version: fila.version });
  }

  return json({ error: "Acción desconocida" }, 400);
});
