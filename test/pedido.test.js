// Pruebas del armado de pedidos con varios artículos (pestaña Calcular palet): npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { leerListaPedido, lineasDesdeFilas, armarPedido, listaDeCarga, totalesPedido, unirLineas, pedidoParaThemendo, buscarArticulo } from '../www/js/motor/pedido.js';

const PALET = { largo: 1200, ancho: 1000, altoBase: 150, tara: 20, cargaMax: 1000, alturaMaxTotal: 1650, voladizoMax: 0 };
const art = (codigo, o = {}) => ({ codigo, nombre: `ART ${codigo}`, largo: 400, ancho: 300, alto: 250, peso: 8, empaque: 'CAJA', liquido: false, delicado: false, fragil: false, esteLadoArriba: true, maxCajasEncima: null, ...o });
const ARTS = new Map([
  ['7701001', art('7701001', { nombre: 'ACEITE 3000ML', peso: 18, liquido: true })],
  ['7701002', art('7701002', { nombre: 'ARROZ 500G', peso: 12 })],
  ['7701003', art('7701003', { nombre: 'GALLETAS', peso: 3, delicado: true, alto: 200 })],
  ['0045', art('0045', { nombre: 'DETERGENTE', peso: 10 })],
]);
const info = (seccionDe = () => 'Seco alimentos') => new Map([...ARTS].map(([c, a]) => [c, { art: a, ia: a.peso / 20, clase: a.peso >= 12 ? 'BASE' : a.delicado ? 'TOPE' : 'MEDIO', secuencia: Number(c) % 100, seccion: seccionDe(c), ubicacion: `12-0${c.slice(-2)}x1` }]));

test('lee la lista en varios formatos y suma repetidos', () => {
  const r = leerListaPedido(['CODIGO;CAJAS', '7701001;10', '7701002 20', '15 x 7701003', '7701002 - ARROZ 500G - 5 cajas', '45 3', 'NO EXISTE 99;4', '7701003 ilegible REVISAR'].join('\n'), ARTS);
  assert.deepEqual(r.lineas.sort((a, b) => a.codigo.localeCompare(b.codigo)), [
    { codigo: '0045', cajas: 3 }, { codigo: '7701001', cajas: 10 }, { codigo: '7701002', cajas: 25 }, { codigo: '7701003', cajas: 15 }]);
  assert.equal(r.sinArticulo.length, 2);
});

test('el peso del empaque (500G) no se toma como cantidad', () => {
  const r = leerListaPedido('7701002 ARROZ 500G', ARTS);
  assert.equal(r.lineas.length, 0); assert.equal(r.sinCantidad.length, 1);
});

test('códigos con ceros a la izquierda distintos', () => {
  assert.equal(buscarArticulo('045', ARTS).codigo, '0045');
  assert.equal(buscarArticulo('45', ARTS).codigo, '0045');
});

test('Excel o CSV con columnas CODIGO y CANTIDAD', () => {
  const r = lineasDesdeFilas([{ CODIGO: '7701001', CANTIDAD: 4 }, { CODIGO_ARTICULO: '7701002', CAJAS: '6' }], ARTS);
  assert.deepEqual(r.lineas, [{ codigo: '7701001', cajas: 4 }, { codigo: '7701002', cajas: 6 }]);
});

test('unir líneas y totales', () => {
  const l = unirLineas([{ codigo: '7701001', cajas: 2 }], [{ codigo: '7701001', cajas: 3 }, { codigo: '7701002', cajas: 0 }]);
  assert.deepEqual(l, [{ codigo: '7701001', cajas: 5 }]);
  const t = totalesPedido(l, ARTS);
  assert.equal(t.cajas, 5); assert.equal(t.peso, 90);
});

test('pedido de 100 cajas: arma palets sin pasar el peso ni la altura, pesado abajo', () => {
  const lineas = [{ codigo: '7701001', cajas: 40 }, { codigo: '7701002', cajas: 40 }, { codigo: '7701003', cajas: 20 }];
  const r = armarPedido(lineas, info(), PALET);
  assert.equal(r.resumen.cajas, 100);
  assert.ok(r.resumen.palets >= 2, `palets: ${r.resumen.palets}`);
  for (const e of r.estibas) {
    assert.ok(e.pesoTotal - PALET.tara <= PALET.cargaMax + 1e-6, `peso ${e.pesoTotal}`);
    assert.ok(e.alturaTotal <= PALET.alturaMaxTotal, `altura ${e.alturaTotal}`);
    // los delicados nunca quedan debajo de otra caja: ninguna caja más pesada encima de un delicado en el primer palet
    const lista = listaDeCarga(e);
    assert.equal(lista.reduce((s, x) => s + x.cajas, 0), e.totalCajas);
  }
  // en el primer palet lo primero que se pone es lo pesado
  const primero = [...r.estibas[0].cajas].sort((a, b) => a.orden - b.orden)[0];
  assert.notEqual(primero.codigo, '7701003');
  assert.equal(r.resumen.sobreDelicado, 0);
});

test('alimentos y no alimentos van en palets distintos', () => {
  const r = armarPedido([{ codigo: '7701002', cajas: 5 }, { codigo: '0045', cajas: 5 }], info((c) => (c === '0045' ? 'Seco no alimentos' : 'Seco alimentos')), PALET);
  assert.equal(r.grupos.length, 2);
  for (const e of r.estibas) assert.equal(new Set(e.cajas.map((c) => c.codigo)).size, 1);
});

test('artículo sin medidas queda aparte', () => {
  const inf = info(); inf.get('7701001').art = { ...ARTS.get('7701001'), peso: 0 };
  const r = armarPedido([{ codigo: '7701001', cajas: 3 }, { codigo: '7701002', cajas: 3 }], inf, PALET);
  assert.deepEqual(r.faltantes, ['7701001']); assert.equal(r.resumen.cajas, 3);
});

test('el texto para THEMENDO pide el formato CODIGO;CAJAS', () => {
  const t = pedidoParaThemendo(12);
  assert.match(t, /CODIGO;CAJAS/); assert.match(t, /No inventes/); assert.match(t, /12 artículos/);
});
