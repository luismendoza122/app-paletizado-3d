// =====================================================================
//  Nube de Seguimiento de Recibo en Google (Apps Script)
//
//  Reemplaza la funcion "recibo" de Supabase. Guarda lo mismo:
//  planillas, articulos, ajustes, fotos y las herramientas de Drive.
//
//  Como se publica:
//    Implementar > Nueva implementacion > Aplicacion web
//      Ejecutar como: Yo
//      Quien tiene acceso: Cualquier persona
//
//  Antes de publicar:
//    1. Crea una hoja de calculo llamada "Recibo - nube".
//    2. Copia su ID (lo que va entre /d/ y /edit) en ID_HOJA.
//    3. Ejecuta inicializar() una vez.
//    4. Ejecuta configurar('tu-correo@gmail.com', 'tu-clave') una vez.
//
//  La clave de Luis NO queda escrita aqui: se guarda como hash + sal en
//  las propiedades del script.
// =====================================================================

const ID_HOJA = 'PON_AQUI_EL_ID_DE_LA_HOJA';

// Carpeta "Seguimiento de Recibo" en Drive: los respaldos y las fotos viven aqui.
const RAIZ = '1FXRhzXK_yKPMdR3s_E5ScwQgDdN89YL0';
const CARPETA_FOTOS = 'fotos de evidencia';

const COLECCIONES = ['planillas', 'articulos', 'config', 'fotos', 'drivefotos'];
const RE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const TROZO = 45000;   // caracteres por celda (el tope de Sheets es 50.000)
const PARTES = 8;      // 8 x 45.000 = 360.000 caracteres por documento
const MAX_DOC = TROZO * PARTES;
const SEGUNDOS_CACHE_AUTH = 600;
const DIAS_SESION = 30;

const CAB_DOCS = ['coleccion', 'id', 'version', 'borrado', 'actualizado_por', 'actualizado_en']
  .concat(Array.from({ length: PARTES }, (_, i) => 'parte' + (i + 1)));
const CAB_EQUIPO = ['id', 'hash', 'sal', 'creado'];
const CAB_MIEMBROS = ['id', 'nombre', 'hash', 'creado', 'ultimo_uso', 'quitado', 'quitado_en'];
const CAB_SESIONES = ['hash', 'nombre', 'creado', 'vence'];
const CAB_META = ['clave', 'valor'];

// ---------------------------------------------------------------------
//  Preparacion (se ejecuta a mano desde el editor)
// ---------------------------------------------------------------------
function inicializar() {
  const libro = SpreadsheetApp.openById(ID_HOJA);
  if (!libro) throw new Error('No se pudo abrir la hoja. Revisa ID_HOJA.');
  hoja('docs', CAB_DOCS);
  hoja('equipo', CAB_EQUIPO);
  hoja('miembros', CAB_MIEMBROS);
  hoja('sesiones', CAB_SESIONES);
  hoja('meta', CAB_META);
  if (leerMeta('v') === null) escribirMeta('v', 1);
  return 'Hojas listas: docs, equipo, miembros, sesiones, meta.';
}

function configurar(correo, clave) {
  correo = String(correo || '').trim().toLowerCase();
  clave = String(clave || '');
  if (!correo || correo.indexOf('@') < 0) throw new Error('Escribe un correo valido.');
  if (clave.length < 8) throw new Error('La clave debe tener al menos 8 caracteres.');
  const sal = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    DUEÑO_CORREO: correo,
    DUEÑO_SAL: sal,
    DUEÑO_HASH: sha(sal + clave),
  });
  // Si ya habia sesiones viejas, se cierran todas.
  borrarTodasLasSesiones();
  return 'Listo. Luis entra con ' + correo + ' y la clave que acabas de escribir.';
}

function respaldar() {
  const { filas } = leerDocs();
  const texto = JSON.stringify({ generado: new Date().toISOString(), docs: filas }, null, 0);
  const nombre = 'respaldo-recibo-' + Utilities.formatDate(new Date(), 'America/Bogota', 'yyyyMMdd-HHmm') + '.json';
  const archivo = DriveApp.getFolderById(RAIZ).createFile(Utilities.newBlob(texto, 'application/json', nombre));
  return 'Respaldo creado: ' + archivo.getName() + ' (' + Math.round(texto.length / 1024) + ' KB)';
}

