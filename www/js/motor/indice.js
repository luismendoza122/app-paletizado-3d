// Índice de arrume (IA): qué tan "de base" es un artículo, de 0 a 1.
// IA = 0,45·peso + 0,30·resistencia + 0,15·densidad + 0,10·alto (cada uno en percentil dentro del CEDI).
// Bulto y líquido suben 0,10; delicado queda en máximo 0,2 (se multiplica por 0,2).

import { volumenM3 } from './articulo.js';

export const PESOS_IA = { peso: 0.45, resistencia: 0.3, densidad: 0.15, alto: 0.1 };
export const CORTES = { base: 0.66, tope: 0.33 };

// Percentil de cada valor dentro de la lista (0 = el menor, 1 = el mayor). Empates comparten valor.
function percentiles(valores) {
  const conDato = valores.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined);
  const res = new Array(valores.length).fill(null);
  if (conDato.length === 0) return res;
  if (conDato.length === 1) { res[conDato[0][1]] = 0.5; return res; }
  const orden = [...conDato].sort((a, b) => a[0] - b[0]);
  const n = orden.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && orden[j + 1][0] === orden[i][0]) j++;
    const p = ((i + j) / 2) / (n - 1);
    for (let k = i; k <= j; k++) res[orden[k][1]] = p;
    i = j + 1;
  }
  return res;
}

export function clasificar(ia, articulo, cortes = CORTES) {
  if (articulo.delicado) return 'TOPE';
  if (ia >= cortes.base) return 'BASE';
  if (ia < cortes.tope) return 'TOPE';
  return 'MEDIO';
}

// articulos: lista de artículos distintos (uno por código). Devuelve Map codigo → { ia, clase }.
export function calcularIndices(articulos, pesos = PESOS_IA, cortes = CORTES) {
  const peso = percentiles(articulos.map((a) => a.peso || null));
  const res = percentiles(articulos.map((a) => (a.maxCajasEncima ? a.maxCajasEncima * a.peso : null)));
  const dens = percentiles(articulos.map((a) => (volumenM3(a) > 0 ? a.peso / volumenM3(a) : null)));
  const alto = percentiles(articulos.map((a) => a.alto || null));
  const salida = new Map();
  articulos.forEach((a, i) => {
    // Si un componente no tiene dato, su peso se reparte entre los que sí tienen.
    const partes = [
      [pesos.peso, peso[i]],
      [pesos.resistencia, res[i]],
      [pesos.densidad, dens[i]],
      [pesos.alto, alto[i]],
    ].filter(([, v]) => v !== null);
    const suma = partes.reduce((s, [w]) => s + w, 0);
    let ia = suma > 0 ? partes.reduce((s, [w, v]) => s + w * v, 0) / suma : 0.5;
    if (a.empaque === 'BULTO') ia += 0.1;
    if (a.liquido) ia += 0.1;
    ia = Math.min(1, ia);
    // Delicado: siempre en TOPE, pero conserva su orden (el delicado pesado va antes que el liviano).
    if (a.delicado) ia = 0.2 * ia;
    ia = Math.round(ia * 1000) / 1000;
    salida.set(a.codigo, { ia, clase: clasificar(ia, a, cortes) });
  });
  return salida;
}
