// Puente de Google Drive para Seguimiento de Recibo.
// Se publica como aplicación web en la cuenta de Google dueña de la carpeta "Seguimiento de Recibo":
//   Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
// Solo atiende a quien tenga acceso a la nube del equipo (código de equipo o sesión de Luis),
// y solo trabaja dentro de la carpeta RAIZ y sus subcarpetas. Nunca borra: lo viejo va a la papelera.

const RAIZ = '1FXRhzXK_yKPMdR3s_E5ScwQgDdN89YL0';
const FUNCION = 'https://nfrqrboqxcpgsagnmwqq.supabase.co/functions/v1/recibo';
const LLAVE = 'sb_publishable_73XleY68KOLPlGw_DrlQsA__IQzwPB8';
const CARPETA = 'application/vnd.google-apps.folder';

function doGet() {
  return salida({ ok: true, servicio: 'Puente de Google Drive de Seguimiento de Recibo', carpeta: DriveApp.getFolderById(RAIZ).getName() });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return error('bad_request', 'Cuerpo inválido'); }
  try {
    if (!autorizado(b.equipo, b.token)) return error('sin_acceso', 'Este equipo no tiene acceso a la nube del equipo');
  } catch (x) {
    return error('server_unavailable', 'No se pudo comprobar el acceso');
  }
  const f = HERRAMIENTAS[b.tool];
  if (!f) return error('tool_error', 'Herramienta desconocida: ' + b.tool);
  try {
    return salida({ payload: f(b.input || {}) });
  } catch (x) {
    return error('tool_error', String((x && x.message) || x).slice(0, 300));
  }
}

const HERRAMIENTAS = {
  create_file(i) {
    const carpeta = carpetaPermitida(i.parentId || RAIZ);
    const titulo = String(i.title || 'archivo').slice(0, 200);
    let f;
    if (i.contentMimeType === CARPETA) {
      f = carpeta.createFolder(titulo);
    } else {
      const bytes = Utilities.base64Decode(String(i.base64Content || ''));
      f = carpeta.createFile(Utilities.newBlob(bytes, i.contentMimeType || 'application/octet-stream', titulo));
    }
    return { id: f.getId(), title: f.getName(), viewUrl: f.getUrl() };
  },

  search_files(i) {
    const m = String(i.query || '').match(/parentId\s*=\s*'([A-Za-z0-9_-]+)'/);
    const carpeta = carpetaPermitida(m ? m[1] : RAIZ);
    const tope = Math.min(Number(i.pageSize) || 100, 500);
    const files = [];
    const subs = carpeta.getFolders();
    while (subs.hasNext() && files.length < tope) { const s = subs.next(); files.push({ id: s.getId(), title: s.getName(), mimeType: CARPETA }); }
    const arch = carpeta.getFiles();
    while (arch.hasNext() && files.length < tope) { const a = arch.next(); files.push({ id: a.getId(), title: a.getName(), mimeType: a.getMimeType() }); }
    return { files };
  },

  trash_file(i) {
    const id = String(i.fileId || '');
    if (!id || id === RAIZ) throw new Error('No se puede mandar esa carpeta a la papelera');
    let item;
    try { item = DriveApp.getFileById(id); } catch (x) { item = DriveApp.getFolderById(id); }
    if (!dentroDeRaiz(item)) throw new Error('El archivo no está en Seguimiento de Recibo');
    item.setTrashed(true); // papelera: se puede recuperar
    return { ok: true };
  },
};

function carpetaPermitida(id) {
  const c = DriveApp.getFolderById(id);
  if (id !== RAIZ && !dentroDeRaiz(c)) throw new Error('La carpeta no está en Seguimiento de Recibo');
  return c;
}

function dentroDeRaiz(item) {
  let actual = item;
  for (let n = 0; n < 10; n++) {
    const padres = actual.getParents();
    if (!padres.hasNext()) return false;
    const p = padres.next();
    if (p.getId() === RAIZ) return true;
    actual = p;
  }
  return false;
}

// Pregunta a la función "recibo" si el código de equipo o la sesión de Luis son válidos (se recuerda 10 minutos).
function autorizado(equipo, token) {
  equipo = String(equipo || ''); token = String(token || '');
  if (!equipo && !token) return false;
  const clave = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, equipo + '|' + token));
  const cache = CacheService.getScriptCache();
  if (cache.get(clave) === '1') return true;
  const h = { apikey: LLAVE };
  if (equipo) h['x-equipo'] = equipo;
  if (token) h.Authorization = 'Bearer ' + token;
  const r = UrlFetchApp.fetch(FUNCION, { method: 'post', contentType: 'application/json', headers: h, payload: JSON.stringify({ accion: 'estado' }), muteHttpExceptions: true });
  if (r.getResponseCode() >= 500) throw new Error('nube');
  let d = {};
  try { d = JSON.parse(r.getContentText()); } catch (x) { /* respuesta rara */ }
  const ok = !!(d.luis || d.equipo);
  if (ok) cache.put(clave, '1', 600);
  return ok;
}

function salida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function error(code, message) { return salida({ error: { code, message } }); }