// ---------------------------------------------------------------------
//  Entrada HTTP
// ---------------------------------------------------------------------
function doGet() {
  return salida({ ok: true, servicio: 'Nube de Seguimiento de Recibo', ahora: new Date().toISOString() });
}

function doPost(e) {
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return salida({ error: 'Cuerpo invalido', code: 'bad_request' }); }

  try {
    if (b.tool) return salida(comoEquipo(b, function () { return { payload: herramienta(b.tool, b.input || {}) }; }));
    return salida(accion(b));
  } catch (x) {
    return salida({ error: String((x && x.message) || x).slice(0, 300), code: (x && x.code) || 'error' });
  }
}

// ---------------------------------------------------------------------
//  Acciones de datos
// ---------------------------------------------------------------------
function accion(b) {
  const nombre = String(b.accion || '');
  const quien = quienEs(b);
  const luis = quien.luis;
  const equipo = quien.equipo;
  const persona = quien.persona || '';
  const autor = luis ? 'Luis' : persona ? 'persona:' + persona.slice(0, 40) : equipo ? 'equipo:' + String(b.dispositivo || '').slice(0, 40) : '';

  if (nombre === 'estado') {
    return {
      luis: luis,
      equipo: !!equipo,
      persona: persona,
      hayCodigo: !!filaEquipo(),
      ahora: new Date().toISOString(),
    };
  }

  if (nombre === 'login') return login(b);
  if (nombre === 'salir') { cerrarSesion(String(b.token || '')); return { ok: true }; }
  if (nombre === 'recuperar') return recuperar();

  if (nombre === 'crear_codigo' || nombre === 'quitar_codigo') {
    if (!luis) throw conCodigo('Solo Luis puede cambiar el codigo de equipo', 'sin_acceso');
    if (nombre === 'quitar_codigo') {
      borrarFila('equipo', 'principal');
      return { ok: true };
    }
    const codigo = codigoNuevo();
    const sal = Utilities.getUuid();
    borrarFila('equipo', 'principal');
    escribirFila('equipo', ['principal', sha(sal + soloLetras(codigo)), sal, new Date().toISOString()]);
    return { codigo: codigo };
  }

  if (nombre === 'invitar' || nombre === 'personas' || nombre === 'quitar_persona') {
    if (!luis) throw conCodigo('Solo Luis puede manejar las personas del equipo', 'sin_acceso');
    if (nombre === 'personas') return { personas: listarPersonas() };
    if (nombre === 'quitar_persona') {
      const id = String(b.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) throw conCodigo('Persona invalida', 'bad_request');
      const filas = leerFilas('miembros');
      for (let i = 0; i < filas.length; i++) {
        if (filas[i][0] === id) {
          filas[i][5] = true;
          filas[i][6] = new Date().toISOString();
          hoja('miembros', CAB_MIEMBROS).getRange(i + 2, 1, 1, CAB_MIEMBROS.length).setValues([filas[i]]);
          return { ok: true };
        }
      }
      return { ok: true };
    }
    const nombrePersona = String(b.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (nombrePersona.length < 2) throw conCodigo('Escribe el nombre de la persona', 'bad_request');
    const codigo = codigoNuevo();
    const id = Utilities.getUuid();
    escribirFila('miembros', [id, nombrePersona, sha('persona:' + soloLetras(codigo)), new Date().toISOString(), '', false, '']);
    return { codigo: codigo, id: id, nombre: nombrePersona };
  }

  if (!luis && !equipo) throw conCodigo('Sin acceso: inicia sesion o escribe el codigo de equipo', 'sin_acceso');

  if (nombre === 'ping') {
    return { v: Number(leerMeta('v') || 0), ahora: new Date().toISOString() };
  }

  if (nombre === 'cambios') {
    const desde = typeof b.desde === 'string' && !isNaN(Date.parse(b.desde)) ? b.desde : '1970-01-01T00:00:00Z';
    const ahora = new Date().toISOString();
    const { filas } = leerDocs();
    const docs = [];
    for (let i = 0; i < filas.length; i++) {
      const d = filaADoc(filas[i]);
      if (!d || d.actualizado_en <= desde) continue;
      docs.push(d.coleccion === 'fotos' ? { coleccion: d.coleccion, id: d.id, datos: { pid: (d.datos && d.datos.pid) || null }, version: d.version, borrado: d.borrado, actualizado_en: d.actualizado_en } : d);
      if (docs.length >= 2000) break;
    }
    docs.sort(function (x, y) { return x.actualizado_en < y.actualizado_en ? -1 : x.actualizado_en > y.actualizado_en ? 1 : 0; });
    return { docs: docs, ahora: ahora };
  }

  const coleccion = String(b.coleccion || '');
  const id = String(b.id || '');
  if (COLECCIONES.indexOf(coleccion) < 0 || !RE_ID.test(id)) throw conCodigo('Documento invalido', 'bad_request');

  if (nombre === 'obtener') {
    const fila = buscarDoc(coleccion, id);
    if (!fila) return { existe: false };
    const d = filaADoc(fila);
    if (!d || d.borrado) return { existe: false };
    return { existe: true, datos: d.datos, version: d.version };
  }

  if (nombre === 'guardar' || nombre === 'borrar') {
    return conCandado(function () {
      const datos = nombre === 'guardar' ? (b.datos || {}) : {};
      if (typeof datos !== 'object' || Array.isArray(datos)) throw conCodigo('Datos invalidos', 'bad_request');
      const texto = JSON.stringify(datos);
      if (texto.length > MAX_DOC) throw conCodigo('Documento demasiado grande', 'demasiado_grande');

      const fila = buscarDoc(coleccion, id);
      if (nombre === 'borrar' && !fila) return { ok: true, version: 0 };
      const version = (fila ? Number(fila[2]) || 0 : 0) + 1;
      const registro = armarFilaDoc({
        coleccion: coleccion, id: id, datos: datos, version: version, borrado: nombre === 'borrar',
        actualizado_por: autor, actualizado_en: new Date().toISOString(),
      });
      if (fila) {
        hoja('docs', CAB_DOCS).getRange(fila.__fila, 1, 1, CAB_DOCS.length).setValues([registro]);
      } else {
        hoja('docs', CAB_DOCS).appendRow(registro);
      }
      subirContador();
      return { ok: true, version: version };
    });
  }

  // Fotos: el archivo va a Drive y en la hoja queda solo la referencia.
  if (nombre === 'subir_foto') {
    return conCandado(function () {
      const pid = String(b.pid || '');
      const base64 = String(b.base64 || '').split(',').pop();
      if (!base64) throw conCodigo('Falta la foto', 'bad_request');
      const bytes = Utilities.base64Decode(base64);
      const carpeta = carpetaFotos();
      const archivo = carpeta.createFile(Utilities.newBlob(bytes, 'image/jpeg', id + '.jpg'));
      const datos = { pid: pid, fileId: archivo.getId(), bytes: bytes.length };
      const fila = buscarDoc('fotos', id);
      const version = (fila ? Number(fila[2]) || 0 : 0) + 1;
      const registro = armarFilaDoc({
        coleccion: 'fotos', id: id, datos: datos, version: version, borrado: false,
        actualizado_por: autor, actualizado_en: new Date().toISOString(),
      });
      if (fila) hoja('docs', CAB_DOCS).getRange(fila.__fila, 1, 1, CAB_DOCS.length).setValues([registro]);
      else hoja('docs', CAB_DOCS).appendRow(registro);
      subirContador();
      return { ok: true, id: archivo.getId(), version: version };
    });
  }

  if (nombre === 'bajar_foto') {
    const fila = buscarDoc('fotos', id);
    if (!fila) return { existe: false };
    const d = filaADoc(fila);
    if (!d || !d.datos || !d.datos.fileId) return { existe: false };
    try {
      const blob = DriveApp.getFileById(d.datos.fileId).getBlob();
      return { existe: true, base64: Utilities.base64Encode(blob.getBytes()), tipo: blob.getContentType() || 'image/jpeg' };
    } catch (x) {
      return { existe: false };
    }
  }

  // Fotos que ya estaban en Drive antes de la mudanza: se buscan por el
  // final del nombre (la app las nombra "... - A1B2C3.jpg").
  if (nombre === 'buscar_foto') {
    const referencia = buscarDoc('drivefotos', id);
    if (referencia) {
      const d = filaADoc(referencia);
      if (d && d.datos && d.datos.id) {
        try { return { existe: true, base64: Utilities.base64Encode(DriveApp.getFileById(d.datos.id).getBlob().getBytes()), tipo: 'image/jpeg' }; }
        catch (x) { /* el archivo ya no está: se busca abajo */ }
      }
    }
    const archivo = archivoPorSufijo(id);
    if (!archivo) return { existe: false };
    try {
      const blob = archivo.getBlob();
      const rec = { id: archivo.getId(), url: archivo.getUrl(), sem: '' };
      conCandado(function () {
        const fila = buscarDoc('drivefotos', id);
        const version = (fila ? Number(fila[2]) || 0 : 0) + 1;
        const registro = armarFilaDoc({ coleccion: 'drivefotos', id: id, datos: rec, version: version, borrado: false, actualizado_por: 'indice', actualizado_en: new Date().toISOString() });
        if (fila) hoja('docs', CAB_DOCS).getRange(fila.__fila, 1, 1, CAB_DOCS.length).setValues([registro]);
        else hoja('docs', CAB_DOCS).appendRow(registro);
      });
      return { existe: true, base64: Utilities.base64Encode(blob.getBytes()), tipo: blob.getContentType() || 'image/jpeg' };
    } catch (x) {
      return { existe: false };
    }
  }

  if (nombre === 'borrar_foto') {
    const fila = buscarDoc('fotos', id);
    if (!fila) return { ok: true };
    const d = filaADoc(fila);
    try { if (d && d.datos && d.datos.fileId) DriveApp.getFileById(d.datos.fileId).setTrashed(true); } catch (x) { /* ya no esta */ }
    hoja('docs', CAB_DOCS).deleteRow(fila.__fila);
    subirContador();
    return { ok: true };
  }

  throw conCodigo('Accion desconocida: ' + nombre, 'bad_request');
}

// ---------------------------------------------------------------------
//  Sesion de Luis
// ---------------------------------------------------------------------
function login(b) {
  const props = PropertiesService.getScriptProperties();
  const correo = props.getProperty('DUEÑO_CORREO');
  const sal = props.getProperty('DUEÑO_SAL');
  const hash = props.getProperty('DUEÑO_HASH');
  if (!correo || !hash) throw conCodigo('Falta configurar la clave de Luis (configurar).', 'error');

  const entra = String(b.correo || '').trim().toLowerCase() === correo && sha(sal + String(b.clave || '')) === hash;
  if (!entra) throw conCodigo('Correo o clave incorrectos', 'sin_acceso');

  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  escribirFila('sesiones', [sha(token), 'Luis', new Date().toISOString(), Date.now() + DIAS_SESION * 86400000]);
  limpiarSesiones();
  return { token: token, nombre: 'Luis' };
}

function cerrarSesion(token) {
  if (!token) return;
  const h = hoja('sesiones', CAB_SESIONES);
  const filas = leerFilas('sesiones');
  const buscado = sha(token);
  for (let i = 0; i < filas.length; i++) if (filas[i][0] === buscado) { h.deleteRow(i + 2); return; }
}

function borrarTodasLasSesiones() {
  const h = hoja('sesiones', CAB_SESIONES);
  if (h.getLastRow() > 1) h.deleteRows(2, h.getLastRow() - 1);
}

function limpiarSesiones() {
  const h = hoja('sesiones', CAB_SESIONES);
  const filas = leerFilas('sesiones');
  const ahora = Date.now();
  for (let i = filas.length - 1; i >= 0; i--) if (Number(filas[i][3]) < ahora) h.deleteRow(i + 2);
}

function recuperar() {
  return { configurado: !!PropertiesService.getScriptProperties().getProperty('DUEÑO_HASH') };
}

// ---------------------------------------------------------------------
//  Quien esta llamando
// ---------------------------------------------------------------------
function quienEs(b) {
  const token = String(b.token || '');
  const codigo = String(b.equipo || '');
  const clave = sha('auth|' + codigo + '|' + token);
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(clave);
  if (guardado) { try { return JSON.parse(guardado); } catch (x) { /* sigue abajo */ } }

  const r = { luis: false, equipo: false, persona: '' };

  if (token) {
    const filas = leerFilas('sesiones');
    const buscado = sha(token);
    for (let i = 0; i < filas.length; i++) {
      if (filas[i][0] === buscado && Number(filas[i][3]) > Date.now()) { r.luis = true; break; }
    }
  }

  if (codigo) {
    const c = soloLetras(codigo);
    if (c.length >= 8) {
      const eq = filaEquipo();
      if (eq && eq[1] === sha(eq[2] + c)) {
        r.equipo = true;
      } else {
        const filas = leerFilas('miembros');
        const buscado = sha('persona:' + c);
        for (let i = 0; i < filas.length; i++) {
          if (filas[i][2] === buscado && !filas[i][5]) {
            r.equipo = true; r.persona = filas[i][1];
            const ultimo = filas[i][4] ? Date.parse(filas[i][4]) : 0;
            if (Date.now() - ultimo > 300000) {
              hoja('miembros', CAB_MIEMBROS).getRange(i + 2, 5).setValue(new Date().toISOString());
            }
            break;
          }
        }
      }
    }
  }

  cache.put(clave, JSON.stringify(r), SEGUNDOS_CACHE_AUTH);
  return r;
}

function comoEquipo(b, fn) {
  const q = quienEs(b);
  if (!q.luis && !q.equipo) throw conCodigo('Sin acceso a la nube del equipo', 'sin_acceso');
  return fn();
}

// ---------------------------------------------------------------------
//  Herramientas de Drive (el puente de antes)
// ---------------------------------------------------------------------
function herramienta(nombre, i) {
  if (nombre === 'create_file') {
    const carpeta = carpetaPermitida(i.parentId || RAIZ);
    const titulo = String(i.title || 'archivo').slice(0, 200);
    let f;
    if (i.contentMimeType === 'application/vnd.google-apps.folder') {
      f = carpeta.createFolder(titulo);
    } else {
      const bytes = Utilities.base64Decode(String(i.base64Content || ''));
      f = carpeta.createFile(Utilities.newBlob(bytes, i.contentMimeType || 'application/octet-stream', titulo));
    }
    return { id: f.getId(), title: f.getName(), viewUrl: f.getUrl() };
  }

  if (nombre === 'search_files') {
    const m = String(i.query || '').match(/parentId\s*=\s*'([A-Za-z0-9_-]+)'/);
    const carpeta = carpetaPermitida(m ? m[1] : RAIZ);
    const tope = Math.min(Number(i.pageSize) || 100, 500);
    const files = [];
    const subs = carpeta.getFolders();
    while (subs.hasNext() && files.length < tope) {
      const s = subs.next();
      files.push({ id: s.getId(), title: s.getName(), mimeType: 'application/vnd.google-apps.folder' });
    }
    const arch = carpeta.getFiles();
    while (arch.hasNext() && files.length < tope) {
      const a = arch.next();
      files.push({ id: a.getId(), title: a.getName(), mimeType: a.getMimeType() });
    }
    return { files: files };
  }

  if (nombre === 'trash_file') {
    const id = String(i.fileId || '');
    if (!id || id === RAIZ) throw new Error('No se puede mandar esa carpeta a la papelera');
    let item;
    try { item = DriveApp.getFileById(id); } catch (x) { item = DriveApp.getFolderById(id); }
    if (!dentroDeRaiz(item)) throw new Error('El archivo no esta en Seguimiento de Recibo');
    item.setTrashed(true);
    return { ok: true };
  }

  throw new Error('Herramienta desconocida: ' + nombre);
}

function carpetaPermitida(id) {
  const c = DriveApp.getFolderById(id);
  if (id !== RAIZ && !dentroDeRaiz(c)) throw new Error('La carpeta no esta en Seguimiento de Recibo');
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

function carpetaFotos() {
  const raiz = DriveApp.getFolderById(RAIZ);
  const it = raiz.getFoldersByName(CARPETA_FOTOS);
  return it.hasNext() ? it.next() : raiz.createFolder(CARPETA_FOTOS);
}

// ---------------------------------------------------------------------
//  Fotos que ya estaban en Drive (antes de la mudanza)
//  La app las nombra "fecha - proveedor - descripcion - A1B2C3.jpg":
//  los últimos 6 caracteres son el final del id de la foto.
// ---------------------------------------------------------------------
function mapaDeFotos() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('mapa_fotos');
  if (guardado) { try { return JSON.parse(guardado); } catch (x) { /* se rehace */ } }

  const mapa = {};
  const raiz = DriveApp.getFolderById(RAIZ);
  const carpetas = raiz.getFoldersByName('Fotos');
  if (carpetas.hasNext()) recorrerFotos(carpetas.next(), '', mapa, 0);

  const texto = JSON.stringify(mapa);
  if (texto.length < 100000) cache.put('mapa_fotos', texto, 21600); // 6 horas
  return mapa;
}

function recorrerFotos(carpeta, semana, mapa, nivel) {
  if (nivel > 3) return;
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const f = archivos.next();
    const m = f.getName().match(/-([A-Za-z0-9]{6})\.jpe?g$/i);
    if (m) mapa[m[1].toUpperCase()] = { id: f.getId(), sem: semana };
  }
  const subs = carpeta.getFolders();
  while (subs.hasNext()) {
    const s = subs.next();
    recorrerFotos(s, nivel === 0 ? s.getName() : semana, mapa, nivel + 1);
  }
}

