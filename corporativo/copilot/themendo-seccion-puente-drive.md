## 15. Puente de Google Drive (Inventario de estibas y Paletizado 3D)
Apenas Luis escriba o pegue una o varias direcciones de carpetas de Google Drive para el Inventario o para Paletizado, sin esperar otra orden:
1. Saca el ID de cada carpeta: lo que va después de /folders/ (hasta ? o /), o después de id=. Si no hay ID válido, dilo y pide la dirección de la carpeta.
2. Pregunta solo si no se sabe para cuál app es (Inventario de estibas o Paletizado 3D).
3. Entrega en UN bloque de código el puente completo: copia la plantilla de abajo cambiando APP por el nombre de la app, ID_CARPETA_1 por los IDs (uno por línea, entre comillas y con coma) y URL_VERIFICAR y METODO según la tabla.
4. Debajo, los pasos: (a) script.google.com con la cuenta dueña de las carpetas → Nuevo proyecto → pegar → Guardar; (b) Implementar → Nueva implementación → Aplicación web; Ejecutar como: Yo; Quién tiene acceso: Cualquier persona → Autorizar; (c) copiar la URL que termina en /exec y pegarla en la pestaña Drive de la app → Guardar y probar.
5. Nunca cambies la seguridad de la plantilla (verificación de administrador, solo esas carpetas, papelera en vez de borrar) y nunca pidas códigos de administrador ni contraseñas.

| App | URL_VERIFICAR | METODO |
|---|---|---|
| Inventario de estibas | https://nfrqrboqxcpgsagnmwqq.supabase.co/functions/v1/inventario/api/admin/quien | get |
| Paletizado 3D | https://nfrqrboqxcpgsagnmwqq.supabase.co/functions/v1/paletizado | post |

Plantilla:
```javascript
// Puente de Google Drive para APP.
// Cómo publicarlo (una sola vez):
//   1. https://script.google.com → Nuevo proyecto → borra lo que haya y pega todo este código → Guardar.
//   2. Implementar → Nueva implementación → tipo "Aplicación web".
//      Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona   → Implementar → Autorizar acceso.
//   3. Copia la "URL de la aplicación web" (termina en /exec) y pégala en la pestaña Drive de la app.
// Seguridad: solo atiende a los administradores de la app y solo trabaja dentro de estas carpetas
// (y sus subcarpetas). Nunca borra: si un archivo se reemplaza, el anterior va a la papelera.

const CARPETAS = [
  'ID_CARPETA_1',
];
const VERIFICAR = {
  "url": "URL_VERIFICAR",
  "metodo": "METODO",
  "llave": "sb_publishable_73XleY68KOLPlGw_DrlQsA__IQzwPB8"
};

function doGet() {
  return salida({ ok: true, servicio: 'Puente de Google Drive de APP', carpetas: CARPETAS.map(function (id) {
    try { return { id: id, nombre: DriveApp.getFolderById(id).getName() }; } catch (x) { return { id: id, nombre: '(sin acceso)' }; }
  }) });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return error('bad_request', 'Cuerpo inválido'); }
  try {
    if (!autorizado(b.acceso || {})) return error('sin_acceso', 'Solo un administrador de APP puede usar el puente');
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
    var nombre = String(i.nombre || 'archivo').replace(/[\\/:*?"<>|]/g, '-').slice(0, 200);
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
```
