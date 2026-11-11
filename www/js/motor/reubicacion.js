// Propuesta de reubicación (versión 1): reordena los artículos DENTRO de cada pasillo
// para que la ruta recoja primero lo de BASE, luego MEDIO y al final TOPE.
// Así nunca se sale de la zona y los movimientos quedan cerca.
// Las posiciones vacías no cuentan: no reciben ni entregan artículo. Las bloqueadas no se mueven.

import { numero } from './articulo.js';

const ORDEN_CLASE = { BASE: 0, MEDIO: 1, TOPE: 2 };

function cabeEnHueco(art, fila) {
  const hA = numero(fila.HUECO_ANCHO_MM), hF = numero(fila.HUECO_FONDO_MM), hH = numero(fila.HUECO_ALTO_MM);
  if (!hA || !hF || !hH) return true; // sin medidas de hueco no se valida
  const base = [art.largo, art.ancho].sort((a, b) => a - b);
  const hueco = [hA, hF].sort((a, b) => a - b);
  return base[0] <= hueco[0] && base[1] <= hueco[1] && art.alto <= hH;
}

function pesoPermitido(art, fila) {
  const max = numero(fila.PESO_MAX_KG);
  return !max || art.peso <= max;
}

// posiciones: [{ fila, art, ia, clase, lineas }] solo ocupadas. Devuelve plan de movimientos.
export function proponerReubicacion(posiciones, opciones = {}) {
  const { ventana = 10 } = opciones;
  const porPasillo = new Map();
  for (const p of posiciones) {
    const k = p.fila.PASILLO;
    if (!porPasillo.has(k)) porPasillo.set(k, []);
    porPasillo.get(k).push(p);
  }
  const asignacion = new Map(); // CODIGO ubicación → posición (artículo) que va ahí
  const excepciones = [];
  for (const [pasillo, lista] of porPasillo) {
    const libres = lista.filter((p) => String(p.fila.BLOQUEADA ?? '').toUpperCase() !== 'SI')
      .sort((a, b) => Number(a.fila.SECUENCIA_RUTA) - Number(b.fila.SECUENCIA_RUTA));
    for (const p of lista) if (!libres.includes(p)) asignacion.set(p.fila.CODIGO, p);
    // BASE primero; dentro de la clase, lo que más sale primero (frente pesado) y luego el índice.
    const pendientes = [...libres].sort((a, b) =>
      ORDEN_CLASE[a.clase] - ORDEN_CLASE[b.clase] || (b.lineas || 0) - (a.lineas || 0) || b.ia - a.ia || a.fila.CODIGO.localeCompare(b.fila.CODIGO));
    for (const destino of libres) {
      let idx = pendientes.findIndex((p, i) => i < ventana && cabeEnHueco(p.art, destino.fila) && pesoPermitido(p.art, destino.fila));
      if (idx === -1) {
        idx = 0;
        excepciones.push(`${destino.fila.CODIGO}: ${pendientes[0].art.nombre} no cumple hueco o peso; revisar a mano`);
      } else if (idx > 0) {
        excepciones.push(`${destino.fila.CODIGO}: se saltó el orden ideal por medidas del hueco`);
      }
      asignacion.set(destino.fila.CODIGO, pendientes[idx]);
      pendientes.splice(idx, 1);
    }
    void pasillo;
  }
  const movimientos = [];
  for (const p of posiciones) {
    const nueva = [...asignacion.entries()].find(([, q]) => q === p)?.[0];
    if (nueva && nueva !== p.fila.CODIGO) {
      movimientos.push({
        codigoArticulo: p.art.codigo, articulo: p.art.nombre, clase: p.clase,
        desde: p.fila.CODIGO, hacia: nueva, pasillo: p.fila.PASILLO,
      });
    }
  }
  // Orden de ejecución: por pasillo y por ubicación de destino.
  movimientos.sort((a, b) => String(a.pasillo).localeCompare(String(b.pasillo)) || a.hacia.localeCompare(b.hacia));
  // Mapa nuevo: CODIGO ubicación → artículo
  const nuevoMapa = new Map([...asignacion.entries()].map(([cod, p]) => [cod, p]));
  return { movimientos, excepciones, nuevoMapa, ciclos: contarCiclos(movimientos) };
}

// Cuántas cadenas cerradas (A→B→…→A) hay: cada una necesita una ubicación temporal.
function contarCiclos(movs) {
  const sig = new Map(movs.map((m) => [m.desde, m.hacia]));
  const visto = new Set();
  let ciclos = 0;
  for (const inicio of sig.keys()) {
    if (visto.has(inicio)) continue;
    let actual = inicio;
    const camino = new Set();
    while (sig.has(actual) && !visto.has(actual) && !camino.has(actual)) { camino.add(actual); actual = sig.get(actual); }
    if (camino.has(actual)) ciclos++;
    camino.forEach((c) => visto.add(c));
  }
  return ciclos;
}
