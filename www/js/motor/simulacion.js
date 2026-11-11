// Simula un pedido real: ordena sus cajas por la ruta y arma los palets con la ubicación
// actual y con la propuesta, para comparar.

import { armarEnSecuencia } from './secuencia.js';

// Grupos que no se mezclan en un palet: alimentos y no alimentos van aparte; cada zona fría aparte.
export function grupoDeZona(zona) {
  const z = String(zona || '').toLowerCase();
  if (z.includes('no alimentos')) return 'Seco no alimentos';
  if (z.includes('alimentos')) return 'Seco alimentos';
  return zona || 'Sin zona';
}

// mapaUbicaciones: Map codigoArticulo → { fila, art, ia } (dónde está el artículo en el escenario)
export function simularPedido(lineas, mapaUbicaciones, palet, reglas = {}) {
  const faltantes = [];
  const grupos = new Map();
  for (const l of lineas) {
    const u = mapaUbicaciones.get(String(l.CODIGO_ARTICULO).trim());
    const cajas = Math.max(0, Math.round(Number(l.CAJAS) || 0));
    if (!u) { faltantes.push(`${l.CODIGO_ARTICULO} ${l.ARTICULO || ''}`.trim()); continue; }
    const g = grupoDeZona(u.fila.SECCION);
    if (!grupos.has(g)) grupos.set(g, { cajas: [], estibas: 1 });
    const grupo = grupos.get(g);
    grupo.estibas = Math.max(grupo.estibas, Number(l.ESTIBAS_TAREA) === 2 ? 2 : 1);
    for (let i = 0; i < cajas; i++) {
      grupo.cajas.push({ art: u.art, ubicacion: u.fila.CODIGO, secuencia: Number(u.fila.SECUENCIA_RUTA) || 0, ia: u.ia });
    }
  }
  const resultados = [];
  for (const [zona, g] of grupos) {
    g.cajas.sort((a, b) => a.secuencia - b.secuencia);
    const r = armarEnSecuencia(g.cajas, palet, reglas, g.estibas);
    resultados.push({ zona, ...r });
  }
  return { grupos: resultados, faltantes, resumen: resumir(resultados) };
}

export function resumir(grupos) {
  const est = grupos.flatMap((g) => g.estibas);
  return {
    estibas: est.length,
    cajas: grupos.reduce((s, g) => s + g.totalCajas, 0),
    inversiones: grupos.reduce((s, g) => s + g.inversiones, 0),
    sobrecarga: grupos.reduce((s, g) => s + g.sobrecarga.length, 0),
    sobreDelicado: grupos.reduce((s, g) => s + g.sobreDelicado, 0),
    estibasExtra: grupos.reduce((s, g) => s + g.estibasExtra, 0),
    cgFuera: est.filter((e) => e.cgFuera).length,
    alturaMax: est.reduce((m, e) => Math.max(m, e.alturaTotal), 0),
  };
}
