// Pruebas de la toma de datos y del agente
import test from 'node:test';
import assert from 'node:assert/strict';
import { generarLayout, mezclar, estadoDe, subdividir, catalogo, revisarDatos, aMilimetros, desdeMilimetros } from '../www/js/datos/layout.js';
import { articuloDesdeFila } from '../www/js/motor/articulo.js';
import { calcularIndices } from '../www/js/motor/indice.js';
import { diagnostico, responder, analizarPasillo } from '../www/js/agente.js';

test('el mapa tiene 1.748 posiciones y 76 por pasillo', () => {
  const f = generarLayout();
  assert.equal(f.length, 1748);
  assert.equal(f.filter((x) => x.PASILLO === '12').length, 76);
  assert.equal(f.filter((x) => x.SECCION === 'Seco alimentos').length, 608);
  assert.ok(!f.some((x) => x.MODULO === '003'));
  assert.equal(f.find((x) => x.CODIGO === '12-001x1').SECUENCIA_RUTA, 1);
});

test('estado de una posición', () => {
  assert.equal(estadoDe({}), 'SIN REVISAR');
  assert.equal(estadoDe({ ARTICULO: 'Arroz' }), 'INCOMPLETA');
  assert.equal(estadoDe({ ESTADO: 'VACIA' }), 'VACIA');
  assert.equal(estadoDe({ ARTICULO: 'Arroz', CODIGO_ARTICULO: '1', LARGO_A_MM: 600, ANCHO_B_MM: 400, ALTO_H_MM: 150, PESO_KG: 25, EMPAQUE: 'BULTO', LIQUIDO: 'NO', DELICADO: 'NO' }), 'COMPLETA');
});

test('mezclar datos de la hoja con el mapa no duplica posiciones', () => {
  const m = mezclar(generarLayout(), [{ CODIGO: '05-001x1', ARTICULO: 'Detergente', CODIGO_ARTICULO: '9' }, { CODIGO: '05-004x1A', SECCION: 'Seco no alimentos', PASILLO: '05', SECUENCIA_RUTA: 5.1 }]);
  assert.equal(m.length, 1749);
  assert.equal(m.find((x) => x.CODIGO === '05-001x1').ESTADO, 'INCOMPLETA');
});

test('dividir una posición crea A y B y la madre deja de contar', () => {
  const f = subdividir(generarLayout(), '05-004x1');
  assert.equal(f.find((x) => x.CODIGO === '05-004x1').ESTADO, 'DIVIDIDA');
  const a = f.find((x) => x.CODIGO === '05-004x1A'), b = f.find((x) => x.CODIGO === '05-004x1B');
  assert.ok(a && b);
  assert.ok(Number(a.SECUENCIA_RUTA) < Number(b.SECUENCIA_RUTA));
  assert.ok(Number(b.SECUENCIA_RUTA) < f.find((x) => x.CODIGO === '05-004x2').SECUENCIA_RUTA);
});

test('avisos: medidas en otra unidad y peso raro', () => {
  const av = revisarDatos({ LARGO_A_MM: '40', ANCHO_B_MM: '30', ALTO_H_MM: '25', PESO_KG: '0' });
  assert.ok(av.some((t) => t.includes('revisa la unidad')));
  assert.ok(av.some((t) => t.includes('Peso')));
});

function escenario() {
  const filas = generarLayout();
  const datos = [
    ['12-001x1', 'Galletas x12', '1003', 380, 280, 220, 2.4, 'CAJA', 'NO', 'SI'],
    ['12-001x2', 'Papas x20', '1005', 500, 350, 300, 1.6, 'CAJA', 'NO', 'SI'],
    ['12-002x1', 'Pasta x24', '1006', 420, 300, 200, 6, 'CAJA', 'NO', 'NO'],
    ['12-002x2', 'Aceite 3L x4', '1001', 400, 300, 330, 12.5, 'CAJA', 'SI', 'NO'],
    ['12-004x1', 'Arroz 25kg', '1002', 600, 400, 150, 25, 'BULTO', 'NO', 'NO'],
  ];
  for (const [cod, art, c, a, b, h, p, e, l, d] of datos) {
    Object.assign(filas.find((x) => x.CODIGO === cod), { ARTICULO: art, CODIGO_ARTICULO: c, LARGO_A_MM: a, ANCHO_B_MM: b, ALTO_H_MM: h, PESO_KG: p, EMPAQUE: e, LIQUIDO: l, DELICADO: d, ESTADO: 'COMPLETA' });
  }
  Object.assign(filas.find((x) => x.CODIGO === '12-004x2'), { ESTADO: 'VACIA' });
  const posiciones = filas.filter((f) => ['COMPLETA', 'INCOMPLETA'].includes(estadoDe(f))).map((fila) => ({ fila, ...articuloDesdeFila(fila), lineas: 0 }));
  const ix = calcularIndices(posiciones.map((p) => p.articulo));
  const pos = posiciones.map((p) => ({ fila: p.fila, art: p.articulo, faltan: p.faltan, ia: ix.get(p.articulo.codigo).ia, clase: ix.get(p.articulo.codigo).clase }));
  return { filas, posiciones: pos, propuesta: null, pedidos: [], palet: { largo: 1200, ancho: 1000, altoBase: 150, alturaMaxTotal: 1800, cargaMax: 1000 }, paletConfirmado: false };
}

