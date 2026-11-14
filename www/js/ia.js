// Diagnóstico con IA en Azure (Azure OpenAI, dentro de la cuenta de Azure de Luis o de la empresa).
// Protección de datos:
//  - A la IA solo le llega un RESUMEN: conteos, % de orden por pasillo, códigos de posición y clase.
//    Nunca nombres de artículos, códigos de artículo, pesos ni medidas.
//  - La clave de Azure OpenAI NO está en la app: vive en la Función de Azure (azure/diagnostico-ia).
//    En el celular solo se guarda la dirección de la función y su código de acceso (pestaña Ajustes).
import { ZONAS, estadoDe } from './datos/layout.js';
import { analizarPasillo } from './agente.js';

const MAX_CODIGOS = 5; // máximo de códigos de posición de ejemplo por problema

function conteo(filas) {
  const vivas = filas.filter((f) => f.ESTADO !== 'DIVIDIDA');
  const c = { total: vivas.length, completas: 0, incompletas: 0, vacias: 0, sinRevisar: 0 };
  for (const f of vivas) {
    const e = estadoDe(f);
    if (e === 'COMPLETA') c.completas++;
    else if (e === 'INCOMPLETA') c.incompletas++;
    else if (e === 'VACIA') c.vacias++;
    else c.sinRevisar++;
  }
  return c;
}

// Arma el resumen que se envía a la IA. Solo números, códigos de posición y clases.
export function resumenParaIA(ctx) {
  const pasillos = [];
  for (const { zona, pasillos: lista } of ZONAS) {
    for (const pasillo of lista) {
      const a = analizarPasillo(ctx.posiciones, pasillo);
      if (!a.n) continue;
      pasillos.push({
        pasillo, zona, posicionesConDatos: a.n, ordenPct: a.orden,
        delicadosAlInicio: a.delicadosAlInicio.slice(0, MAX_CODIGOS).map((p) => p.fila.CODIGO),
        pesadosAlFinal: a.pesadosAlFinal.slice(0, MAX_CODIGOS).map((p) => p.fila.CODIGO),
        livianosAlInicio: a.livianosAlInicio.length,
        clases: ['BASE', 'MEDIO', 'TOPE'].reduce((o, k) => ({ ...o, [k]: a.lista.filter((p) => p.clase === k).length }), {}),
      });
    }
  }
  const sospechosas = ctx.posiciones.filter((p) => p.art.largo > 0 && (p.art.largo < 60 || p.art.ancho < 60 || p.art.alto < 60)).length;
  const p = ctx.palet || {};
  return {
    version: 1,
    avance: conteo(ctx.filas),
    zonas: ZONAS.map(({ zona }) => ({ zona, ...conteo(ctx.filas.filter((f) => f.SECCION === zona)) })).filter((z) => z.total),
    pasillos,
    medidasSospechosas: sospechosas,
    palet: { largoMm: p.largo, anchoMm: p.ancho, altoBaseMm: p.altoBase, alturaMaxTotalMm: p.alturaMaxTotal, cargaMaxKg: p.cargaMax, confirmado: !!ctx.paletConfirmado },
    pedidosCargados: new Set((ctx.pedidos || []).map((x) => x.PEDIDO)).size,
    propuesta: ctx.propuesta ? { movimientos: ctx.propuesta.movimientos?.length || 0, ciclos: ctx.propuesta.ciclos || 0 } : null,
  };
}

// La dirección debe ser https y de Azure (evita mandar el resumen a otro sitio por error).
export function direccionValida(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /\.(azurewebsites\.net|azure-api\.net|azurefd\.net)$/i.test(u.hostname);
  } catch { return false; }
}

// Llama a la Función de Azure. config = { url, codigo }. Devuelve { texto, modelo }.
export async function pedirDiagnosticoIA(resumen, config, { tiempoMs = 45000, fetchFn = fetch } = {}) {
  if (!config?.url || !config?.codigo) throw new Error('Falta configurar la IA de Azure en Ajustes.');
  if (!direccionValida(config.url)) throw new Error('La dirección de la función debe ser https y de Azure (…azurewebsites.net).');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), tiempoMs);
  try {
    const r = await fetchFn(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-functions-key': config.codigo },
      body: JSON.stringify({ resumen }),
      signal: control.signal,
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw new Error('El código de acceso no es válido. Revísalo en Ajustes.');
    if (!r.ok) throw new Error(cuerpo.error || `La IA respondió con error ${r.status}.`);
    return { texto: String(cuerpo.texto || ''), modelo: cuerpo.modelo || '' };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('La IA tardó demasiado. Intenta de nuevo con mejor señal.');
    throw e;
  } finally {
    clearTimeout(reloj);
  }
}
