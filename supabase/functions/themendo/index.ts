// Función "themendo" (proyecto Supabase de la Central de Luis).
// Cuaderno de lecciones de THEMENDO: guarda las lecciones que Luis marca con "Guardar lección"
// para que la tarea diaria las cargue en la habilidad de biblioteca del agente de Copilot.
// Solo entra Luis (su sesión de la Central).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const ESTADOS = ["nueva", "cargada", "descartada"];

async function esLuis(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return false;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) return false;
  const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
  const duenio = (lista?.users || []).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return !!duenio && duenio.id === data.user.id;
}

// "LECCIÓN · 2026-11-14 · Excel de inventarios" → "Excel de inventarios"
function temaDe(texto: string): string {
  const m = texto.match(/LECCI[ÓO]N\s*[·|-]\s*[\d-]{8,10}\s*[·|-]\s*([^\n]+)/i);
  if (m) return m[1].trim().slice(0, 80);
  const t = texto.match(/Tema\s*:\s*([^\n|]+)/i);
  return t ? t[1].trim().slice(0, 80) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }
  const accion = String(b.accion || "");
  const luis = await esLuis(req);
  if (accion === "estado") return json({ luis });
  if (!luis) return json({ error: "Inicia sesión con tu cuenta de la Central" }, 401);

  if (accion === "guardar") {
    const texto = String(b.texto || "").replace(/\r/g, "").trim().slice(0, 4000);
    if (texto.length < 10) return json({ error: "La lección está vacía" }, 400);
    const fila = { texto, tema: temaDe(texto) || String(b.tema || "").slice(0, 80) || null, origen: String(b.origen || "enlace").slice(0, 40) };
    const { data, error } = await sb.from("themendo_lecciones").insert(fila).select("id,creado").single();
    if (error) {
      if (error.code === "23505") return json({ ok: true, repetida: true });
      return json({ error: "No se pudo guardar" }, 500);
    }
    return json({ ok: true, id: data.id, creado: data.creado });
  }

  if (accion === "listar") {
    const { data, error } = await sb.from("themendo_lecciones").select("id,texto,tema,origen,estado,creado,cargada_en")
      .neq("estado", "descartada").order("creado", { ascending: false }).limit(300);
    if (error) return json({ error: "No se pudo leer" }, 500);
    return json({ lecciones: data || [] });
  }

  if (accion === "cambiar") {
    const id = String(b.id || "");
    const estado = String(b.estado || "");
    if (!/^[0-9a-f-]{36}$/.test(id) || !ESTADOS.includes(estado)) return json({ error: "Datos inválidos" }, 400);
    const cambio: Record<string, unknown> = { estado };
    if (typeof b.texto === "string" && b.texto.trim().length >= 10) { cambio.texto = b.texto.trim().slice(0, 4000); cambio.tema = temaDe(cambio.texto as string) || null; }
    const { error } = await sb.from("themendo_lecciones").update(cambio).eq("id", id);
    if (error) return json({ error: "No se pudo cambiar" }, 500);
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});