test('catálogo para autocompletar', () => {
  const ctx = escenario();
  assert.equal(catalogo(ctx.filas).get('1002').ARTICULO, 'Arroz 25kg');
});

test('agente: detecta delicados al inicio y pesados al final del pasillo 12', () => {
  const ctx = escenario();
  const a = analizarPasillo(ctx.posiciones, '12');
  assert.ok(a.delicadosAlInicio.length >= 1);
  assert.ok(a.pesadosAlFinal.length >= 1);
  assert.ok(a.orden < 50);
  const d = diagnostico(ctx);
  assert.equal(d.av.COMPLETA, 5);
  assert.equal(d.av.VACIA, 1);
  assert.ok(d.mejoras.some((m) => m.texto.includes('Pasillo 12')));
});

test('agente: responde avance, movimientos y dónde va un artículo', () => {
  const ctx = escenario();
  assert.ok(responder('¿cómo voy en el pasillo 12?', ctx)[0].includes('6 de 76'));
  const mov = responder('¿qué movimientos hago primero?', ctx);
  assert.ok(mov[0].includes('movimientos propuestos'));
  assert.ok(mov.some((l) => l.includes('Arroz 25kg')));
  const donde = responder('¿dónde va el arroz?', ctx);
  assert.ok(donde[0].includes('Arroz 25kg'));
  assert.ok(responder('hola', ctx)[0].includes('agente'));
});

test('medidas en mm, cm o m se guardan en milímetros', () => {
  assert.equal(aMilimetros('0,4', 'm'), '400');
  assert.equal(aMilimetros('0.355', 'm'), '355');
  assert.equal(aMilimetros('35,5', 'cm'), '355');
  assert.equal(aMilimetros('355', 'mm'), '355');
  assert.equal(aMilimetros('', 'm'), '');
  assert.equal(aMilimetros('abc', 'cm'), '');
  assert.equal(desdeMilimetros('355', 'm'), '0.355');
  assert.equal(desdeMilimetros('355', 'cm'), '35.5');
  assert.equal(desdeMilimetros('', 'cm'), '');
  // 0,4 escrito en metros ya no es "muy pequeño"
  const d = { LARGO_A_MM: aMilimetros('0,4', 'm'), ANCHO_B_MM: aMilimetros('0,3', 'm'), ALTO_H_MM: aMilimetros('0,25', 'm'), PESO_KG: '12' };
  assert.deepEqual(revisarDatos(d), []);
  assert.ok(revisarDatos({ ...d, LARGO_A_MM: '4' })[0].includes('revisa la unidad'));
});

test('módulo con posiciones x3, y1–y3 y z1–z3', async () => {
  const { agregarPosiciones, posicionesDisponibles, subdividir: dividir } = await import('../www/js/datos/layout.js');
  let filas = generarLayout();
  assert.deepEqual(posicionesDisponibles(filas, '05', '001'), ['x3', 'y1', 'y2', 'y3', 'z1', 'z2', 'z3']);
  const r = agregarPosiciones(filas, '05', '001', ['y1', 'x3', 'z3', 'x1']);   // x1 ya existe: no se repite
  assert.deepEqual(r.nuevas.sort(), ['05-001x3', '05-001y1', '05-001z3']);
  filas = r.filas;
  assert.equal(filas.length, 1748 + 3);
  // Orden de ruta: x1, x2, x3, y1, z3 y luego el módulo 002
  const ruta = filas.filter((f) => f.PASILLO === '05').slice(0, 6).map((f) => f.CODIGO);
  assert.deepEqual(ruta, ['05-001x1', '05-001x2', '05-001x3', '05-001y1', '05-001z3', '05-002x1']);
  // Una posición nueva también se puede dividir en A y B sin salirse del módulo
  filas = dividir(filas, '05-001y1');
  const orden = filas.filter((f) => f.PASILLO === '05' && f.ESTADO !== 'DIVIDIDA').slice(0, 7).map((f) => f.CODIGO);
  assert.deepEqual(orden, ['05-001x1', '05-001x2', '05-001x3', '05-001y1A', '05-001y1B', '05-001z3', '05-002x1']);
});

