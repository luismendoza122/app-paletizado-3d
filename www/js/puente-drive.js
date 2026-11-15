// Puente de Google Drive: con una o varias direcciones de carpetas de Drive arma el código del puente
// (Google Apps Script publicado como aplicación web en la cuenta dueña de las carpetas).
// La app manda los archivos al puente y el puente los guarda en esas carpetas. El puente solo atiende
// a quien la app reconoce como administrador, y solo trabaja dentro de las carpetas que se le dieron.
'use strict';

const PuenteDrive = (() => {
  // Saca el ID de cada carpeta: https://drive.google.com/drive/folders/ID?usp=sharing · ...?id=ID · o el ID solo
  function carpetasDe(texto) {
    const vistos = new Set();
    const lista = [];
    for (const linea of String(texto || '').split(/[\n,;\s]+/)) {
      const l = linea.trim();
      if (!l) continue;
      const m = l.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || l.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || l.match(/^([A-Za-z0-9_-]{20,})$/);
      if (!m || vistos.has(m[1])) continue;
      vistos.add(m[1]);
      lista.push(m[1]);
    }
    return lista;
  }
  const esPuente = (url) => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(url || '').trim());

  // Código de Apps Script. verificar = cómo preguntarle a la app si quien llama es administrador.
  function codigo({ app, carpetas, verificar }) {
    const ids = carpetas.map((c) => `  '${String(c).replace(/[^A-Za-z0-9_-]/g, '')}',`).join('\n');
    return `// Puente de Google Drive para ${app}.
// Hecho el ${new Date().toLocaleDateString('es-CO')} con ${carpetas.length} carpeta(s).
// Cómo publicarlo (una sola vez):
//   1. https://script.google.com → Nuevo proyecto → borra lo que haya y pega todo este código → Guardar.
//   2. Implementar → Nueva implementación → tipo "Aplicación web".
//      Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona   → Implementar → Autorizar acceso.
//   3. Copia la "URL de la aplicación web" (termina en /exec) y pégala en la pestaña Drive de la app.
// Seguridad: solo atiende a los administradores de la app y solo trabaja dentro de estas carpetas
// (y sus subcarpetas). Nunca borra: si un archivo se reemplaza, el anterior va a la papelera.

const CARPETAS = [
${ids}
];
const VERIFICAR = ${JSON.stringify(verificar, null, 2)};

function doGet() {
  return salida({ ok: true, servicio: 'Puente de Google Drive de ${app}', carpetas: CARPETAS.map(function (id) {
    try { return { id: id, nombre: DriveApp.getFolderById(id).getName() }; } catch (x) { return { id: id, nombre: '(sin acceso)' }; }
  }) });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return error('bad_request', 'Cuerpo inválido'); }
  try {
    if (!autorizado(b.acceso || {})) return error('sin_acceso', 'Solo un administrador de ${app} puede usar el puente');
  } catch (x) {
    return error('server_unavailable', 'No se pudo comprobar el acceso');
  }
  var f = HERRAMIENTAS[b.tool];
  if (!f) return error('tool_error', 'Herramienta desconocida: ' + b.tool);
  try { return salida({ payload: f(b.input || {}) }); }
  catch (x) { return error('tool_error', String((x && x.message) || x).slice(0, 300)); }
}

var HERRAMIENTAS = {
  // Guarda un archivo (base64). Si ya hay uno con el mismo nombre en la carpeta, el viejo va a la papelera.
  subir: function (i) {
    var carpeta = carpetaPermitida(i.carpeta || CARPETAS[0]);
    var nombre = String(i.nombre || 'archivo').replace(/[\\\\/:*?"<>|]/g, '-').slice(0, 200);
    var viejos = carpeta.getFilesByName(nombre);
    while (viejos.hasNext()) viejos.next().setTrashed(true);
    var bytes = Utilities.base64Decode(String(i.base64 || ''));
    var f = carpeta.createFile(Utilities.newBlob(bytes, i.tipo || 'application/octet-stream', nombre));
    return { id: f.getId(), nombre: f.getName(), url: f.getUrl() };
  },
  carpetas: function () {
    return CARPETAS.map(function (id) { var c = DriveApp.getFolderById(id); return { id: id, nombre: c.getName(), url: c.getUrl() }; });
  },
};

function carpetaPermitida(id) {
  id = String(id || '');
  var c = DriveApp.getFolderById(id);
  if (CARPETAS.indexOf(id) >= 0) return c;
  var actual = c;
  for (var n = 0; n < 10; n++) {
    var padres = actual.getParents();
    if (!padres.hasNext()) break;
    actual = padres.next();
    if (CARPETAS.indexOf(actual.getId()) >= 0) return c;
  }
  throw new Error('Esa carpeta no está en el puente');
}

// Le pregunta a la app si el código o la sesión son de un administrador (se recuerda 10 minutos).
function autorizado(a) {
  var codigo = String(a.codigo || ''), token = String(a.token || ''), dispositivo = String(a.dispositivo || '');
  if (!codigo && !token) return false;
  var clave = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, codigo + '|' + token + '|' + dispositivo));
  var cache = CacheService.getScriptCache();
  if (cache.get(clave) === '1') return true;
  var h = { apikey: VERIFICAR.llave, 'x-dispositivo': dispositivo };
  if (codigo) h['x-admin'] = codigo;
  if (token) h.Authorization = 'Bearer ' + token;
  var op = { method: VERIFICAR.metodo, headers: h, muteHttpExceptions: true };
  if (VERIFICAR.metodo === 'post') { op.contentType = 'application/json'; op.payload = JSON.stringify({ accion: 'quien', dispositivo: dispositivo }); }
  var r = UrlFetchApp.fetch(VERIFICAR.url, op);
  if (r.getResponseCode() >= 500) throw new Error('app');
  var d = {};
  try { d = JSON.parse(r.getContentText()); } catch (x) { /* respuesta rara */ }
  var ok = d.rol === 'admin' || d.rol === 'propietario';
  if (ok) cache.put(clave, '1', 600);
  return ok;
}

function salida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function error(code, message) { return salida({ error: { code: code, message: message } }); }
`;
  }

  // Prueba el puente (GET): devuelve los nombres de las carpetas
  async function probar(url) {
    if (!esPuente(url)) throw new Error('La dirección del puente debe empezar por https://script.google.com/macros/s/ y terminar en /exec');
    let r;
    try { r = await fetch(url.trim(), { redirect: 'follow' }); } catch { throw new Error('No se pudo abrir el puente: revisa que esté implementado para "Cualquier persona"'); }
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) throw new Error('El puente no respondió bien. Vuelve a implementarlo como "Aplicación web".');
    return d;
  }

  // Llama una herramienta del puente (text/plain: el navegador no hace consulta previa y Google la acepta)
  async function llamar(url, tool, input, acceso) {
    if (!esPuente(url)) throw new Error('Primero conecta el puente de Drive');
    let r;
    try {
      r = await fetch(url.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ tool, input, acceso }), redirect: 'follow' });
    } catch { throw new Error('Sin conexión con Google Drive'); }
    const d = await r.json().catch(() => null);
    if (!d) throw new Error('Respuesta inválida de Google Drive');
    if (d.error) throw new Error(d.error.message || 'Error del puente');
    return d.payload || {};
  }

  return { carpetasDe, esPuente, codigo, probar, llamar };
})();
if (typeof window !== 'undefined') window.PuenteDrive = PuenteDrive;
if (typeof module !== 'undefined') module.exports = PuenteDrive;