function archivoPorSufijo(id) {
  const mapa = mapaDeFotos();
  const dato = mapa[String(id).slice(-6).toUpperCase()];
  if (!dato) return null;
  try { return DriveApp.getFileById(dato.id); } catch (x) { return null; }
}

// Ejecutar una vez después de importar las planillas: vuelve a enlazar cada
// foto con el archivo que ya está en Drive. Así no se suben dos veces.
function indexarFotos() {
  const mapa = mapaDeFotos();
  const { filas } = leerDocs();
  const fids = {};
  for (let i = 0; i < filas.length; i++) {
    const d = filaADoc(filas[i]);
    if (!d || d.coleccion !== 'planillas' || !d.datos || !d.datos.fotos) continue;
    for (const fid of Object.keys(d.datos.fotos)) fids[fid] = true;
  }

  const h = hoja('docs', CAB_DOCS);
  const filasDocs = h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, CAB_DOCS.length).getValues() : [];
  const donde = {};
  for (let i = 0; i < filasDocs.length; i++) donde[filasDocs[i][0] + '/' + filasDocs[i][1]] = i + 2;

  const nuevos = [];
  let enlazadas = 0, sinArchivo = 0;
  for (const fid of Object.keys(fids)) {
    const dato = mapa[fid.slice(-6).toUpperCase()];
    if (!dato) { sinArchivo++; continue; }
    const rec = { id: dato.id, url: 'https://drive.google.com/file/d/' + dato.id + '/view', sem: dato.sem || '' };
    const fila = armarFilaDoc({ coleccion: 'drivefotos', id: fid, datos: rec, version: 1, borrado: false, actualizado_por: 'indice', actualizado_en: new Date().toISOString() });
    const clave = 'drivefotos/' + fid;
    if (donde[clave]) h.getRange(donde[clave], 1, 1, CAB_DOCS.length).setValues([fila]);
    else { nuevos.push(fila); donde[clave] = -1; }
    enlazadas++;
  }
  for (let i = 0; i < nuevos.length; i += 200) {
    h.getRange(h.getLastRow() + 1, 1, Math.min(200, nuevos.length - i), CAB_DOCS.length).setValues(nuevos.slice(i, i + 200));
  }

  subirContador();
  return 'Fotos enlazadas: ' + enlazadas + '. Sin archivo en Drive: ' + sinArchivo + '. Carpetas revisadas: ' + Object.keys(mapa).length + ' fotos.';
}

