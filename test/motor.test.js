// Pruebas del motor: correr con  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { mejorCapa, paletMono } from '../www/js/motor/mono.js';
import { armarEnSecuencia } from '../www/js/motor/secuencia.js';
import { calcularIndices } from '../www/js/motor/indice.js';
import { proponerReubicacion } from '../www/js/motor/reubicacion.js';
import { articuloDesdeFila } from '../www/js/motor/articulo.js';
import { simularPedido } from '../www/js/motor/simulacion.js';

const PALET = { largo: 1200, ancho: 1000, altoBase: 150, tara: 20, cargaMax: 1000, alturaMaxTotal: 1650, voladizoMax: 0 };
const caja = (o) => ({ codigo: 'X', nombre: 'Caja', largo: 400, ancho: 300, alto: 250, peso: 8, empaque: 'CAJA', liquido: false, delicado: false, fragil: false, esteLadoArriba: true, maxCajasEncima: null, ...o });

test('caso 1: 1200x800 con 600x400 → 4 por capa', () => {
  assert.equal(mejorCapa(1200, 800, 600, 400).n, 4);
});

test('caso 2: 1200x1000 con 400x300 → 10 por capa (dos bloques)', () => {
  const r = mejorCapa(1200, 1000, 400, 300);
  assert.equal(r.n, 10);
  assert.equal(r.rects.length, 10);
});

test('las cajas de una capa no se cruzan y están dentro del palet', () => {
  const r = mejorCapa(1200, 1000, 370, 260);
  for (const a of r.rects) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.dx <= 1200 && a.y + a.dy <= 1000);
    for (const b of r.rects) if (a !== b) assert.ok(!(a.x < b.x + b.dx && b.x < a.x + a.dx && a.y < b.y + b.dy && b.y < a.y + a.dy));
  }
});

test('caso 3: altura máx 1650 → 6 capas, 60 cajas, limita la altura', () => {
  const r = paletMono(caja(), PALET);
  assert.equal(r.capas, 6); assert.equal(r.totalCajas, 60); assert.equal(r.limitante, 'altura');
});

test('caso 4: 30 kg y carga 1000 → 33 cajas, limita el peso', () => {
  const r = paletMono(caja({ peso: 30 }), PALET);
  assert.equal(r.totalCajas, 33); assert.equal(r.limitante, 'peso');
});

test('caso 5: aguanta 3 encima → 4 capas', () => {
  const r = paletMono(caja({ maxCajasEncima: 3 }), PALET);
  assert.equal(r.capas, 4); assert.equal(r.totalCajas, 40); assert.equal(r.limitante, 'compresion');
});

test('caso 7: sin peso no calcula', () => {
  assert.deepEqual(paletMono(caja({ peso: 0 }), PALET).datosFaltantes, ['peso']);
});

test('caso 11: bulto que se puede acostar, 1200 mm útiles → 48', () => {
  const r = paletMono(caja({ esteLadoArriba: false, empaque: 'BULTO' }), { ...PALET, alturaMaxTotal: 1350 });
  assert.equal(r.totalCajas, 48);
});

function cajasDe(lista) {
  return lista.flatMap(([art, n, ia]) => Array.from({ length: n }, () => ({ art, ubicacion: art.codigo, ia })));
}
const PESADA = caja({ codigo: 'P', nombre: 'Pesada', peso: 20, maxCajasEncima: 6 });
const LIVIANA = caja({ codigo: 'L', nombre: 'Liviana', peso: 2, delicado: true, fragil: true });

test('secuencia (a): pesado → liviano = 0 inversiones y sin sobrecarga', () => {
  const r = armarEnSecuencia(cajasDe([[PESADA, 10, 0.9], [LIVIANA, 10, 0.1]]), PALET, {}, 1);
  assert.equal(r.inversiones, 0); assert.equal(r.sobrecarga.length, 0); assert.equal(r.sobreDelicado, 0);
  assert.equal(r.estibas[0].totalCajas, 20);
});

test('secuencia (b): liviano → pesado = inversiones y delicado aplastado', () => {
  const r = armarEnSecuencia(cajasDe([[LIVIANA, 10, 0.1], [PESADA, 10, 0.9]]), PALET, {}, 1);
  assert.ok(r.inversiones > 0); assert.ok(r.sobrecarga.length > 0); assert.ok(r.sobreDelicado > 0);
});

