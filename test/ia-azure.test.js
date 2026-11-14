// Pruebas del diagnóstico con IA de Azure: que solo salga el resumen y que la función filtre lo que no debe pasar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generarLayout, estadoDe } from '../www/js/datos/layout.js';
import { articuloDesdeFila } from '../www/js/motor/articulo.js';
import { calcularIndices } from '../www/js/motor/indice.js';
import { resumenParaIA, pedirDiagnosticoIA, direccionValida } from '../www/js/ia.js';
import { limpiarResumen, construirMensajes, encabezadosCors, llamarAzureOpenAI } from '../azure/diagnostico-ia/src/logica.js';

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
  const posiciones = filas.filter((f) => ['COMPLETA', 'INCOMPLETA'].includes(estadoDe(f))).map((fila) => ({ fila, ...articuloDesdeFila(fila) }));
  const ix = calcularIndices(posiciones.map((p) => p.articulo));
  const pos = posiciones.map((p) => ({ fila: p.fila, art: p.articulo, faltan: p.faltan, clase: ix.get(p.articulo.codigo).clase }));
  return { filas, posiciones: pos, propuesta: null, pedidos: [], palet: { largo: 1200, ancho: 1000, altoBase: 150, alturaMaxTotal: 1800, cargaMax: 1000 }, paletConfirmado: false };
}

test('el resumen para la IA no lleva nombres, códigos de artículo ni pesos', () => {
  const r = resumenParaIA(escenario());
  const texto = JSON.stringify(r);
  for (const prohibido of ['Galletas', 'Arroz', 'Aceite', '1002', '25kg', '12.5']) assert.ok(!texto.includes(prohibido), `se coló: ${prohibido}`);
  assert.equal(r.avance.completas, 5);
  const p12 = r.pasillos.find((p) => p.pasillo === '12');
  assert.ok(p12.ordenPct < 50);
  assert.ok(p12.delicadosAlInicio.includes('12-001x1'));
});

test('la función solo deja pasar lo permitido aunque la app mande de más', () => {
  const r = resumenParaIA(escenario());
  r.pasillos[0].articulo = 'Arroz 25kg';
  r.pasillos[0].delicadosAlInicio.push('Galletas x12');
  r.extra = { clave: 'secreto' };
  const limpio = limpiarResumen({ resumen: r });
  assert.ok(limpio.ok);
  const texto = JSON.stringify(construirMensajes(limpio.resumen));
  assert.ok(!texto.includes('Arroz') && !texto.includes('Galletas') && !texto.includes('secreto'));
  assert.ok(texto.includes('12-001x1'));
  assert.equal(limpiarResumen({ resumen: { version: 2 } }).ok, false);
  assert.equal(limpiarResumen(null).ok, false);
});

test('CORS: solo la APK y los orígenes permitidos', () => {
  assert.equal(encabezadosCors('https://localhost')['Access-Control-Allow-Origin'], 'https://localhost');
  assert.equal(encabezadosCors('https://sitio-raro.com')['Access-Control-Allow-Origin'], undefined);
  assert.equal(encabezadosCors('https://paletizado.vercel.app', 'https://localhost, https://paletizado.vercel.app')['Access-Control-Allow-Origin'], 'https://paletizado.vercel.app');
});

test('solo se aceptan direcciones https de Azure', () => {
  assert.ok(direccionValida('https://paletizado-ia.azurewebsites.net/api/diagnostico'));
  assert.ok(!direccionValida('http://paletizado-ia.azurewebsites.net/api/diagnostico'));
  assert.ok(!direccionValida('https://otro-sitio.com/api'));
  assert.ok(!direccionValida('no es una url'));
});

test('la app llama a la función con el código en el encabezado y entiende los errores', async () => {
  let vista;
  const ok = async (url, op) => { vista = { url, op }; return { ok: true, status: 200, json: async () => ({ texto: 'Diagnóstico listo', modelo: 'mini' }) }; };
  const cfg = { url: 'https://x.azurewebsites.net/api/diagnostico', codigo: 'abc' };
  const r = await pedirDiagnosticoIA({ version: 1 }, cfg, { fetchFn: ok });
  assert.equal(r.texto, 'Diagnóstico listo');
  assert.equal(vista.op.headers['x-functions-key'], 'abc');
  assert.ok(!vista.url.includes('abc'), 'el código no debe ir en la dirección');
  const no = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(pedirDiagnosticoIA({}, cfg, { fetchFn: no }), /código de acceso/);
  await assert.rejects(pedirDiagnosticoIA({}, {}, { fetchFn: ok }), /Ajustes/);
});

test('la función arma bien la llamada a Azure OpenAI v1', async () => {
  let vista;
  const f = async (url, op) => { vista = { url, cuerpo: JSON.parse(op.body), op }; return { ok: true, json: async () => ({ model: 'gpt-mini', choices: [{ message: { content: ' Hola ' } }] }) }; };
  const r = await llamarAzureOpenAI({ avance: {} }, { endpoint: 'https://mi-recurso.openai.azure.com/', clave: 'k', despliegue: 'diagnostico-paletizado' }, f);
  assert.equal(vista.url, 'https://mi-recurso.openai.azure.com/openai/v1/chat/completions');
  assert.equal(vista.op.headers['api-key'], 'k');
  assert.equal(vista.cuerpo.model, 'diagnostico-paletizado');
  assert.equal(r.texto, 'Hola');
});