// ---------------------------------------------------------------------
//  Hojas: lectura y escritura
// ---------------------------------------------------------------------
const _hojas = {};
function hoja(nombre, cabecera) {
  if (_hojas[nombre]) return _hojas[nombre];
  const libro = SpreadsheetApp.openById(ID_HOJA);
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.getRange(1, 1, 1, cabecera.length).setValues([cabecera]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  _hojas[nombre] = h;
  return h;
}

function leerFilas(nombre) {
  const cabeceras = { docs: CAB_DOCS, equipo: CAB_EQUIPO, miembros: CAB_MIEMBROS, sesiones: CAB_SESIONES, meta: CAB_META };
  const h = hoja(nombre, cabeceras[nombre]);
  const ultima = h.getLastRow();
  if (ultima < 2) return [];
  return h.getRange(2, 1, ultima - 1, cabeceras[nombre].length).getValues();
}

function escribirFila(nombre, fila) {
  hoja(nombre, { equipo: CAB_EQUIPO, miembros: CAB_MIEMBROS, sesiones: CAB_SESIONES, meta: CAB_META }[nombre] || CAB_DOCS)
    .appendRow(fila);
}

function borrarFila(nombre, id) {
  const h = hoja(nombre, { equipo: CAB_EQUIPO, miembros: CAB_MIEMBROS }[nombre] || CAB_DOCS);
  const filas = leerFilas(nombre);
  for (let i = 0; i < filas.length; i++) if (String(filas[i][0]) === String(id)) { h.deleteRow(i + 2); return; }
}

function filaEquipo() {
  const filas = leerFilas('equipo');
  for (let i = 0; i < filas.length; i++) if (filas[i][0] === 'principal') return filas[i];
  return null;
}

function listarPersonas() {
  const filas = leerFilas('miembros');
  const salida = [];
  for (let i = 0; i < filas.length; i++) {
    if (filas[i][5]) continue;
    salida.push({ id: filas[i][0], nombre: filas[i][1], creado: filas[i][3], ultimo_uso: filas[i][4] || null });
  }
  return salida;
}

function leerMeta(clave) {
  const filas = leerFilas('meta');
  for (let i = 0; i < filas.length; i++) if (filas[i][0] === clave) return filas[i][1];
  return null;
}

function escribirMeta(clave, valor) {
  const h = hoja('meta', CAB_META);
  const filas = leerFilas('meta');
  for (let i = 0; i < filas.length; i++) {
    if (filas[i][0] === clave) { h.getRange(i + 2, 2).setValue(valor); return; }
  }
  h.appendRow([clave, valor]);
}

function subirContador() {
  const actual = Number(leerMeta('v') || 0) + 1;
  escribirMeta('v', actual);
}

// ---------------------------------------------------------------------
//  Documentos
// ---------------------------------------------------------------------
function leerDocs() {
  const h = hoja('docs', CAB_DOCS);
  const ultima = h.getLastRow();
  if (ultima < 2) return { filas: [], indice: {} };
  const valores = h.getRange(2, 1, ultima - 1, CAB_DOCS.length).getValues();
  const indice = {};
  for (let i = 0; i < valores.length; i++) {
    valores[i].__fila = i + 2;
    indice[valores[i][0] + '/' + valores[i][1]] = valores[i];
  }
  return { filas: valores, indice: indice };
}

function buscarDoc(coleccion, id) {
  const h = hoja('docs', CAB_DOCS);
  const ultima = h.getLastRow();
  if (ultima < 2) return null;
  // Solo las dos primeras columnas: es mucho mas rapido que traer los datos.
  const claves = h.getRange(2, 1, ultima - 1, 2).getValues();
  for (let i = 0; i < claves.length; i++) {
    if (claves[i][0] === coleccion && String(claves[i][1]) === String(id)) {
      const fila = h.getRange(i + 2, 1, 1, CAB_DOCS.length).getValues()[0];
      fila.__fila = i + 2;
      return fila;
    }
  }
  return null;
}

function armarFilaDoc(d) {
  const texto = JSON.stringify(d.datos || {});
  const fila = [d.coleccion, d.id, d.version, !!d.borrado, d.actualizado_por || '', d.actualizado_en];
  for (let i = 0; i < PARTES; i++) fila.push(texto.substr(i * TROZO, TROZO));
  return fila;
}

function filaADoc(fila) {
  if (!fila || !fila[0]) return null;
  let texto = '';
  for (let i = 6; i < 6 + PARTES; i++) texto += String(fila[i] || '');
  let datos = {};
  if (texto) { try { datos = JSON.parse(texto); } catch (x) { datos = {}; } }
  return {
    coleccion: fila[0], id: fila[1], version: Number(fila[2]) || 0,
    borrado: fila[3] === true || fila[3] === 'TRUE', datos: datos,
    actualizado_por: fila[4] || '', actualizado_en: fila[5] instanceof Date ? fila[5].toISOString() : String(fila[5] || ''),
  };
}

// ---------------------------------------------------------------------
//  Importar el respaldo que sale de Supabase
// ---------------------------------------------------------------------
// 1. Sube el archivo "recibo-importar.json" a la carpeta Seguimiento de Recibo.
// 2. Ejecuta importarDesdeDrive() desde el editor. Se puede repetir: no duplica.
function importarDesdeDrive(nombre) {
  nombre = nombre || 'recibo-importar.json';
  const it = DriveApp.getFolderById(RAIZ).getFilesByName(nombre);
  if (!it.hasNext()) throw new Error('No encontre ' + nombre + ' en la carpeta Seguimiento de Recibo.');
  const datos = JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
  const docs = datos.recibo_docs || datos.docs || [];
  const equipo = datos.recibo_equipo || [];
  const miembros = datos.recibo_miembros || [];

  let nuevos = 0, actualizados = 0, fotos = 0;
  const h = hoja('docs', CAB_DOCS);
  const filas = h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, CAB_DOCS.length).getValues() : [];
  const donde = {};
  for (let i = 0; i < filas.length; i++) donde[filas[i][0] + '/' + filas[i][1]] = i + 2;

  // Las filas nuevas se escriben por tandas: una por una seria demasiado lento.
  const pendientes = [];
  let filaNueva = h.getLastRow() + 1;
  function volcar() {
    if (!pendientes.length) return;
    h.getRange(filaNueva, 1, pendientes.length, CAB_DOCS.length).setValues(pendientes);
    filaNueva += pendientes.length;
    pendientes.length = 0;
  }

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (!d || COLECCIONES.indexOf(d.coleccion) < 0 || !RE_ID.test(String(d.id || ''))) continue;
    let datosDoc = d.datos || {};

    if (d.coleccion === 'fotos' && datosDoc.data) {
      // Si la foto ya está en Drive (misma terminación del nombre), no se duplica.
      const ya = archivoPorSufijo(d.id);
      let fileId = ya ? ya.getId() : '';
      if (!fileId) {
        const base64 = String(datosDoc.data).split(',').pop();
        fileId = carpetaFotos().createFile(Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', d.id + '.jpg')).getId();
      }
      datosDoc = { pid: datosDoc.pid || null, fileId: fileId };
      fotos++;
    }

    const fila = armarFilaDoc({
      coleccion: d.coleccion, id: d.id, datos: datosDoc,
      version: Number(d.version) || 1, borrado: !!d.borrado,
      actualizado_por: d.actualizado_por || 'importado',
      actualizado_en: d.actualizado_en || new Date().toISOString(),
    });

    if (donde[d.coleccion + '/' + d.id]) {
      h.getRange(donde[d.coleccion + '/' + d.id], 1, 1, CAB_DOCS.length).setValues([fila]);
      actualizados++;
    } else {
      pendientes.push(fila);
      donde[d.coleccion + '/' + d.id] = -1;
      nuevos++;
      if (pendientes.length >= 200) volcar();
    }
  }
  volcar();

  if (equipo.length) {
    const he = hoja('equipo', CAB_EQUIPO);
    if (he.getLastRow() > 1) he.deleteRows(2, he.getLastRow() - 1);
    for (let i = 0; i < equipo.length; i++) he.appendRow([equipo[i].id, equipo[i].hash, equipo[i].sal, equipo[i].creado]);
  }

  if (miembros.length) {
    const hm = hoja('miembros', CAB_MIEMBROS);
    if (hm.getLastRow() > 1) hm.deleteRows(2, hm.getLastRow() - 1);
    for (let i = 0; i < miembros.length; i++) {
      const m = miembros[i];
      hm.appendRow([m.id, m.nombre, m.hash, m.creado, m.ultimo_uso || '', !!m.quitado, m.quitado_en || '']);
    }
  }

  subirContador();
  return 'Importado: ' + nuevos + ' nuevos, ' + actualizados + ' actualizados, ' + fotos + ' fotos.';
}

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function conCodigo(mensaje, codigo) {
  const e = new Error(mensaje);
  e.code = codigo || 'error';
  return e;
}

function conCandado(fn) {
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(20000)) throw conCodigo('La nube esta ocupada; intenta de nuevo', 'ocupado');
  try { return fn(); } finally { candado.releaseLock(); }
}

function sha(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto), Utilities.Charset.UTF_8);
  return bytes.map(function (x) { return ('0' + (x & 0xFF).toString(16)).slice(-2); }).join('');
}

function soloLetras(codigo) {
  return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function codigoNuevo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const uuid = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toUpperCase();
  let s = '';
  for (let i = 0; i < 10; i++) s += letras[parseInt(uuid.charAt(i), 16) % letras.length];
  return s.slice(0, 5) + '-' + s.slice(5);
}
