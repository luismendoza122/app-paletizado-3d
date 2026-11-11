import test from 'node:test';
import assert from 'node:assert/strict';
import { hojasExcel, textoDiagnostico, filasDiagnostico, nombreArchivo } from '../www/js/exportar.js';
import { generarLayout, COLUMNAS } from '../www/js/datos/layout.js';
import { articuloDesdeFila } from '../www/js/motor/articulo.js';

const filas = generarLayout();
filas[0] = { ...filas[0], ARTICULO: 'ACEITE 1L X12', CODIGO_ARTICULO: '1001', LARGO_A_MM: '300', ANCHO_B_MM: '200', ALTO_H_MM: '250', PESO_KG: '11', EMPAQUE: 'CAJA', LIQUIDO: 'SI', DELICADO: 'NO' };
const posiciones = [{ fila: filas[0], ...(({ articulo, faltan }) => ({ art: articulo, faltan }))(articuloDesdeFila(filas[0])), ia: 0.8123, clase: 'BASE', lineas: 2 }];
const diag = { av: { total: 1748, revisadas: 1, COMPLETA: 1, INCOMPLETA: 0, VACIA: 0, 'SIN REVISAR': 1747 }, zonas: [{ zona: 'Seco alimentos', total: 10, revisadas: 1, COMPLETA: 1 }], listas: 1, mejoras: [{ texto: 'Tomar el pasillo 12 completo' }], siguiente: 'Seguir tomando datos' };

test('Excel: hojas reimportables y con clase de arrume', () => {
  const h = hojasExcel({ filas, posiciones, pedidos: [{ PEDIDO: 'P1', TIENDA: 'T1', CODIGO_ARTICULO: '1001', CAJAS: 5 }],
    propuesta: { movimientos: [{ codigoArticulo: '1001', articulo: 'ACEITE', clase: 'BASE', desde: '12-001x1', hacia: '12-002x1', pasillo: '12' }] },
    pruebaPedidos: [{ PEDIDO: 'P1', CAJAS: 5 }], diag });
  assert.deepEqual(Object.keys(h), ['UBICACIONES', 'ARTICULOS', 'REUBICACION', 'PEDIDOS', 'PRUEBA_PEDIDOS', 'DIAGNOSTICO']);
  assert.equal(h.UBICACIONES.length, 1748);
  assert.deepEqual(Object.keys(h.UBICACIONES[0]), COLUMNAS);           // mismas columnas que se importan
  assert.equal(h.UBICACIONES[0].ESTADO, 'COMPLETA');
  assert.equal(h.ARTICULOS[0].CLASE, 'BASE');
  assert.equal(h.ARTICULOS[0].INDICE_ARRUME, 0.812);
  assert.equal(h.REUBICACION[0].UBICACION_NUEVA, '12-002x1');
  assert.ok(h.PEDIDOS[0].PEDIDO && h.PEDIDOS[0].CAJAS);              // se reconoce como hoja de pedidos
});

test('Excel: sin propuesta ni pedidos no salen hojas vacías', () => {
  const h = hojasExcel({ filas, posiciones: [], pedidos: [], propuesta: null });
  assert.deepEqual(Object.keys(h), ['UBICACIONES', 'ARTICULOS']);
});

test('diagnóstico en texto y en filas', () => {
  const t = textoDiagnostico(diag);
  assert.ok(t.includes('1 de 1748'));
  assert.ok(t.includes('Tomar el pasillo 12 completo'));
  assert.ok(t.includes('Siguiente paso'));
  const f = filasDiagnostico(diag);
  assert.ok(f.some((x) => x.SECCION === 'Mejoras'));
  assert.match(nombreArchivo('palet', 'mp4'), /^palet-\d{4}-\d{2}-\d{2}\.mp4$/);
});
