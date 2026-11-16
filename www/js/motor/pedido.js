// Armar palets de un pedido con varios artículos (pestaña Calcular palet).
// Entra una lista { codigo, cajas } con artículos ya medidos y sale cuántos palets salen,
// qué lleva cada uno, su peso, sus medidas y las alertas (sobrepeso, centro de gravedad, delicados).

import { armarEnSecuencia } from './secuencia.js';
import { grupoDeZona } from './simulacion.js';

export const MAX_CAJAS_PEDIDO = 3000;
const RANGO_CLASE = { BASE: 0, MEDIO: 1, TOPE: 2 };

const limpio = (v) => String(v ?? '').trim().toUpperCase();
const sinCeros = (v) => limpio(v).replace(/^0+(?=\d)/, '');

// Busca el artículo de un código escrito (acepta ceros a la izquierda distintos).
export function buscarArticulo(codigo, articulos) {
  const c = limpio(codigo);
  if (!c) return null;
  if (articulos.has(c)) return articulos.get(c);
  const c2 = sinCeros(c);
  for (const [k, a] of articulos) if (sinCeros(k) === c2) return a;
  return null;
}

// Lee una lista pegada o devuelta por THEMENDO. Cada línea trae un código y una cantidad de cajas:
//   "1234;10"  "1234 10"  "10 x 1234"  "1234 - ARROZ 500G - 10 cajas"  "CODIGO;CAJAS" (encabezado, se ignora)
// articulos: Map codigo → articulo (con .codigo y .nombre). Devuelve { lineas, sinArticulo, sinCantidad }.
export function leerListaPedido(texto, articulos) {
  const suma = new Map();
  const sinArticulo = [];
  const sinCantidad = [];
  const codigos = [...articulos.keys()].map(limpio).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const linea = bruta.replace(/[`*|]/g, ' ').trim();
    if (!linea || /^(codigo|código|cod)\b/i.test(linea) || /^-+$/.test(linea)) continue;
    if (/\bREVISAR\b/i.test(linea)) { sinArticulo.push(bruta.trim()); continue; }
    const tokens = linea.toUpperCase().split(/[\s;,\t:=]+/).filter(Boolean);
    // 1) el código: el token que sea un código conocido (el más largo primero)
    let codigo = null;
    for (const t of tokens) {
      const a = buscarArticulo(t, articulos);
      if (a && (!codigo || a.codigo.length > codigo.length)) codigo = a.codigo;
    }
    if (!codigo) {
      // por si el código viene pegado a otro texto (ej. "COD1234")
      const arriba = linea.toUpperCase();
      codigo = codigos.find((c) => c.length >= 4 && new RegExp(`(^|[^0-9A-Z])${c.replace(/[^0-9A-Z]/g, '')}([^0-9A-Z]|$)`).test(arriba)) || null;
      if (codigo) codigo = buscarArticulo(codigo, articulos).codigo;
    }
    if (!codigo) { sinArticulo.push(bruta.trim()); continue; }
    // 2) la cantidad: un número junto a "cajas/cj/und/x", si no el último número que no sea el código
    const sinCodigo = linea.toUpperCase().split(/[\s;,\t:=]+/).filter((t) => sinCeros(t) !== sinCeros(codigo)).join(' ');
    const m = sinCodigo.match(/(\d+)\s*(CAJAS?|CJS?|UND|UNIDADES|BULTOS?)\b/) || sinCodigo.match(/\bX\s*(\d+)\b/) || sinCodigo.match(/\b(\d+)\s*X\b/);
    let cajas = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(cajas)) {
      const nums = sinCodigo.match(/(?<![\d.,])\d{1,4}(?![\d.,]*\s*(G|GR|KG|ML|L|LT|MM|CM|M|OZ)\b)/g) || [];
      cajas = nums.length ? Number(nums[nums.length - 1]) : NaN;
    }
    if (!Number.isFinite(cajas) || cajas <= 0) { sinCantidad.push(bruta.trim()); continue; }
    suma.set(codigo, (suma.get(codigo) || 0) + Math.round(cajas));
  }
  return { lineas: [...suma].map(([codigo, cajas]) => ({ codigo, cajas })), sinArticulo, sinCantidad };
}

// Filas de un Excel o CSV con columnas de código y cantidad.
export function lineasDesdeFilas(filas, articulos) {
  const col = (f, nombres) => { for (const n of nombres) if (f[n] !== undefined && f[n] !== '') return f[n]; return ''; };
  const texto = filas.map((f) => `${col(f, ['CODIGO_ARTICULO', 'CODIGO', 'COD_ARTICULO', 'ARTICULO_CODIGO', 'SKU', 'EAN', 'GTIN'])};${col(f, ['CAJAS', 'CANTIDAD', 'CANT', 'BULTOS', 'UNIDADES'])}`).join('\n');
  return leerListaPedido(texto, articulos);
}

// Junta líneas repetidas y quita las de 0 cajas.
export function unirLineas(...listas) {
  const m = new Map();
  for (const l of listas.flat()) {
    const n = Math.max(0, Math.round(Number(l.cajas) || 0));
    if (l.codigo && n) m.set(l.codigo, (m.get(l.codigo) || 0) + n);
  }
  return [...m].map(([codigo, cajas]) => ({ codigo, cajas }));
}

// Totales antes de armar: cajas, peso y volumen.
export function totalesPedido(lineas, articulos) {
  let cajas = 0, peso = 0, volumen = 0;
  for (const l of lineas) {
    const a = buscarArticulo(l.codigo, articulos);
    if (!a) continue;
    cajas += l.cajas; peso += l.cajas * (a.peso || 0); volumen += l.cajas * (a.largo * a.ancho * a.alto) / 1e9;
  }
  return { cajas, peso, volumen };
}

// Arma los palets. info: Map codigo → { art, ia, clase, secuencia, seccion }.
// opciones.orden: 'peso' (pesado y resistente primero, recomendado) o 'ruta' (orden de la ruta de picking).
// opciones.separar: alimentos y no alimentos (y cada zona fría) en palets distintos.
export function armarPedido(lineas, info, palet, reglas = {}, opciones = {}) {
  const { orden = 'peso', separar = true } = opciones;
  const faltantes = [];
  const grupos = new Map();
  let total = 0;
  for (const l of lineas) {
    const d = info.get(l.codigo);
    if (!d || !d.art.largo || !d.art.ancho || !d.art.alto || !d.art.peso) { faltantes.push(l.codigo); continue; }
    const g = separar ? grupoDeZona(d.seccion) : 'Pedido';
    if (!grupos.has(g)) grupos.set(g, []);
    const n = Math.min(l.cajas, MAX_CAJAS_PEDIDO - total);
    total += n;
    for (let i = 0; i < n; i++) grupos.get(g).push({ art: d.art, ubicacion: d.ubicacion || '', secuencia: d.secuencia || 0, ia: d.ia, clase: d.clase });
  }
  const resultado = [];
  for (const [zona, cajas] of grupos) {
    if (orden === 'ruta') cajas.sort((a, b) => a.secuencia - b.secuencia);
    else {
      // Pesado y resistente abajo: BASE → MEDIO → TOPE; dentro de cada clase el de mayor índice primero;
      // los delicados y los livianos al final. Las cajas iguales quedan juntas (capas parejas).
      cajas.sort((a, b) => (Number(a.art.delicado) - Number(b.art.delicado))
        || ((RANGO_CLASE[a.clase] ?? 1) - (RANGO_CLASE[b.clase] ?? 1))
        || ((b.ia ?? 0) - (a.ia ?? 0))
        || (b.art.peso - a.art.peso)
        || ((b.art.largo * b.art.ancho) - (a.art.largo * a.art.ancho))
        || String(a.art.codigo).localeCompare(String(b.art.codigo)));
    }
    const r = armarEnSecuencia(cajas, palet, reglas, 1);
    resultado.push({ zona, ...r });
  }
  const estibas = resultado.flatMap((g) => g.estibas.map((e) => ({ ...e, zona: g.zona, ...medidasEstiba(e, palet) })));
  return {
    grupos: resultado,
    estibas,
    faltantes,
    recortado: total >= MAX_CAJAS_PEDIDO,
    resumen: {
      palets: estibas.length,
      cajas: estibas.reduce((s, e) => s + e.totalCajas, 0),
      pesoTotal: Math.round(estibas.reduce((s, e) => s + e.pesoTotal, 0) * 10) / 10,
      pesoMax: estibas.reduce((m, e) => Math.max(m, e.pesoTotal), 0),
      alturaMax: estibas.reduce((m, e) => Math.max(m, e.alturaTotal), 0),
      sobrecarga: resultado.reduce((s, g) => s + g.sobrecarga.length, 0),
      sobreDelicado: resultado.reduce((s, g) => s + g.sobreDelicado, 0),
      cgFuera: estibas.filter((e) => e.cgFuera).length,
      noCaben: resultado.flatMap((g) => g.noCaben).length,
    },
  };
}

// Medidas reales de un palet armado (lo que ocupa con las cajas, incluida la estiba).
export function medidasEstiba(e, palet) {
  let maxX = 0, maxY = 0;
  for (const c of e.cajas) { maxX = Math.max(maxX, c.x + c.dx); maxY = Math.max(maxY, c.y + c.dy); }
  return { largoOcupado: Math.max(palet.largo, Math.round(maxX)), anchoOcupado: Math.max(palet.ancho, Math.round(maxY)), sobrePeso: palet.cargaMax ? e.pesoTotal - (palet.tara || 0) > palet.cargaMax + 1e-6 : false };
}

// Lista de carga de un palet: artículo, cajas y peso, en orden de armado (lo de abajo primero).
export function listaDeCarga(estiba) {
  const m = new Map();
  for (const c of [...estiba.cajas].sort((a, b) => a.orden - b.orden)) {
    if (!m.has(c.codigo)) m.set(c.codigo, { codigo: c.codigo, nombre: c.nombre, cajas: 0, peso: 0, delicado: c.delicado, liquido: c.liquido });
    const x = m.get(c.codigo); x.cajas++; x.peso += c.peso || 0;
  }
  return [...m.values()].map((x) => ({ ...x, peso: Math.round(x.peso * 10) / 10 }));
}

// Texto que se copia para THEMENDO junto con la foto del pedido.
export function pedidoParaThemendo(cantidadArticulos) {
  return [
    'THEMENDO: te mando la foto de un pedido para armar palets en Paletizado 3D.',
    'Lee la foto y devuélveme SOLO un bloque de texto con una línea por artículo, así:',
    'CODIGO;CAJAS',
    '1234567;10',
    '',
    'Reglas:',
    '- CODIGO = el código del artículo tal como sale en la foto (sin puntos ni espacios).',
    '- CAJAS = la cantidad de cajas o bultos pedidos (número entero).',
    '- Si un renglón no se lee bien, escríbelo al final con la palabra REVISAR.',
    '- No inventes códigos ni cantidades. No agregues explicaciones dentro del bloque.',
    `(En Paletizado hay ${cantidadArticulos} artículos medidos; los que no estén medidos la app los marcará aparte.)`,
  ].join('\n');
}