test('posiciones nuevas que llegan de Excel o de la nube sin datos de ruta', () => {
  const filas = mezclar(generarLayout(), [{ CODIGO: '12-004z2', ARTICULO: 'ARROZ 500G', PESO_KG: '10' }]);
  const f = filas.find((x) => x.CODIGO === '12-004z2');
  const x1 = filas.find((x) => x.CODIGO === '12-004x1');
  assert.equal(f.PASILLO, '12'); assert.equal(f.MODULO, '004'); assert.equal(f.POSICION, 'z2');
  assert.equal(f.SECCION, 'Seco alimentos');
  assert.equal(f.SECUENCIA_RUTA, Number(x1.SECUENCIA_RUTA) + 1.7);
});

test('borrar posiciones agregadas; x1 y x2 son fijas; sin llenar no cuentan', async () => {
  const { agregarPosiciones, borrarPosicion, cuenta, subdividir: dividir } = await import('../www/js/datos/layout.js');
  let filas = agregarPosiciones(generarLayout(), '05', '001', ['x3', 'y1', 'z1']).filas;
  const contadas = () => filas.filter(cuenta).length;
  assert.equal(contadas(), 1748);                                  // agregadas vacías no cuentan
  filas.find((f) => f.CODIGO === '05-001x3').ARTICULO = 'AZUCAR 1KG';
  assert.equal(contadas(), 1749);                                  // al llenarla, cuenta
  filas.find((f) => f.CODIGO === '05-001z1').ESTADO = 'VACIA';
  assert.equal(contadas(), 1749);                                  // agregada vacía tampoco cuenta
  // x1 y x2 no se borran
  assert.equal(borrarPosicion(filas, '05-001x1').borradas.length, 0);
  assert.equal(borrarPosicion(filas, '05-001x2').borradas.length, 0);
  // y1 dividida en A y B: se borra completa
  filas = dividir(filas, '05-001y1');
  const r = borrarPosicion(filas, '05-001y1');
  assert.deepEqual(r.borradas.map((f) => f.CODIGO).sort(), ['05-001y1', '05-001y1A', '05-001y1B']);
  filas = r.filas;
  assert.ok(!filas.some((f) => f.CODIGO.startsWith('05-001y1')));
  // se puede volver a agregar
  assert.deepEqual(agregarPosiciones(filas, '05', '001', ['y1']).nuevas, ['05-001y1']);
});

test('"No aplica" deja la posición completa; sin medidas no entra al cálculo', () => {
  const base = { CODIGO: '05-001x1', SECCION: 'Seco no alimentos', ARTICULO: 'EXHIBIDOR', CODIGO_ARTICULO: 'NO APLICA', LARGO_A_MM: '400', ANCHO_B_MM: '300', ALTO_H_MM: '200', PESO_KG: '5', EMPAQUE: 'NO APLICA', LIQUIDO: 'NO APLICA', DELICADO: 'N/A' };
  assert.equal(estadoDe(base), 'COMPLETA');
  let r = articuloDesdeFila(base);
  assert.deepEqual(r.faltan, []);                       // se puede calcular
  assert.equal(r.articulo.empaque, 'CAJA');
  assert.equal(r.articulo.liquido, false);
  assert.equal(r.articulo.delicado, false);
  assert.equal(r.articulo.codigo, 'SIN-CODIGO-05-001x1');
  r = articuloDesdeFila({ ...base, PESO_KG: 'NO APLICA' });
  assert.deepEqual(r.faltan, ['peso (no aplica)']);    // completa, pero no entra al cálculo
  assert.equal(estadoDe({ ...base, PESO_KG: 'NO APLICA' }), 'COMPLETA');
  assert.equal(catalogo([base]).size, 0);               // "no aplica" no autocompleta otros
});