test('secuencia: ninguna caja se cruza ni flota', () => {
  const r = armarEnSecuencia(cajasDe([[PESADA, 25, 0.9], [caja({ codigo: 'M', largo: 350, ancho: 250, alto: 200, peso: 6 }), 30, 0.5]]), PALET, {}, 1);
  for (const e of r.estibas) {
    for (const a of e.cajas) {
      assert.ok(a.x + a.dx <= 1200 && a.y + a.dy <= 1000 && 150 + a.z + a.dz <= 1650);
      if (a.z > 0) assert.ok(e.cajas.some((b) => b.z + b.dz === a.z && a.x < b.x + b.dx && b.x < a.x + a.dx && a.y < b.y + b.dy && b.y < a.y + a.dy));
      for (const b of e.cajas) if (a !== b) assert.ok(!(a.x < b.x + b.dx && b.x < a.x + a.dx && a.y < b.y + b.dy && b.y < a.y + a.dy && a.z < b.z + b.dz && b.z < a.z + a.dz));
    }
  }
});

test('secuencia (d): 2 estibas a la vez → ambas con base pesada y alturas parecidas', () => {
  const r = armarEnSecuencia(cajasDe([[PESADA, 40, 0.9], [caja({ codigo: 'M', peso: 6 }), 40, 0.5]]), PALET, {}, 2);
  assert.equal(r.estibas.length, 2);
  for (const e of r.estibas) assert.ok(e.cajas.filter((c) => c.z === 0).every((c) => c.codigo === 'P'));
  assert.ok(Math.abs(r.estibas[0].alturaTotal - r.estibas[1].alturaTotal) <= 250);
});

test('índice: delicado queda en TOPE y el bulto pesado en BASE', () => {
  const arts = [caja({ codigo: 'A', peso: 25, empaque: 'BULTO' }), caja({ codigo: 'B', peso: 10 }), caja({ codigo: 'C', peso: 3, delicado: true }), caja({ codigo: 'D', peso: 5 })];
  const m = calcularIndices(arts);
  assert.equal(m.get('A').clase, 'BASE');
  assert.equal(m.get('C').clase, 'TOPE');
});

test('reubicación: dentro del pasillo, BASE queda en las primeras posiciones de la ruta', () => {
  const fila = (cod, sec, art) => ({ fila: { CODIGO: cod, PASILLO: '05', SECCION: 'Seco no alimentos', SECUENCIA_RUTA: sec }, art, ...art.__ix });
  const ligero = { ...caja({ codigo: 'L1', nombre: 'Ligero', peso: 2 }), __ix: { ia: 0.1, clase: 'TOPE' } };
  const pesado = { ...caja({ codigo: 'P1', nombre: 'Pesado', peso: 20 }), __ix: { ia: 0.9, clase: 'BASE' } };
  const medio = { ...caja({ codigo: 'M1', nombre: 'Medio', peso: 8 }), __ix: { ia: 0.5, clase: 'MEDIO' } };
  const pos = [fila('05-001x1', 1, ligero), fila('05-001x2', 2, medio), fila('05-002x1', 3, pesado)];
  const r = proponerReubicacion(pos);
  assert.equal(r.nuevoMapa.get('05-001x1').art.codigo, 'P1');
  assert.equal(r.nuevoMapa.get('05-002x1').art.codigo, 'L1');
  assert.equal(r.movimientos.length, 2);
  assert.equal(r.ciclos, 1);
});

test('fila de la hoja → artículo, y simulación de un pedido', () => {
  const { articulo, faltan } = articuloDesdeFila({ ARTICULO: 'Aceite 3L x4', CODIGO_ARTICULO: '1001', LARGO_A_MM: 400, ANCHO_B_MM: 300, ALTO_H_MM: 330, PESO_KG: 11.5, EMPAQUE: 'CAJA', LIQUIDO: 'SI', DELICADO: 'NO', SECCION: 'Seco alimentos' });
  assert.deepEqual(faltan, []);
  assert.equal(articulo.liquido, true);
  const mapa = new Map([['1001', { fila: { CODIGO: '12-001x1', SECCION: 'Seco alimentos', SECUENCIA_RUTA: 1 }, art: articulo, ia: 0.8 }]]);
  const s = simularPedido([{ CODIGO_ARTICULO: '1001', CAJAS: 12, ESTIBAS_TAREA: 1 }, { CODIGO_ARTICULO: '9999', CAJAS: 3 }], mapa, PALET);
  assert.equal(s.resumen.cajas, 12);
  assert.equal(s.faltantes.length, 1);
});
