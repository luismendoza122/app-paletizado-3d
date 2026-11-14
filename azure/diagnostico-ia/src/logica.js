// Lógica de la función (sin Azure, para poder probarla con `npm test`).
// Regla de oro: aunque la app mande algo de más, aquí solo pasa lo que está en la lista permitida.

const CODIGO_POSICION = /^[A-Z0-9]{2,4}-\d{3}[xyz][1-3][AB]?$/; // ej. 12-001x1, LA52-004y3, 05-010z2
const ZONAS = ['Seco no alimentos', 'Seco alimentos', 'Lácteos', 'Temperado', 'Fruver', 'Congelado'];
const PASILLO = /^[A-Z0-9]{2,4}$/;
export const LIMITE_BYTES = 20000;

const num = (v, max = 100000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : 0;
};
const codigos = (lista) => (Array.isArray(lista) ? lista : []).filter((c) => typeof c === 'string' && CODIGO_POSICION.test(c)).slice(0, 5);
const conteo = (c = {}) => ({ total: num(c.total), completas: num(c.completas), incompletas: num(c.incompletas), vacias: num(c.vacias), sinRevisar: num(c.sinRevisar) });

// Devuelve { ok, resumen } o { ok: false, error }.
export function limpiarResumen(entrada) {
  const r = entrada?.resumen;
  if (!r || typeof r !== 'object' || r.version !== 1) return { ok: false, error: 'Resumen inválido (versión 1 esperada).' };
  if (!r.avance || !Array.isArray(r.pasillos)) return { ok: false, error: 'Faltan avance o pasillos.' };
  const p = r.palet || {};
  return {
    ok: true,
    resumen: {
      avance: conteo(r.avance),
      zonas: (Array.isArray(r.zonas) ? r.zonas : []).filter((z) => ZONAS.includes(z?.zona)).map((z) => ({ zona: z.zona, ...conteo(z) })),
      pasillos: r.pasillos.filter((x) => typeof x?.pasillo === 'string' && PASILLO.test(x.pasillo)).slice(0, 40).map((x) => ({
        pasillo: x.pasillo,
        zona: ZONAS.includes(x.zona) ? x.zona : '',
        posicionesConDatos: num(x.posicionesConDatos, 500),
        ordenPct: num(x.ordenPct, 100),
        delicadosAlInicio: codigos(x.delicadosAlInicio),
        pesadosAlFinal: codigos(x.pesadosAlFinal),
        livianosAlInicio: num(x.livianosAlInicio, 500),
        clases: { BASE: num(x.clases?.BASE, 500), MEDIO: num(x.clases?.MEDIO, 500), TOPE: num(x.clases?.TOPE, 500) },
      })),
      medidasSospechosas: num(r.medidasSospechosas, 5000),
      palet: { largoMm: num(p.largoMm, 5000), anchoMm: num(p.anchoMm, 5000), altoBaseMm: num(p.altoBaseMm, 1000), alturaMaxTotalMm: num(p.alturaMaxTotalMm, 5000), cargaMaxKg: num(p.cargaMaxKg, 5000), confirmado: p.confirmado === true },
      pedidosCargados: num(r.pedidosCargados, 100000),
      propuesta: r.propuesta ? { movimientos: num(r.propuesta.movimientos), ciclos: num(r.propuesta.ciclos) } : null,
    },
  };
}

export const INSTRUCCIONES = `Eres el analista de paletizado del CEDI ATS R10 Valledupar (Colombia). Respondes en español de Colombia, claro y corto, para un operador logístico.
Reglas del proyecto:
- Cada artículo tiene clase BASE (pesado y resistente), MEDIO o TOPE (liviano o delicado).
- En cada pasillo la ruta de picking debe ir BASE → MEDIO → TOPE, para que el palet salga con lo pesado abajo y lo delicado arriba. "ordenPct" = 100 es orden perfecto.
- Delicados al inicio de la ruta o pesados al final son los problemas más graves.
- Las posiciones vacías no cuentan. No se cambia un artículo de zona; solo se reordena dentro del pasillo.
- Medidas en milímetros y pesos en kilos; "medidasSospechosas" son medidas que parecen tomadas en centímetros.
- Alimentos (pasillos 12–19) y no alimentos (05–11) nunca van en el mismo palet.
Con el resumen que te dan (solo conteos y códigos de posición, sin nombres de artículos):
1. Diagnóstico en 2 o 3 frases.
2. Los 3 a 5 problemas más importantes, con el pasillo y códigos de posición.
3. El siguiente paso concreto para esta semana.
Máximo 250 palabras. No inventes datos que no estén en el resumen. Si faltan datos, dilo.`;

export function construirMensajes(resumen) {
  return [
    { role: 'system', content: INSTRUCCIONES },
    { role: 'user', content: `Resumen del CEDI (JSON):\n${JSON.stringify(resumen)}` },
  ];
}

// Encabezados CORS: solo la APK (https://localhost) y las páginas permitidas.
export function encabezadosCors(origen, permitidos) {
  const lista = String(permitidos || 'https://localhost,capacitor://localhost').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-functions-key', Vary: 'Origin' };
  if (origen && lista.includes(origen)) h['Access-Control-Allow-Origin'] = origen;
  return h;
}

// Llama a Azure OpenAI (API v1). config = { endpoint, clave, despliegue }.
export async function llamarAzureOpenAI(resumen, config, fetchFn = fetch) {
  const base = String(config.endpoint || '').replace(/\/+$/, '');
  const url = base.endsWith('/openai/v1') ? `${base}/chat/completions` : `${base}/openai/v1/chat/completions`;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 40000);
  try {
    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': config.clave },
      body: JSON.stringify({ model: config.despliegue, messages: construirMensajes(resumen), max_completion_tokens: 2000 }),
      signal: control.signal,
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Azure OpenAI ${r.status}: ${cuerpo?.error?.message || 'sin detalle'}`);
    return { texto: cuerpo?.choices?.[0]?.message?.content?.trim() || 'La IA no devolvió texto.', modelo: cuerpo?.model || config.despliegue };
  } finally {
    clearTimeout(reloj);
  }
}
