// App Paletizado 3D – CEDI ATS R10 Valledupar
// Pantallas: Inicio · Ubicaciones · Reubicar · Pedidos · Calcular palet · Ajustes
import { articuloDesdeFila } from './motor/articulo.js';
import { calcularIndices } from './motor/indice.js';
import { paletMono } from './motor/mono.js';
import { proponerReubicacion } from './motor/reubicacion.js';
import { simularPedido } from './motor/simulacion.js';
import { leerArchivo, aCSV } from './datos/importar.js';
import { guardar, leer, borrarTodo } from './datos/almacen.js';
import { dibujar3D, dibujarCapa, nivelesDe, colorDe, grabarVideo, formatoVideo } from './visor.js';
import { BIBLIOTECA } from './biblioteca.js';
import { hojasExcel, libroExcel, textoDiagnostico, guardarArchivo, nombreArchivo } from './exportar.js';
import { generarLayout, mezclar, estadoDe, agregarPosiciones, posicionesDisponibles, borrarPosicion, esAgregada, cuenta, POSICIONES_BASE, catalogo, revisarDatos, COLUMNAS, ZONAS, aMilimetros, desdeMilimetros } from './datos/layout.js';
import { diagnostico, responder } from './agente.js';
import { llamar, idDispositivo, plataforma, enLinea, iniciarSesion, sesionVigente, cerrarSesion, tokenDeLaDireccion, enlaceTarea, mensajeWhatsApp } from './datos/nube.js';

export const REPO = 'luismendoza122/app-paletizado-3d';
const URL_APK = `https://github.com/${REPO}/releases/latest/download/paletizado-3d.apk`;
const ES_APK = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const PALET_EJEMPLO = { largo: 1200, ancho: 1000, altoBase: 150, tara: 25, cargaMax: 1000, alturaMaxTotal: 1800, voladizoMax: 0 };
const REGLAS_EJEMPLO = { soporteMinimo: 0.7, desviacionCGMax: 0.1 };

const estado = {
  filas: mezclar(generarLayout(), leer('ubicaciones', [])),
  pedidos: leer('pedidos', []),
  palet: leer('palet', PALET_EJEMPLO),
  reglas: leer('reglas', REGLAS_EJEMPLO),
  paletConfirmado: leer('paletConfirmado', false),
  propuesta: null,     // resultado de proponerReubicacion
  posiciones: [],      // posiciones ocupadas con artículo e índice
  colores: new Map(),
  tarea: leer('tarea', null),            // tarea abierta por enlace (modo operador)
  conflictos: leer('conflictos', []),    // posiciones que otro cambió al mismo tiempo
  borradas: leer('borradas', {}),        // posiciones agregadas que se borraron: { codigo: { version, pendiente } }
  conocimiento: leer('conocimiento', []),// aprendizaje diario del agente
  conSesion: !!leer('sesion', null),     // Luis inició sesión
  sincronizando: false,
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d }));

// ---------- Datos derivados ----------
function recalcular() {
  // Solo cuentan las posiciones con artículo (las vacías y las divididas no cuentan).
  const ocupadas = estado.filas.filter((f) => ['COMPLETA', 'INCOMPLETA'].includes(estadoDe(f)));
  const lineasPorCodigo = new Map();
  for (const p of estado.pedidos) {
    const c = String(p.CODIGO_ARTICULO ?? '').trim();
    if (c) lineasPorCodigo.set(c, (lineasPorCodigo.get(c) || 0) + 1);
  }
  const posiciones = ocupadas.map((fila) => {
    const { articulo, faltan } = articuloDesdeFila(fila);
    return { fila, art: articulo, faltan, lineas: lineasPorCodigo.get(articulo.codigo) || 0 };
  });
  const unicos = new Map();
  for (const p of posiciones) if (!p.faltan.length && !unicos.has(p.art.codigo)) unicos.set(p.art.codigo, p.art);
  const indices = calcularIndices([...unicos.values()]);
  for (const p of posiciones) {
    const ix = indices.get(p.art.codigo);
    p.ia = ix ? ix.ia : null;
    p.clase = ix ? ix.clase : null;
  }
  estado.posiciones = posiciones;
  estado.propuesta = null;
}

function zonas() {
  return [...new Set(estado.filas.map((f) => f.SECCION).filter(Boolean))];
}

function guardarFilas() {
  // Se guarda solo lo que tiene información (las posiciones sin revisar se regeneran del mapa).
  guardar('ubicaciones', estado.filas.filter((f) => f.ESTADO !== 'SIN REVISAR' || f.SUBPOSICION || !POSICIONES_BASE.includes(f.POSICION)));
  guardar('borradas', estado.borradas);
}

// Si se vuelve a crear una posición que se había borrado, sigue con su versión en la nube.
function revivir() {
  for (const f of estado.filas) {
    const b = estado.borradas[f.CODIGO];
    if (!b) continue;
    f._version = b.version || f._version; f._pendiente = true;
    delete estado.borradas[f.CODIGO];
  }
}

function contexto() {
  return { filas: estado.filas, posiciones: estado.posiciones, propuesta: estado.propuesta, pedidos: estado.pedidos, palet: estado.palet, paletConfirmado: estado.paletConfirmado, conocimiento: estado.conocimiento };
}

// ---------- Información compartida (una sola para todos) ----------
const VERSION_APP = '0.7.0';
function miNombre() { return estado.tarea?.asignado_a || (estado.conSesion ? 'Luis' : 'Este celular'); }
function datosDe(f) { return Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('_'))); }
function pendientes() { return estado.filas.filter((f) => f._pendiente); }

// Pone en el equipo lo que viene del servidor (sin pisar lo que este celular cambió y no ha enviado).
function aplicarServidor(lista) {
  const porCodigo = new Map(estado.filas.map((f) => [f.CODIGO, f]));
  let nuevas = 0;
  for (const r of lista || []) {
    let f = porCodigo.get(r.codigo);
    const b = estado.borradas[r.codigo];
    if (b?.pendiente) continue;                              // este celular la borró y no lo ha enviado
    if (r.datos?.ESTADO === 'BORRADA') {                     // otra persona la borró
      if (f && f._pendiente) continue;
      if (f) { estado.filas = estado.filas.filter((x) => x !== f); porCodigo.delete(r.codigo); }
      estado.borradas[r.codigo] = { version: r.version };
      continue;
    }
    if (b) delete estado.borradas[r.codigo];                 // la volvieron a crear
    if (f && f._pendiente) continue;
    if (!f) { f = { CODIGO: r.codigo }; estado.filas.push(f); porCodigo.set(r.codigo, f); nuevas++; }
    for (const k of Object.keys(f)) if (!['CODIGO', 'SECCION', 'PASILLO', 'MODULO', 'POSICION', 'SUBPOSICION', 'SECUENCIA_RUTA'].includes(k) && !k.startsWith('_')) delete f[k];
    Object.assign(f, r.datos, { _version: r.version, _por: r.actualizado_por, _en: r.actualizado_en });
    if (!['VACIA', 'DIVIDIDA'].includes(f.ESTADO)) f.ESTADO = estadoDe({ ...f, ESTADO: '' });
  }
  if (nuevas) estado.filas = mezclar(estado.filas, []);
  guardarFilas();
  recalcular();
}

let temporizador = null;
function programarEnvio() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => sincronizar(), 1500);
}

async function sincronizar({ cerrar = !!estado.tarea?.terminada } = {}) {
  if (estado.sincronizando || !enLinea()) return;
  const cambios = [...pendientes().map((f) => ({ codigo: f.CODIGO, version_base: f._version || 0, datos: datosDe(f) })),
    ...Object.entries(estado.borradas).filter(([, b]) => b.pendiente).map(([codigo, b]) => ({ codigo, version_base: b.version || 0, datos: { CODIGO: codigo, ESTADO: 'BORRADA' } }))];
  const t = estado.tarea;
  if (!t && !estado.conSesion) return;
  if (t?.cerrada) return;
  if (!cambios.length && !cerrar) return;
  estado.sincronizando = true;
  try {
    let r;
    if (t) r = await llamar('tarea_enviar', { token: t.token, cambios, cerrar });
    else r = await llamar('guardar', { cambios, por: 'Luis' }, await sesionVigente());
    const porCodigo = new Map(estado.filas.map((f) => [f.CODIGO, f]));
    for (const g of r.guardadas || []) {
      if (estado.borradas[g.codigo]) { estado.borradas[g.codigo] = { version: g.version }; continue; }
      const f = porCodigo.get(g.codigo);
      if (f) { f._version = g.version; f._pendiente = false; f._por = miNombre(); f._en = new Date().toISOString(); }
    }
    // Si otra persona llenó una posición que este celular borró, queda la de ella (no se borra)
    const noBorradas = (r.conflictos || []).filter((c) => estado.borradas[c.codigo]);
    for (const c of noBorradas) {
      delete estado.borradas[c.codigo];
      estado.filas.push({ ...c.servidor, CODIGO: c.codigo, _version: c.version });
    }
    if (noBorradas.length) { estado.filas = mezclar(estado.filas, []); notificar(`No se borró ${noBorradas.map((c) => c.codigo).join(', ')}: otra persona ya la había llenado.`, 'error'); }
    estado.conflictos = (r.conflictos || []).filter((c) => !noBorradas.includes(c)).map((c) => ({ ...c, mio: datosDe(porCodigo.get(c.codigo) || {}) }));
    guardar('conflictos', estado.conflictos);
    if (r.posiciones) aplicarServidor(r.posiciones); else guardarFilas();
    if (r.cerrada && t) { t.cerrada = true; guardar('tarea', t); notificar('Tarea enviada. El enlace quedó inhabilitado.'); }
    else if ((r.guardadas || []).length) notificar(`Enviadas ${(r.guardadas || []).length} posiciones`);
    if (estado.conflictos.length) notificar(`${estado.conflictos.length} posiciones las cambió otra persona: revisa en "Tomar datos"`, 'error');
  } catch (e) {
    if (e.codigo === 410 || e.codigo === 409) { if (t) { t.error = e.message; guardar('tarea', t); } }
    notificar(`No se pudo enviar: ${e.message}`, 'error');
  } finally {
    estado.sincronizando = false;
    if (['tomar', 'inicio', 'tareas'].includes(pestanaActual)) mostrar(pestanaActual);
  }
}

async function abrirTareaDeEnlace(token) {
  if (estado.tarea?.token === token) return; // ya está en este celular (sirve sin internet)
  if (estado.tarea && !estado.tarea.cerrada && pendientes().length) {
    notificar('Termina y envía la tarea actual antes de abrir otra', 'error');
    return;
  }
  if (!enLinea()) { notificar('Para abrir la tarea la primera vez se necesita internet', 'error'); return; }
  try {
    const r = await llamar('tarea_abrir', { token });
    estado.tarea = { ...r.tarea, token, cerrada: false, terminada: false };
    guardar('tarea', estado.tarea);
    aplicarServidor(r.posiciones);
    const z = ZONAS.find((x) => x.pasillos.includes(r.tarea.pasillos[0]));
    estado.tomaZona = z?.zona; estado.tomaPasillo = r.tarea.pasillos[0];
    notificar(`Tarea abierta: ${r.tarea.titulo}`);
    mostrar('tomar');
  } catch (e) {
    estado.errorEnlace = e.message;
    mostrar('inicio');
  }
}

function bannerTarea() {
  const t = estado.tarea;
  if (!t) return estado.errorEnlace ? `<div class="aviso error">${esc(estado.errorEnlace)}</div>` : '';
  const n = pendientes().length;
  if (t.cerrada) return `<div class="aviso ok"><b>Tarea enviada y cerrada:</b> ${esc(t.titulo)}. El enlace ya no sirve. <button class="boton sec" id="salirTarea">Salir de la tarea</button></div>`;
  return `<div class="aviso tarea"><b>Tarea:</b> ${esc(t.titulo)} · ${esc(t.asignado_a)} · pasillos ${esc(t.pasillos.join(', '))}<br>
    ${n ? `${n} posiciones por enviar` : 'Todo enviado'} · ${enLinea() ? 'con internet' : 'sin internet (se envía sola al volver la conexión)'}
    ${t.terminada ? '<br><b>Marcada como terminada: se enviará y cerrará al tener conexión.</b>' : ''}${t.error ? `<br><b>${esc(t.error)}</b>` : ''}
    <br><button class="boton" id="terminarTarea">Terminar y enviar</button></div>`;
}

function conectarBanner() {
  $('#terminarTarea')?.addEventListener('click', async () => {
    if (!(await confirmar('¿Terminaste la tarea? Se envía todo y el enlace queda inhabilitado.'))) return;
    estado.tarea.terminada = true; guardar('tarea', estado.tarea);
    if (enLinea()) sincronizar({ cerrar: true }); else { notificar('Sin internet: se enviará sola al volver la conexión'); mostrar(pestanaActual); }
  });
  $('#salirTarea')?.addEventListener('click', () => { estado.tarea = null; guardar('tarea', null); history.replaceState(null, '', location.pathname); mostrar('inicio'); });
}

async function alIniciar() {
  if (enLinea()) {
    llamar('registrar', { id: idDispositivo(), plataforma: plataforma(), version: VERSION_APP, nombre: miNombre() }).catch(() => {});
    llamar('conocimiento', { limite: 40 }).then((r) => { estado.conocimiento = r.conocimiento || []; guardar('conocimiento', estado.conocimiento); if (pestanaActual === 'agente') mostrar('agente'); }).catch(() => {});
    if (estado.tarea && !estado.tarea.cerrada) {
      if (estado.tarea.terminada) sincronizar({ cerrar: true }); else if (pendientes().length) sincronizar();
    } else if (estado.conSesion && pendientes().length) sincronizar();
  }
  const token = tokenDeLaDireccion();
  if (token) abrirTareaDeEnlace(token);
}
window.addEventListener('online', () => {
  notificar('Volvió la conexión');
  if (estado.tarea?.terminada && !estado.tarea.cerrada) sincronizar({ cerrar: true }); else sincronizar();
});
window.addEventListener('offline', () => { notificar('Sin conexión: sigue trabajando, se guarda en el celular'); if (pestanaActual === 'tomar') mostrar('tomar'); });
window.addEventListener('hashchange', () => { const t = tokenDeLaDireccion(); if (t) abrirTareaDeEnlace(t); });

function mapaActual() {
  const m = new Map();
  for (const p of estado.posiciones) if (!p.faltan.length && !m.has(p.art.codigo)) m.set(p.art.codigo, { fila: p.fila, art: p.art, ia: p.ia });
  return m;
}

function mapaPropuesto() {
  if (!estado.propuesta) return null;
  const filaPorCodigo = new Map(estado.filas.map((f) => [f.CODIGO, f]));
  const m = new Map(mapaActual());
  for (const [codUbic, p] of estado.propuesta.nuevoMapa) {
    m.set(p.art.codigo, { fila: filaPorCodigo.get(codUbic) || p.fila, art: p.art, ia: p.ia });
  }
  return m;
}

async function descargar(nombre, contenido, tipo = 'text/csv') {
  const blob = contenido instanceof Blob ? contenido : new Blob(['\ufeff' + contenido], { type: `${tipo};charset=utf-8` });
  try {
    const r = await guardarArchivo(nombre, blob);
    notificar(r === 'compartido' ? `Listo: ${nombre}. Elige dónde guardarlo o a quién enviarlo.` : `Descargado: ${nombre}`);
  } catch (e) {
    notificar(`No se pudo guardar ${nombre}: ${e.message || e}. Usa "Copiar" o abre la app en el navegador.`, 'error');
  }
}

// Excel con las hojas que se pidan (por defecto, todo). Se puede editar en el PC y volver a cargar en Inicio.
async function exportarExcel(base = 'paletizado-cedi', solo = null) {
  try {
    const todas = hojasExcel({ filas: estado.filas, posiciones: estado.posiciones, pedidos: estado.pedidos, propuesta: estado.propuesta,
      pruebaPedidos: estado.pruebaPedidos, diag: diagnostico(contexto()) });
    const hojas = solo ? Object.fromEntries(solo.filter((k) => todas[k]).map((k) => [k, todas[k]])) : todas;
    await descargar(nombreArchivo(base, 'xlsx'), libroExcel(hojas));
  } catch (e) { notificar(e.message || String(e), 'error'); }
}

// Aviso dentro de la página (en algunas vistas no se permiten ventanas emergentes).
function notificar(texto, tipo = 'ok') {
  const d = document.createElement('div');
  d.className = `toast ${tipo}`;
  d.textContent = texto;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

// Pregunta Sí/No dentro de la página. Devuelve una promesa con true o false.
function confirmar(texto) {
  return new Promise((resolver) => {
    const fondo = document.createElement('div');
    fondo.className = 'dialogo';
    fondo.innerHTML = `<div class="caja"><p></p><button class="boton peligro" data-r="1">Sí</button><button class="boton sec" data-r="0">No</button></div>`;
    fondo.querySelector('p').textContent = texto;
    fondo.addEventListener('click', (e) => {
      const r = e.target.dataset?.r;
      if (r === undefined) return;
      fondo.remove();
      resolver(r === '1');
    });
    document.body.appendChild(fondo);
  });
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); notificar('Copiado. Pégalo en Excel o en WhatsApp.'); }
  catch {
    // Si no deja copiar, se muestra el texto para seleccionarlo a mano.
    const fondo = document.createElement('div');
    fondo.className = 'dialogo';
    fondo.innerHTML = '<div class="caja"><p>Selecciona todo y cópialo:</p><textarea rows="10"></textarea><button class="boton">Cerrar</button></div>';
    fondo.querySelector('textarea').value = texto;
    fondo.querySelector('button').addEventListener('click', () => fondo.remove());
    document.body.appendChild(fondo);
  }
}

// ---------- Pantallas ----------
const pantallas = {
  inicio() {
    const total = estado.filas.filter(cuenta).length;
    const revisadas = estado.filas.filter((f) => cuenta(f) && estadoDe(f) !== 'SIN REVISAR').length;
    const ocupadas = estado.posiciones.length;
    const completas = estado.posiciones.filter((p) => !p.faltan.length).length;
    const pedidosUnicos = new Set(estado.pedidos.map((p) => p.PEDIDO)).size;
    const porZona = zonas().map((z) => {
      const pz = estado.posiciones.filter((p) => p.fila.SECCION === z);
      return `<tr><td>${esc(z)}</td><td class="num">${fmt(estado.filas.filter((f) => f.SECCION === z && cuenta(f)).length)}</td><td class="num">${fmt(pz.length)}</td><td class="num">${fmt(pz.filter((p) => !p.faltan.length).length)}</td></tr>`;
    }).join('');
    return `${bannerTarea()}
      ${estado.paletConfirmado ? '' : '<div class="aviso">Las medidas del palet (altura y peso máximos) son <b>de ejemplo</b>. Confírmalas con el CEDI en <b>Ajustes</b>.</div>'}
      <section class="tarjeta">
        <h2>1. Datos</h2>
        <p class="nota">Los datos de cada posición se toman en la pestaña <b>Tomar datos</b>. También puedes cargar la hoja "Ubicaciones CEDI" (.xlsx o CSV): se mezcla con lo ya tomado, posición por posición. Los pedidos de prueba se cargan igual.</p>
        <a class="boton" href="#" data-ir="tomar">Tomar datos</a> <a class="boton sec" href="#" data-ir="agente">Preguntar al agente</a>
        <input type="file" id="archivo" accept=".xlsx,.csv,.txt">
        <div id="resultadoImport"></div>
      </section>
      <section class="tarjeta">
        <h2>Exportar a Excel</h2>
        <p class="nota">Un solo archivo con todas las hojas: UBICACIONES, ARTICULOS (con su clase), REUBICACION, PEDIDOS, PRUEBA_PEDIDOS y DIAGNOSTICO. Edita UBICACIONES o PEDIDOS en el PC (sin cambiar los títulos de las columnas ni el CODIGO) y vuelve a cargarlo arriba.</p>
        <button class="boton" id="excelTodo">Descargar Excel completo</button>
      </section>
      <section class="tarjeta">
        <h2>2. Estado</h2>
        <div class="cifras">
          <div class="cifra"><b>${fmt(revisadas)} / ${fmt(total)}</b><span>posiciones revisadas</span></div>
          <div class="cifra"><b>${fmt(ocupadas)}</b><span>con artículo (las vacías no cuentan)</span></div>
          <div class="cifra"><b>${fmt(completas)}</b><span>con datos completos</span></div>
          <div class="cifra"><b>${fmt(pedidosUnicos)}</b><span>pedidos de prueba</span></div>
        </div>
        ${porZona ? `<h3>Por zona</h3><div class="tabla"><table><tr><th>Zona</th><th class="num">Posiciones</th><th class="num">Con artículo</th><th class="num">Completas</th></tr>${porZona}</table></div>` : ''}
      </section>
      ${ES_APK ? '' : `<section class="tarjeta">
        <h2>App para el celular</h2>
        <p class="nota">Descarga la APK de Android. Al instalarla, el celular puede pedir permiso para "instalar apps de origen desconocido".</p>
        <a class="boton" href="${URL_APK}">Descargar APK</a>
      </section>`}`;
  },

  tomar() {
    const permitidos = estado.tarea && !estado.tarea.cerrada ? estado.tarea.pasillos : null;
    const zonasVisibles = permitidos ? ZONAS.filter((z) => z.pasillos.some((x) => permitidos.includes(x))) : ZONAS;
    const zona = zonasVisibles.some((z) => z.zona === estado.tomaZona) ? estado.tomaZona : zonasVisibles[0].zona;
    const pasillos = (ZONAS.find((z) => z.zona === zona)?.pasillos || []).filter((x) => !permitidos || permitidos.includes(x));
    const pas = pasillos.includes(estado.tomaPasillo) ? estado.tomaPasillo : pasillos[0];
    const filtro = estado.tomaFiltro || 'todas';
    const delPasillo = estado.filas.filter((f) => f.PASILLO === pas && f.ESTADO !== 'DIVIDIDA');
    const contadas = delPasillo.filter(cuenta).length;
    const revisadas = delPasillo.filter((f) => cuenta(f) && estadoDe(f) !== 'SIN REVISAR').length;
    const lista = delPasillo.filter((f) => filtro === 'todas' || (filtro === 'pendientes' ? ['SIN REVISAR', 'INCOMPLETA'].includes(estadoDe(f)) : estadoDe(f) === 'COMPLETA'));
    const etiqueta = { 'SIN REVISAR': 'sin', VACIA: 'vac', INCOMPLETA: 'inc', COMPLETA: 'ok' };
    const filas = lista.map((f) => {
      const e = estadoDe(f);
      return `<button class="pos ${etiqueta[e]}${f._pendiente ? ' pend' : ''}" data-cod="${esc(f.CODIGO)}"><b>${esc(f.CODIGO)}${f._pendiente ? ' ●' : ''}</b><span>${e === 'VACIA' ? 'Vacía' : e === 'SIN REVISAR' ? (esAgregada(f) ? 'Agregada · sin llenar (no cuenta)' : 'Sin revisar') : esc(f.ARTICULO || f.CODIGO_ARTICULO || '')}${e === 'INCOMPLETA' ? ' · <i>faltan datos</i>' : ''}</span></button>`;
    }).join('');
    const conflictos = estado.conflictos.map((c, i) => `<div class="conflicto"><b>${esc(c.codigo)}</b>: ${esc(c.por || 'Otra persona')} la cambió${c.en ? ` el ${esc(new Date(c.en).toLocaleString('es-CO'))}` : ''}.<br>
      Suya: ${esc(resumenDatos(c.servidor))}<br>Tuya: ${esc(resumenDatos(c.mio))}<br>
      <button class="boton" data-conf="${i}" data-r="mia">Dejar la mía</button><button class="boton sec" data-conf="${i}" data-r="suya">Usar la suya</button></div>`).join('');
    const modo = estado.tarea ? '' : estado.conSesion ? '<p class="nota">Sesión de Luis: lo que guardes se comparte con todos.</p>' : '<p class="nota">Sin tarea ni sesión: los datos quedan solo en este celular. Para compartirlos, abre el enlace de una tarea o inicia sesión en "Tareas".</p>';
    return `${bannerTarea()}${conflictos ? `<section class="tarjeta"><h2>⚠ Cambios al mismo tiempo</h2><p class="nota">Otra persona cambió estas posiciones mientras tú trabajabas. Elige cuál dato queda.</p>${conflictos}</section>` : ''}
    <section class="tarjeta">
      <h2>Tomar datos por posición</h2>${modo}
      <p class="nota">Recorre el pasillo en el orden de la ruta. Toca cada posición y registra el artículo que hay. Las vacías márcalas como vacías: no cuentan.</p>
      <div class="fila">
        <label>Zona<select id="tZona">${zonasVisibles.map((z) => `<option ${z.zona === zona ? 'selected' : ''}>${esc(z.zona)}</option>`).join('')}</select></label>
        <label>Pasillo<select id="tPasillo">${pasillos.map((x) => `<option ${x === pas ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label>Mostrar<select id="tFiltro"><option value="todas" ${filtro === 'todas' ? 'selected' : ''}>Todas</option><option value="pendientes" ${filtro === 'pendientes' ? 'selected' : ''}>Pendientes</option><option value="completas" ${filtro === 'completas' ? 'selected' : ''}>Completas</option></select></label>
      </div>
      <div class="barra-avance"><div style="width:${contadas ? Math.round((revisadas / contadas) * 100) : 0}%"></div></div>
      <p class="nota">Pasillo ${esc(pas)}: ${revisadas} de ${contadas} revisadas. Las posiciones agregadas sin llenar no cuentan.</p>
      <div class="lista-pos">${filas || '<p class="nota">Nada que mostrar con este filtro.</p>'}</div>
    </section>
    <section class="tarjeta">
      <h2>Pasar los datos a Excel</h2>
      <p class="nota">Descarga todas las posiciones en Excel para revisarlas o completarlas en el PC; luego cárgalo en Inicio. También puedes copiarlas y pegarlas en la hoja UBICACIONES.</p>
      <button class="boton" id="excelToma">Descargar Excel</button><button class="boton sec" id="copiarToma">Copiar datos tomados</button><button class="boton sec" id="descargarToma">Descargar CSV</button>
    </section>`;
  },

  tareas() {
    if (!estado.conSesion) {
      return `<section class="tarjeta"><h2>Tareas y usuarios (solo Luis)</h2>
        <p class="nota">Entra con tu cuenta de la Central de Luis (la misma de Mis APK).</p>
        <form id="formLogin" class="fila"><label>Correo<input name="correo" type="email" autocomplete="username"></label>
        <label>Contraseña<input name="clave" type="password" autocomplete="current-password"></label><button class="boton">Entrar</button></form>
        <div id="loginMsg"></div></section>`;
    }
    const pas = ZONAS.map((z) => `<div class="grupo-pas"><small>${esc(z.zona)}</small>${z.pasillos.map((p) => `<label class="chk"><input type="checkbox" name="pas" value="${p}"> ${p}</label>`).join('')}</div>`).join('');
    const u = estado.usuarios;
    const t = estado.tareas || [];
    const color = { ABIERTA: 'MEDIO', 'EN CURSO': 'TOPE', CERRADA: 'BASE', ANULADA: 'falta' };
    return `<section class="tarjeta"><h2>Nueva tarea para enviar por WhatsApp</h2>
      <form id="formTarea">
        <div class="fila"><label>Para (nombre)<input name="asignado_a" required></label><label>Título<input name="titulo" placeholder="Ej: Toma pasillo 12"></label><label>El enlace dura (días)<input name="dias" type="number" value="3" min="1" max="30"></label></div>
        <p class="nota">Pasillos de la tarea:</p>${pas}
        <button class="boton">Crear enlace</button>
      </form><div id="nuevaTarea">${estado.ultimaTarea ? tarjetaEnlace(estado.ultimaTarea) : ''}</div></section>
    <section class="tarjeta"><h2>Usuarios de la app</h2>
      ${u ? `<div class="cifras"><div class="cifra"><b>${u.total}</b><span>celulares que la han abierto</span></div><div class="cifra"><b>${u.apk}</b><span>con la APK</span></div><div class="cifra"><b>${u.web}</b><span>por la página web</span></div><div class="cifra"><b>${u.activos7}</b><span>activos últimos 7 días</span></div></div>
        <div class="tabla"><table><tr><th>Nombre</th><th>Tipo</th><th>Versión</th><th>Último uso</th></tr>${u.lista.slice(0, 15).map((d) => `<tr><td>${esc(d.nombre || 'Sin nombre')}</td><td>${esc(d.plataforma)}</td><td>${esc(d.version_app)}</td><td>${esc(new Date(d.ultima_vez).toLocaleString('es-CO'))}</td></tr>`).join('')}</table></div>` : '<p class="nota">Cargando…</p>'}
    </section>
    <section class="tarjeta"><h2>Tareas enviadas</h2>
      ${t.length ? `<div class="tabla"><table><tr><th>Para</th><th>Pasillos</th><th>Estado</th><th class="num">Enviadas</th><th></th></tr>${t.map((x) => `<tr><td>${esc(x.asignado_a)}<br><small>${esc(x.titulo)}</small></td><td>${esc(x.pasillos.join(', '))}</td><td><span class="pill ${color[x.estado]}">${esc(x.estado)}</span></td><td class="num">${x.resumen?.guardadas || 0}</td><td>${['ABIERTA', 'EN CURSO'].includes(x.estado) ? `<a class="boton sec" href="${mensajeWhatsApp(x)}" target="_blank" rel="noopener">WhatsApp</a><button class="boton peligro" data-anular="${esc(x.id)}">Anular</button>` : ''}</td></tr>`).join('')}</table></div>` : '<p class="nota">Todavía no hay tareas.</p>'}
    </section>
    <section class="tarjeta"><h2>Información compartida</h2>
      <p class="nota">Una sola información para todos: baja lo que los operadores ya enviaron, o sube lo que tú tomaste en este celular.</p>
      <button class="boton" id="bajarTodo">Bajar toda la información</button><button class="boton sec" id="subirMio">Subir mis cambios (${pendientes().length})</button>
      <button class="boton sec" id="salirSesion">Cerrar sesión</button>
    </section>`;
  },

  agente() {
    const d = diagnostico(contexto());
    const chat = (estado.chat || []).map((m) => `<div class="msg ${m.de}">${m.texto.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`).join('');
    return `<section class="tarjeta">
      <h2>Agente Paletizado</h2>
      <p class="nota">Revisa los datos tomados, propone mejoras y movimientos y responde preguntas. Funciona sin internet con las reglas del proyecto.</p>
      <div class="cifras">
        <div class="cifra"><b>${d.av.revisadas} / ${d.av.total}</b><span>posiciones revisadas</span></div>
        <div class="cifra"><b>${d.av.COMPLETA}</b><span>completas</span></div>
        <div class="cifra"><b>${d.av.INCOMPLETA}</b><span>con datos a medias</span></div>
        <div class="cifra"><b>${d.av.VACIA}</b><span>vacías (no cuentan)</span></div>
      </div>
      <div class="aviso ok"><b>Siguiente paso:</b> ${esc(d.siguiente)}</div>
      <div class="rapidas"><button class="boton" id="diagExcel">Diagnóstico en Excel</button><a class="boton sec" href="https://wa.me/?text=${encodeURIComponent(textoDiagnostico(d))}" target="_blank" rel="noopener">Enviar por WhatsApp</a><button class="boton sec" id="diagCopiar">Copiar diagnóstico</button></div>
      ${estado.conocimiento.length ? `<h3>Aprendizaje del día</h3>${estado.conocimiento.slice(0, 3).map((k) => `<details class="aprendizaje"><summary>${esc(k.fecha)} · ${esc(k.tema)}: ${esc(k.titulo)}</summary><p>${esc(k.contenido)}</p>${(k.fuentes || []).length ? `<p class="nota">Fuentes: ${(k.fuentes || []).slice(0, 3).map((f) => `<a href="${esc(f.url || f)}" target="_blank" rel="noopener">${esc(f.titulo || f.url || f)}</a>`).join(' · ')}</p>` : ''}</details>`).join('')}` : ''}
      ${d.mejoras.length ? `<h3>Mejoras sugeridas</h3><ol class="mejoras">${d.mejoras.map((m) => `<li>${esc(m.texto)}</li>`).join('')}</ol>` : ''}
    </section>
    <section class="tarjeta">
      <h2>Pregúntale al agente</h2>
      <div class="rapidas">${['¿Cómo voy?', '¿Qué mejoras hay?', '¿Qué movimientos hago primero?', '¿Qué aprendiste hoy?', '¿Cómo agrego o borro una posición?', '¿Qué significa BASE, MEDIO y TOPE?']
        .map((q) => `<button class="boton sec" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="chat" id="chat">${chat || '<p class="nota">Ejemplos: "¿cómo voy en el pasillo 12?", "¿dónde va el aceite?", "¿qué movimientos hago en alimentos?"</p>'}</div>
      <form id="formChat" class="fila"><label>Tu pregunta<input id="pregunta" autocomplete="off" placeholder="Escribe aquí…"></label><button class="boton">Preguntar</button></form>
      <details class="mas"><summary>Biblioteca del agente (${BIBLIOTECA.length} fichas)</summary>
        <p class="nota">Toca un tema para leerlo. También puedes preguntar con tus palabras.</p>
        ${[...new Set(BIBLIOTECA.map((f) => f.tema))].map((tema) => `<h3>${esc(tema)}</h3><div class="rapidas">${BIBLIOTECA.map((f, i) => f.tema === tema ? `<button class="boton sec" data-ficha="${i}">${esc(f.titulo)}</button>` : '').join('')}</div>`).join('')}
      </details>
    </section>`;
  },

  ubicaciones() {
    const z = estado.filtroZona || '';
    const pas = estado.filtroPasillo || '';
    const pasillos = [...new Set(estado.posiciones.filter((p) => !z || p.fila.SECCION === z).map((p) => p.fila.PASILLO))].sort();
    let lista = estado.posiciones.filter((p) => (!z || p.fila.SECCION === z) && (!pas || p.fila.PASILLO === pas));
    lista = [...lista].sort((a, b) => String(a.fila.SECCION).localeCompare(String(b.fila.SECCION)) || Number(a.fila.SECUENCIA_RUTA) - Number(b.fila.SECUENCIA_RUTA));
    const conteo = { BASE: 0, MEDIO: 0, TOPE: 0, falta: 0 };
    lista.forEach((p) => { conteo[p.clase || 'falta']++; });
    const filas = lista.slice(0, 400).map((p) => `<tr>
      <td>${esc(p.fila.CODIGO)}</td><td>${esc(p.art.nombre)}<br><small>${esc(p.art.codigo)}</small></td>
      <td>${p.clase ? `<span class="pill ${p.clase}">${p.clase}</span>` : '<span class="pill falta">FALTA</span>'}</td>
      <td>${p.art.largo ? `${p.art.largo}×${p.art.ancho}×${p.art.alto}` : '—'}</td><td class="num">${fmt(p.art.peso, 1)}</td>
      <td>${p.art.empaque === 'BULTO' ? '<span class="marca">BULTO</span>' : ''}${p.art.liquido ? '<span class="marca">LÍQ</span>' : ''}${p.art.delicado ? '<span class="marca">DELIC</span>' : ''}</td>
      <td><small>${esc(p.faltan.join(', '))}</small></td></tr>`).join('');
    return `<section class="tarjeta">
      <h2>Ubicaciones con artículo</h2>
      <div class="fila">
        <label>Zona<select id="fZona"><option value="">Todas</option>${zonas().map((x) => `<option ${x === z ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label>Pasillo<select id="fPasillo"><option value="">Todos</option>${pasillos.map((x) => `<option ${x === pas ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      </div>
      <p class="leyenda"><span><i style="background:var(--base)"></i>BASE ${conteo.BASE}</span><span><i style="background:var(--medio)"></i>MEDIO ${conteo.MEDIO}</span><span><i style="background:var(--tope)"></i>TOPE ${conteo.TOPE}</span><span><i style="background:#8a94a1"></i>Faltan datos ${conteo.falta}</span></p>
      <p class="nota">BASE = pesado/resistente (va primero en la ruta y abajo en el palet). TOPE = liviano o delicado (va de último y arriba).</p>
      ${lista.length ? `<div class="tabla"><table><tr><th>Ubicación</th><th>Artículo</th><th>Clase</th><th>A×B×H mm</th><th class="num">kg</th><th>Tipo</th><th>Falta</th></tr>${filas}</table></div>` : '<p class="nota">No hay posiciones con artículo. Carga la hoja en Inicio.</p>'}
      ${lista.length > 400 ? '<p class="nota">Mostrando las primeras 400. Filtra por pasillo para ver más.</p>' : ''}
    </section>`;
  },

  reubicacion() {
    const z = estado.zonaReubicar || '';
    const pr = estado.propuesta;
    let res = '';
    if (pr) {
      const filas = pr.movimientos.slice(0, 500).map((m, i) => `<tr><td class="num">${i + 1}</td><td>${esc(m.articulo)}<br><small>${esc(m.codigoArticulo)}</small></td><td><span class="pill ${m.clase}">${m.clase}</span></td><td>${esc(m.desde)}</td><td><b>${esc(m.hacia)}</b></td></tr>`).join('');
      res = `<div class="aviso ok">${pr.movimientos.length} movimientos propuestos · ${pr.ciclos} cadenas cerradas (cada una necesita una ubicación temporal libre).</div>
        ${pr.excepciones.length ? `<div class="aviso">${pr.excepciones.length} avisos:<br>${pr.excepciones.slice(0, 10).map(esc).join('<br>')}</div>` : ''}
        <button class="boton" id="excelPlan">Descargar plan (Excel)</button><button class="boton sec" id="exportarPlan">CSV</button><button class="boton sec" id="copiarPlan">Copiar plan</button>
        <a class="boton sec" href="#" data-ir="pedidos">Probar con pedidos</a>
        <div class="tabla"><table><tr><th class="num">#</th><th>Artículo</th><th>Clase</th><th>Desde</th><th>Hacia</th></tr>${filas}</table></div>`;
    }
    return `<section class="tarjeta">
      <h2>Proponer reubicación</h2>
      <p class="nota">Versión 1: ordena los artículos <b>dentro de cada pasillo</b> para que la ruta recoja BASE → MEDIO → TOPE. Nunca cambia de zona. Las posiciones vacías, bloqueadas o con datos incompletos se quedan como están.</p>
      <div class="fila"><label>Zona<select id="zReubicar"><option value="">Todas</option>${zonas().map((x) => `<option ${x === z ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
      <button class="boton" id="proponer" ${estado.posiciones.length ? '' : 'disabled'}>Calcular propuesta</button>
      <p class="nota">La propuesta la aprueba el supervisor; el cambio en el WPMS lo hace el CEDI.</p>
      ${res}
    </section>`;
  },

  pedidos() {
    const grupos = new Map();
    for (const l of estado.pedidos) {
      const k = String(l.PEDIDO ?? '').trim();
      if (!k) continue;
      if (!grupos.has(k)) grupos.set(k, { tienda: l.TIENDA, lineas: 0, cajas: 0 });
      const g = grupos.get(k); g.lineas++; g.cajas += Number(l.CAJAS) || 0;
    }
    const sel = estado.pedidoSel || '';
    return `<section class="tarjeta">
      <h2>Probar con pedidos reales</h2>
      ${grupos.size ? '' : '<p class="nota">No hay pedidos. Llénalos en la hoja PEDIDOS y vuelve a cargar el archivo en Inicio.</p>'}
      <div class="fila"><label>Pedido<select id="pedidoSel"><option value="">Elige un pedido</option>${[...grupos].map(([k, g]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(k)} · ${esc(g.tienda || '')} · ${g.cajas} cajas</option>`).join('')}</select></label></div>
      <button class="boton" id="simularTodos" ${grupos.size ? '' : 'disabled'}>Probar todos los pedidos</button>
      ${estado.propuesta ? '' : '<p class="nota">Para comparar con la propuesta, primero calcula la reubicación en "Reubicar".</p>'}
      <div id="resultadoPedido"></div>
    </section>`;
  },

  calculadora() {
    const arts = new Map();
    for (const p of estado.posiciones) if (!p.faltan.length && !arts.has(p.art.codigo)) arts.set(p.art.codigo, p.art);
    return `<section class="tarjeta">
      <h2>Calcular palet de un solo artículo</h2>
      <div class="fila">
        <label>Artículo de la hoja<select id="cArt"><option value="">— Escribir medidas a mano —</option>${[...arts.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((a) => `<option value="${esc(a.codigo)}">${esc(a.nombre)} (${esc(a.codigo)})</option>`).join('')}</select></label>
      </div>
      <div class="fila">
        <label>Largo A (mm)<input id="cA" type="number" inputmode="numeric" value="400"></label>
        <label>Ancho B (mm)<input id="cB" type="number" inputmode="numeric" value="300"></label>
        <label>Alto H (mm)<input id="cH" type="number" inputmode="numeric" value="250"></label>
        <label>Peso (kg)<input id="cP" type="number" inputmode="decimal" step="0.1" value="8"></label>
        <label>Empaque<select id="cE"><option>CAJA</option><option>BULTO</option></select></label>
        <label>Aguanta encima (cajas)<input id="cM" type="number" inputmode="numeric" placeholder="opcional"></label>
      </div>
      <button class="boton" id="calcular">Calcular</button>
      <div id="resultadoCalc"></div>
    </section>`;
  },

  ajustes() {
    const p = estado.palet, r = estado.reglas;
    const campo = (id, t, v, extra = '') => `<label>${t}<input id="${id}" type="number" inputmode="decimal" value="${esc(v)}" ${extra}></label>`;
    return `<section class="tarjeta">
      <h2>Palet y reglas del CEDI</h2>
      <p class="nota">Confirma estos valores con el CEDI. Altura máxima = desde el piso hasta lo más alto, incluida la estiba.</p>
      <div class="fila">
        ${campo('aL', 'Largo estiba (mm)', p.largo)}${campo('aW', 'Ancho estiba (mm)', p.ancho)}${campo('aB', 'Alto estiba (mm)', p.altoBase)}
        ${campo('aT', 'Peso estiba vacía (kg)', p.tara)}${campo('aC', 'Carga máxima (kg)', p.cargaMax)}${campo('aH', 'Altura máxima total (mm)', p.alturaMaxTotal)}
        ${campo('aV', 'Voladizo permitido (mm)', p.voladizoMax)}${campo('aS', 'Apoyo mínimo de cada caja (%)', Math.round(r.soporteMinimo * 100))}
      </div>
      <button class="boton" id="guardarAjustes">Guardar</button>
    </section>
    <section class="tarjeta">
      <h2>Datos del equipo</h2>
      <p class="nota">Borra las ubicaciones y pedidos cargados en este equipo (la hoja de Google no se toca).</p>
      <button class="boton peligro" id="borrar">Borrar datos cargados</button>
    </section>`;
  },
};

// ---------- Resultados ----------
function tablaComparacion(actual, propuesta) {
  const filas = [
    ['Estibas', 'estibas', false], ['Cajas', 'cajas', null], ['Cajas mal puestas (pesado sobre liviano)', 'inversiones', false],
    ['Cajas con sobrepeso encima', 'sobrecarga', false], ['Cajas sobre un delicado', 'sobreDelicado', false],
    ['Estibas con centro de gravedad corrido', 'cgFuera', false], ['Altura máxima (mm)', 'alturaMax', null],
  ];
  return `<div class="tabla"><table><tr><th>Indicador</th><th class="num">Ubicación actual</th>${propuesta ? '<th class="num">Propuesta</th>' : ''}</tr>
    ${filas.map(([t, k, mayorEsMejor]) => {
      const a = actual[k], b = propuesta ? propuesta[k] : null;
      let cls = '';
      if (propuesta && mayorEsMejor !== null && a !== b) cls = (mayorEsMejor ? b > a : b < a) ? 'mejor' : 'peor';
      return `<tr><td>${t}</td><td class="num">${fmt(a)}</td>${propuesta ? `<td class="num ${cls}">${fmt(b)}</td>` : ''}</tr>`;
    }).join('')}</table></div>`;
}

async function mostrarEstiba(cont, estiba, titulo = '') {
  const niveles = nivelesDe(estiba);
  const puedeVideo = !!formatoVideo();
  cont.innerHTML = `
    <p class="nota">Estiba ${estiba.numero}: ${estiba.totalCajas} cajas · ${fmt(estiba.pesoTotal, 1)} kg · ${fmt(estiba.alturaTotal)} mm · ocupación ${fmt(estiba.usoVolumen * 100)} %${estiba.cgFuera ? ' · <b class="peor">centro de gravedad corrido</b>' : ''}</p>
    <div class="visor" id="visor3d"></div>
    <label>Armar hasta la caja <span id="nCaja">${estiba.totalCajas}</span><input type="range" id="rango" min="1" max="${estiba.totalCajas}" value="${estiba.totalCajas}"></label>
    ${puedeVideo ? '<button class="boton" id="grabarVideo">🎬 Video del armado</button>' : '<p class="nota">Este equipo no permite grabar video.</p>'}
    <div id="video"></div>
    <h3>Capas vistas desde arriba (número = orden de armado)</h3>
    <div class="capas">${niveles.map((n, i) => `<div><small>Capa ${i + 1} (desde ${n.desde} mm)</small><canvas class="capa" data-i="${i}"></canvas></div>`).join('')}</div>
    <div class="leyenda" id="leyenda"></div>`;
  await dibujar3D($('#visor3d', cont), estiba, estado.palet, estado.colores);
  cont.querySelectorAll('canvas.capa').forEach((c) => dibujarCapa(c, estiba, estado.palet, niveles[Number(c.dataset.i)], estado.colores));
  const vistos = new Map();
  estiba.cajas.forEach((c) => { if (!vistos.has(c.codigo)) vistos.set(c.codigo, c.nombre); });
  $('#leyenda', cont).innerHTML = [...vistos].map(([cod, nom]) => `<span><i style="background:${colorDe(cod, estado.colores)}"></i>${esc(nom)}</span>`).join('') + '<span><i style="background:#d62828"></i>Con sobrepeso</span>';
  $('#grabarVideo', cont)?.addEventListener('click', async (e) => {
    const boton = e.currentTarget, zona = $('#video', cont);
    boton.disabled = true;
    zona.innerHTML = '<p class="nota">Grabando… <b id="pctVideo">0 %</b> (no cambies de pantalla)</p>';
    try {
      const nombre = titulo || `Estiba ${estiba.numero}`;
      const v = await grabarVideo(estiba, estado.palet, estado.colores, { titulo: nombre, alAvanzar: (f) => { const x = $('#pctVideo', zona); if (x) x.textContent = `${Math.round(f * 100)} %`; } });
      const archivo = `${nombreArchivo(`palet-${nombre}`.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').toLowerCase(), v.extension)}`;
      const url = URL.createObjectURL(v.blob);
      zona.innerHTML = `<video src="${url}" controls playsinline loop class="video-palet"></video>
        <button class="boton" id="guardarVideo">Guardar o enviar video</button><p class="nota">${v.segundos} s · ${(v.blob.size / 1e6).toFixed(1)} MB · ${v.extension.toUpperCase()}</p>`;
      $('#guardarVideo', zona).addEventListener('click', () => descargar(archivo, v.blob));
    } catch (err) {
      zona.innerHTML = `<div class="aviso error">${esc(err.message || String(err))}</div>`;
    } finally { boton.disabled = false; }
    await dibujar3D($('#visor3d', cont), estiba, estado.palet, estado.colores);
  });
  $('#rango', cont).addEventListener('change', async (e) => {
    $('#nCaja', cont).textContent = e.target.value;
    await dibujar3D($('#visor3d', cont), estiba, estado.palet, estado.colores, Number(e.target.value));
  });
}

function simular(pedido) {
  const lineas = estado.pedidos.filter((l) => String(l.PEDIDO).trim() === pedido);
  const actual = simularPedido(lineas, mapaActual(), estado.palet, estado.reglas);
  const mp = mapaPropuesto();
  const propuesta = mp ? simularPedido(lineas, mp, estado.palet, estado.reglas) : null;
  return { actual, propuesta };
}

async function mostrarPedido(pedido) {
  const cont = $('#resultadoPedido');
  if (!pedido) { cont.innerHTML = ''; return; }
  const { actual, propuesta } = simular(pedido);
  const esc2 = propuesta || actual;
  const estibas = esc2.grupos.flatMap((g) => g.estibas.map((e) => ({ ...e, zona: g.zona })));
  cont.innerHTML = `
    ${actual.faltantes.length ? `<div class="aviso">Artículos del pedido sin datos completos en UBICACIONES (no se armaron): ${actual.faltantes.map(esc).join(', ')}</div>` : ''}
    ${tablaComparacion(actual.resumen, propuesta?.resumen)}
    <div class="fila">
      <label>Ver<select id="verEsc"><option value="actual">Ubicación actual</option>${propuesta ? '<option value="propuesta" selected>Propuesta</option>' : ''}</select></label>
      <label>Estiba<select id="verEst">${estibas.map((e, i) => `<option value="${i}">${esc(e.zona)} · estiba ${e.numero} · ${e.totalCajas} cajas</option>`).join('')}</select></label>
    </div>
    <div id="vistaEstiba"></div>`;
  const pintar = async () => {
    const r = $('#verEsc').value === 'propuesta' && propuesta ? propuesta : actual;
    const lista = r.grupos.flatMap((g) => g.estibas.map((e) => ({ ...e, zona: g.zona })));
    const sel = $('#verEst');
    const idx = Math.min(Number(sel.value) || 0, lista.length - 1);
    sel.innerHTML = lista.map((e, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(e.zona)} · estiba ${e.numero} · ${e.totalCajas} cajas</option>`).join('');
    if (lista[idx]) await mostrarEstiba($('#vistaEstiba'), lista[idx], `Pedido ${pedido} · ${lista[idx].zona} · estiba ${lista[idx].numero}`);
    else $('#vistaEstiba').innerHTML = '';
  };
  $('#verEsc').addEventListener('change', pintar);
  $('#verEst').addEventListener('change', pintar);
  await pintar();
}

function simularTodos() {
  const pedidos = [...new Set(estado.pedidos.map((l) => String(l.PEDIDO ?? '').trim()).filter(Boolean))];
  const suma = (lista) => lista.reduce((t, r) => { for (const k of Object.keys(r)) t[k] = k === 'alturaMax' ? Math.max(t[k] || 0, r[k]) : (t[k] || 0) + r[k]; return t; }, {});
  const filas = [];
  const ra = [], rp = [];
  for (const p of pedidos) {
    const { actual, propuesta } = simular(p);
    ra.push(actual.resumen); if (propuesta) rp.push(propuesta.resumen);
    filas.push({ PEDIDO: p, CAJAS: actual.resumen.cajas, ESTIBAS_ACTUAL: actual.resumen.estibas, MAL_PUESTAS_ACTUAL: actual.resumen.inversiones, SOBREPESO_ACTUAL: actual.resumen.sobrecarga,
      ESTIBAS_PROPUESTA: propuesta?.resumen.estibas ?? '', MAL_PUESTAS_PROPUESTA: propuesta?.resumen.inversiones ?? '', SOBREPESO_PROPUESTA: propuesta?.resumen.sobrecarga ?? '' });
  }
  estado.pruebaPedidos = filas;
  $('#resultadoPedido').innerHTML = `<h3>${pedidos.length} pedidos</h3>${tablaComparacion(suma(ra), rp.length ? suma(rp) : null)}<button class="boton" id="excelPrueba">Descargar resultado (Excel)</button><button class="boton sec" id="exportarPrueba">CSV</button><button class="boton sec" id="copiarPrueba">Copiar resultado</button>`;
  $('#excelPrueba').addEventListener('click', () => exportarExcel('prueba-pedidos', ['PRUEBA_PEDIDOS', 'PEDIDOS']));
  const csv = () => aCSV(filas, Object.keys(filas[0] || {}).map((k) => [k, k]));
  $('#exportarPrueba').addEventListener('click', () => descargar('prueba-pedidos.csv', csv()));
  $('#copiarPrueba').addEventListener('click', () => copiar(csv()));
}


// ---------- Formulario de una posición ----------
function tarjetaEnlace(t) {
  return `<div class="aviso ok"><b>Enlace listo para ${esc(t.asignado_a)}</b> (pasillos ${esc(t.pasillos.join(', '))}). Sirve una sola vez y vence el ${esc(new Date(t.expira_en).toLocaleDateString('es-CO'))}.<br>
    <a class="boton" href="${mensajeWhatsApp(t)}" target="_blank" rel="noopener">Enviar por WhatsApp</a><button class="boton sec" id="copiarEnlace" data-enlace="${esc(enlaceTarea(t.token))}">Copiar enlace</button></div>`;
}

async function cargarAdmin() {
  try {
    const sesion = await sesionVigente();
    if (!sesion) { estado.conSesion = false; cerrarSesion(); mostrar('tareas'); return; }
    const [u, t] = await Promise.all([llamar('usuarios', {}, sesion), llamar('tareas', {}, sesion)]);
    estado.usuarios = u; estado.tareas = t.tareas;
    if (pestanaActual === 'tareas') mostrar('tareas');
  } catch (e) { notificar(e.message, 'error'); }
}

function resumenDatos(d = {}) {
  if (d.ESTADO === 'VACIA') return 'vacía';
  return [d.ARTICULO, d.CODIGO_ARTICULO, d.LARGO_A_MM && `${d.LARGO_A_MM}×${d.ANCHO_B_MM}×${d.ALTO_H_MM} mm`, d.PESO_KG && `${d.PESO_KG} kg`, d.EMPAQUE, d.LIQUIDO === 'SI' && 'líquido', d.DELICADO === 'SI' && 'delicado'].filter(Boolean).join(' · ') || 'sin datos';
}

function abrirFormulario(codigo) {
  const f = estado.filas.find((x) => x.CODIGO === codigo);
  if (!f) return;
  const cat = catalogo(estado.filas);
  const v = (k) => esc(f[k] ?? '');
  let unidad = leer('unidad', 'mm');
  const med = (k) => esc(desdeMilimetros(f[k], unidad));
  const opc = (k, valores) => valores.map((x) => `<button type="button" class="opcion ${String(f[k] ?? '').toUpperCase() === x ? 'sel' : ''}" data-campo="${k}" data-valor="${x}">${x === 'SI' ? 'SÍ' : x === 'NO APLICA' ? 'No aplica' : x}</button>`).join('');
  const esNA = (k) => String(f[k] ?? '').trim().toUpperCase() === 'NO APLICA';
  const na = (k) => `<button type="button" class="na${esNA(k) ? ' sel' : ''}" data-na="${k}">No aplica</button>`;
  const fondo = document.createElement('div');
  fondo.className = 'dialogo';
  fondo.innerHTML = `<form class="caja formulario" id="formPos">
    <h2>${esc(f.CODIGO)} <small>${esc(f.SECCION)} · ruta ${esc(f.SECUENCIA_RUTA)}</small></h2>
    ${f._por && f._por !== miNombre() && ['COMPLETA', 'INCOMPLETA', 'VACIA'].includes(estadoDe(f)) ? `<div class="aviso">⚠ Esta posición ya fue parametrizada por <b>${esc(f._por)}</b>${f._en ? ` el ${esc(new Date(f._en).toLocaleString('es-CO'))}` : ''}. Puedes editarla: tu cambio reemplaza el anterior y queda en el historial.</div>` : ''}
    <datalist id="listaArt">${[...cat.values()].map((a) => `<option value="${esc(a.CODIGO_ARTICULO)}">${esc(a.ARTICULO)}</option>`).join('')}</datalist>
    <label>Código del artículo ${na('CODIGO_ARTICULO')}<input name="CODIGO_ARTICULO" list="listaArt" inputmode="numeric" value="${esNA('CODIGO_ARTICULO') ? '' : v('CODIGO_ARTICULO')}" autocomplete="off"${esNA('CODIGO_ARTICULO') ? ' disabled' : ''}></label>
    <label>Artículo<input name="ARTICULO" value="${v('ARTICULO')}" autocomplete="off"></label>
    <div class="grupo"><span>Medidas en</span>${['mm', 'cm', 'm'].map((x) => `<button type="button" class="opcion unidad ${x === unidad ? 'sel' : ''}" data-unidad="${x}">${x}</button>`).join('')}</div>
    <div class="fila">
      <label>Largo A (<span class="u">${unidad}</span>) ${na('LARGO_A_MM')}<input name="LARGO_A_MM" type="number" inputmode="decimal" step="any" data-medida value="${med('LARGO_A_MM')}"${esNA('LARGO_A_MM') ? ' disabled' : ''}></label>
      <label>Ancho B (<span class="u">${unidad}</span>) ${na('ANCHO_B_MM')}<input name="ANCHO_B_MM" type="number" inputmode="decimal" step="any" data-medida value="${med('ANCHO_B_MM')}"${esNA('ANCHO_B_MM') ? ' disabled' : ''}></label>
      <label>Alto H (<span class="u">${unidad}</span>) ${na('ALTO_H_MM')}<input name="ALTO_H_MM" type="number" inputmode="decimal" step="any" data-medida value="${med('ALTO_H_MM')}"${esNA('ALTO_H_MM') ? ' disabled' : ''}></label>
      <label>Peso (kg) ${na('PESO_KG')}<input name="PESO_KG" type="number" inputmode="decimal" step="0.1" value="${esNA('PESO_KG') ? '' : v('PESO_KG')}"${esNA('PESO_KG') ? ' disabled' : ''}></label>
    </div>
    <div class="grupo"><span>Empaque</span>${opc('EMPAQUE', ['CAJA', 'BULTO', 'NO APLICA'])}</div>
    <div class="grupo"><span>Líquido</span>${opc('LIQUIDO', ['NO', 'SI', 'NO APLICA'])}</div>
    <div class="grupo"><span>Delicado</span>${opc('DELICADO', ['NO', 'SI', 'NO APLICA'])}</div>
    <p class="nota">"No aplica": el dato no corresponde a este artículo. La posición queda completa; si no aplican las medidas o el peso, no entra al cálculo del palet.</p>
    <details><summary>Más datos (opcional)</summary>
      <div class="fila">
        <label>Cajas que aguanta encima<input name="MAX_CAJAS_ENCIMA" type="number" inputmode="numeric" value="${v('MAX_CAJAS_ENCIMA')}"></label>
        <label>Nivel<input name="NIVEL" value="${v('NIVEL')}"></label>
        <label>Hueco ancho (<span class="u">${unidad}</span>)<input name="HUECO_ANCHO_MM" type="number" inputmode="decimal" step="any" data-medida value="${med('HUECO_ANCHO_MM')}"></label>
        <label>Hueco fondo (<span class="u">${unidad}</span>)<input name="HUECO_FONDO_MM" type="number" inputmode="decimal" step="any" data-medida value="${med('HUECO_FONDO_MM')}"></label>
        <label>Hueco alto (<span class="u">${unidad}</span>)<input name="HUECO_ALTO_MM" type="number" inputmode="decimal" step="any" data-medida value="${med('HUECO_ALTO_MM')}"></label>
        <label>Peso máx. del nivel (kg)<input name="PESO_MAX_KG" type="number" inputmode="decimal" value="${v('PESO_MAX_KG')}"></label>
      </div>
      <div class="grupo"><span>Bloqueada (no se mueve)</span>${opc('BLOQUEADA', ['NO', 'SI'])}</div>
      <label>Observaciones<input name="OBSERVACIONES" value="${v('OBSERVACIONES')}"></label>
    </details>
    ${f.SUBPOSICION ? '' : (() => {
      const libres = posicionesDisponibles(estado.filas, f.PASILLO, f.MODULO);
      return libres.length ? `<details class="mas"><summary>Agregar posiciones al módulo ${esc(f.PASILLO)}-${esc(f.MODULO)}</summary>
        <p class="nota">Toca las que tiene este módulo y luego "Agregar". Quedan en la ruta en este orden: x1, x2, x3, y1, y2, y3, z1, z2, z3.</p>
        <div class="grupo">${libres.map((p) => `<button type="button" class="opcion nuevaPos" data-pos="${p}">${p}</button>`).join('')}</div>
        <button class="boton sec" type="button" id="agregarPos">Agregar</button> <button class="boton sec" type="button" id="agregarTodas">Agregar todas</button>
      </details>` : '';
    })()}
    <div id="avisosPos"></div>
    <div class="acciones">
      <button class="boton" type="submit" id="guardarPos">Guardar y siguiente</button>
      <button class="boton sec" type="button" id="vaciaPos">Marcar vacía</button>
      ${esAgregada(f) ? `<button class="boton peligro" type="button" id="borrarPos">Borrar ${esc(f.SUBPOSICION ? f.CODIGO.slice(0, -1) : f.CODIGO)}</button>` : ''}
      <button class="boton sec" type="button" id="cerrarPos">Cerrar</button>
    </div>
  </form>`;
  document.body.appendChild(fondo);
  const form = fondo.querySelector('form');
  const elegidos = {};
  ['EMPAQUE', 'LIQUIDO', 'DELICADO', 'BLOQUEADA'].forEach((k) => { elegidos[k] = String(f[k] ?? '').toUpperCase() || (k === 'BLOQUEADA' ? 'NO' : ''); });
  // Cambiar la unidad convierte lo que ya está escrito
  form.querySelectorAll('[data-unidad]').forEach((b) => b.addEventListener('click', () => {
    const nueva = b.dataset.unidad;
    form.querySelectorAll('[data-medida]').forEach((i) => {
      if (i.value !== '') i.value = desdeMilimetros(aMilimetros(i.value, unidad), nueva) || i.value;
    });
    unidad = nueva; guardar('unidad', unidad);
    form.querySelectorAll('.u').forEach((u) => { u.textContent = unidad; });
    form.querySelectorAll('[data-unidad]').forEach((x) => x.classList.toggle('sel', x === b));
  }));
  form.querySelectorAll('.opcion[data-campo]').forEach((b) => b.addEventListener('click', () => {
    elegidos[b.dataset.campo] = b.dataset.valor;
    form.querySelectorAll(`.opcion[data-campo="${b.dataset.campo}"]`).forEach((x) => x.classList.toggle('sel', x === b));
  }));
  // "No aplica" en un campo: se apaga la casilla y se guarda NO APLICA
  form.querySelectorAll('[data-na]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    const input = form[b.dataset.na];
    const activo = !b.classList.contains('sel');
    b.classList.toggle('sel', activo);
    input.disabled = activo;
    if (activo) input.value = '';
    else input.focus();
  }));
  // Autocompletar si el código ya se tomó en otra posición
  form.CODIGO_ARTICULO.addEventListener('change', () => {
    const a = cat.get(form.CODIGO_ARTICULO.value.trim());
    if (!a) return;
    for (const [k, val] of Object.entries(a)) {
      const naBtn = form.querySelector(`[data-na="${k}"]`);
      if (naBtn) { const esNa = String(val).toUpperCase() === 'NO APLICA'; naBtn.classList.toggle('sel', esNa); form[k].disabled = esNa; if (esNa) { form[k].value = ''; continue; } }
      if (form[k] && form[k].tagName === 'INPUT') form[k].value = form[k].dataset.medida !== undefined ? (desdeMilimetros(val, unidad) || val) : val;
      if (k in elegidos && val) {
        elegidos[k] = String(val).toUpperCase();
        form.querySelectorAll(`.opcion[data-campo="${k}"]`).forEach((x) => x.classList.toggle('sel', x.dataset.valor === elegidos[k]));
      }
    }
    notificar('Datos del artículo copiados de otra posición');
  });
  const cerrar = () => fondo.remove();
  let avisado = false;
  const siguiente = () => {
    const lista = estado.filas.filter((x) => x.PASILLO === f.PASILLO && x.ESTADO !== 'DIVIDIDA');
    const i = lista.findIndex((x) => x.CODIGO === f.CODIGO);
    return lista.slice(i + 1).find((x) => ['SIN REVISAR', 'INCOMPLETA'].includes(estadoDe(x)));
  };
  const terminar = () => {
    guardarFilas(); recalcular(); cerrar(); mostrar('tomar'); programarEnvio();
    const sig = siguiente();
    if (sig) abrirFormulario(sig.CODIGO); else notificar('Pasillo terminado');
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = Object.fromEntries([...new FormData(form).entries()].map(([k, val]) => [k, String(val).trim()]));
    Object.assign(datos, elegidos);
    // Se guarda siempre en milímetros
    form.querySelectorAll('[data-medida]').forEach((i) => {
      datos[i.name] = aMilimetros(i.value, unidad);
    });
    form.querySelectorAll('[data-na].sel').forEach((b) => { datos[b.dataset.na] = 'NO APLICA'; });
    const avisos = revisarDatos(datos);
    if (avisos.length && !avisado) {
      avisado = true;
      $('#avisosPos', fondo).innerHTML = `<div class="aviso">${avisos.map(esc).join('<br>')}<br><b>Corrige o toca Guardar otra vez.</b></div>`;
      return;
    }
    if (Number(datos.ANCHO_B_MM) > Number(datos.LARGO_A_MM) && Number(datos.LARGO_A_MM) > 0) [datos.LARGO_A_MM, datos.ANCHO_B_MM] = [datos.ANCHO_B_MM, datos.LARGO_A_MM];
    Object.assign(f, datos, { ACTUALIZADO: new Date().toISOString(), _pendiente: true });
    f.ESTADO = estadoDe({ ...f, ESTADO: '' });
    terminar();
  });
  $('#vaciaPos', fondo).addEventListener('click', () => {
    for (const k of ['ARTICULO', 'CODIGO_ARTICULO', 'LARGO_A_MM', 'ANCHO_B_MM', 'ALTO_H_MM', 'PESO_KG', 'EMPAQUE', 'LIQUIDO', 'DELICADO', 'MAX_CAJAS_ENCIMA']) delete f[k];
    f.ESTADO = 'VACIA'; f.ACTUALIZADO = new Date().toISOString(); f._pendiente = true;
    terminar();
  });
  // Borrar una posición agregada (x1 y x2 son fijas)
  $('#borrarPos', fondo)?.addEventListener('click', async () => {
    const codigo = f.SUBPOSICION ? f.CODIGO.slice(0, -1) : f.CODIGO;
    const grupo = estado.filas.filter((x) => [codigo, `${codigo}A`, `${codigo}B`].includes(x.CODIGO));
    const llenas = grupo.filter((x) => ['COMPLETA', 'INCOMPLETA'].includes(estadoDe(x)));
    if (llenas.length && !(await confirmar(`${codigo} tiene datos (${llenas.map((x) => x.ARTICULO || x.CODIGO_ARTICULO).join(', ')}). ¿Borrarla de todas formas?`))) return;
    const r = borrarPosicion(estado.filas, codigo);
    estado.filas = r.filas;
    // Si ya estaba en la nube se avisa a los demás; si nunca se envió, basta con quitarla de aquí
    for (const x of r.borradas) if (x._version) estado.borradas[x.CODIGO] = { version: x._version, pendiente: true };
    guardarFilas(); recalcular(); programarEnvio();
    notificar(`Borrada: ${codigo}`, 'ok');
    cerrar(); mostrar('tomar');
  });
  // Posiciones nuevas en el módulo (x3, y1…z3): se comparten con todos por la nube
  form.querySelectorAll('.nuevaPos').forEach((b) => b.addEventListener('click', () => b.classList.toggle('sel')));
  const agregar = (lista) => {
    if (!lista.length) { notificar('Toca primero las posiciones que tiene el módulo.', 'error'); return; }
    const r = agregarPosiciones(estado.filas, f.PASILLO, f.MODULO, lista);
    estado.filas = r.filas;
    estado.filas.filter((x) => r.nuevas.includes(x.CODIGO)).forEach((x) => { x._pendiente = true; });
    revivir();
    guardarFilas(); recalcular(); programarEnvio();
    notificar(`Agregadas: ${r.nuevas.join(', ')}`, 'ok');
    cerrar(); mostrar('tomar');
  };
  $('#agregarPos', fondo)?.addEventListener('click', () => agregar([...form.querySelectorAll('.nuevaPos.sel')].map((b) => b.dataset.pos)));
  $('#agregarTodas', fondo)?.addEventListener('click', () => agregar([...form.querySelectorAll('.nuevaPos')].map((b) => b.dataset.pos)));
  $('#cerrarPos', fondo).addEventListener('click', cerrar);
}

function csvToma() {
  const tomadas = estado.filas.filter((f) => estadoDe(f) !== 'SIN REVISAR' || f.SUBPOSICION);
  return aCSV(tomadas.map((f) => ({ ...f, ESTADO: f.ESTADO === 'DIVIDIDA' ? 'DIVIDIDA' : estadoDe(f) })), COLUMNAS.map((c) => [c, c]));
}

function preguntar(texto) {
  if (!texto.trim()) return;
  estado.chat = [...(estado.chat || []), { de: 'yo', texto: [texto] }, { de: 'agente', texto: responder(texto, contexto()) }].slice(-20);
  mostrar('agente');
  const c = $('#chat'); if (c) c.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

// ---------- Navegación y eventos ----------
let pestanaActual = 'inicio';
function mostrar(tab) {
  pestanaActual = tab;
  document.querySelectorAll('#pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.tab === tab));
  $('#contenido').innerHTML = pantallas[tab]();
  conectar(tab);
  conectarBanner();
  window.scrollTo(0, 0);
}

function conectar(tab) {
  document.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); mostrar(a.dataset.ir); }));
  if (tab === 'inicio') {
    $('#excelTodo').addEventListener('click', () => exportarExcel());
    $('#archivo').addEventListener('change', async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      const salida = $('#resultadoImport');
      salida.innerHTML = '<p class="nota">Leyendo…</p>';
      try {
        const r = await leerArchivo(archivo);
        const partes = [];
        if (r.ubicaciones) {
          // Lo que cambió en el Excel se marca para subirlo a la nube (una sola información para todos)
          const antes = new Map(estado.filas.map((f) => [f.CODIGO, JSON.stringify(datosDe(f))]));
          estado.filas = mezclar(estado.filas, r.ubicaciones);
          revivir();
          let cambiadas = 0;
          for (const f of estado.filas) if (antes.get(f.CODIGO) !== JSON.stringify(datosDe(f))) { if (!estado.tarea) f._pendiente = true; cambiadas++; }
          guardarFilas();
          if (cambiadas && !estado.tarea) programarEnvio();
          partes.push(`${r.ubicaciones.length} ubicaciones (${cambiadas} con cambios)`);
        }
        if (r.pedidos) { estado.pedidos = r.pedidos; guardar('pedidos', r.pedidos); partes.push(`${r.pedidos.length} líneas de pedidos`); }
        recalcular();
        mostrar('inicio');
        $('#resultadoImport').innerHTML = (partes.length ? `<div class="aviso ok">Cargado: ${partes.join(' y ')}.</div>` : '') + r.avisos.map((a) => `<div class="aviso error">${esc(a)}</div>`).join('');
      } catch (err) {
        salida.innerHTML = `<div class="aviso error">No se pudo leer el archivo: ${esc(err.message)}</div>`;
      }
    });
  }
  if (tab === 'tareas') {
    $('#formLogin')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await iniciarSesion(fd.get('correo'), fd.get('clave')); estado.conSesion = true; mostrar('tareas'); cargarAdmin(); }
      catch (err) { $('#loginMsg').innerHTML = `<div class="aviso error">${esc(err.message)}</div>`; }
    });
    $('#formTarea')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const pasillos = fd.getAll('pas');
      if (!pasillos.length) { notificar('Elige al menos un pasillo', 'error'); return; }
      try {
        const r = await llamar('crear_tarea', { asignado_a: fd.get('asignado_a'), titulo: fd.get('titulo'), dias: Number(fd.get('dias')), pasillos }, await sesionVigente());
        estado.ultimaTarea = r.tarea; cargarAdmin(); mostrar('tareas');
      } catch (err) { notificar(err.message, 'error'); }
    });
    $('#copiarEnlace')?.addEventListener('click', (e) => copiar(e.target.dataset.enlace));
    document.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('¿Anular esta tarea? El enlace deja de funcionar.'))) return;
      try { await llamar('anular_tarea', { id: b.dataset.anular }, await sesionVigente()); cargarAdmin(); } catch (err) { notificar(err.message, 'error'); }
    }));
    $('#bajarTodo')?.addEventListener('click', async () => {
      try { const r = await llamar('posiciones', {}, await sesionVigente()); aplicarServidor(r.posiciones); notificar(`Recibidas ${r.posiciones.length} posiciones`); mostrar('tareas'); }
      catch (err) { notificar(err.message, 'error'); }
    });
    $('#subirMio')?.addEventListener('click', () => sincronizar());
    $('#salirSesion')?.addEventListener('click', () => { cerrarSesion(); estado.conSesion = false; mostrar('tareas'); });
    if (estado.conSesion && !estado.usuarios) cargarAdmin();
  }
  if (tab === 'tomar') {
    $('#tZona').addEventListener('change', (e) => { estado.tomaZona = e.target.value; estado.tomaPasillo = ''; mostrar('tomar'); });
    $('#tPasillo').addEventListener('change', (e) => { estado.tomaPasillo = e.target.value; mostrar('tomar'); });
    $('#tFiltro').addEventListener('change', (e) => { estado.tomaFiltro = e.target.value; mostrar('tomar'); });
    document.querySelectorAll('.pos').forEach((b) => b.addEventListener('click', () => {
      estado.tomaPasillo = estado.filas.find((x) => x.CODIGO === b.dataset.cod)?.PASILLO;
      abrirFormulario(b.dataset.cod);
    }));
    $('#copiarToma').addEventListener('click', () => copiar(csvToma()));
    document.querySelectorAll('[data-conf]').forEach((b) => b.addEventListener('click', () => {
      const c = estado.conflictos[Number(b.dataset.conf)];
      const f = estado.filas.find((x) => x.CODIGO === c.codigo);
      if (b.dataset.r === 'mia') { f._version = c.version; f._pendiente = true; }
      else {
        for (const k of Object.keys(f)) if (!['CODIGO', 'SECCION', 'PASILLO', 'MODULO', 'POSICION', 'SUBPOSICION', 'SECUENCIA_RUTA'].includes(k)) delete f[k];
        Object.assign(f, c.servidor, { _version: c.version, _por: c.por, _en: c.en });
      }
      estado.conflictos = estado.conflictos.filter((x) => x !== c);
      guardar('conflictos', estado.conflictos); guardarFilas(); recalcular(); mostrar('tomar');
      if (b.dataset.r === 'mia') programarEnvio();
    }));
    $('#descargarToma').addEventListener('click', () => descargar('ubicaciones-tomadas.csv', csvToma()));
    $('#excelToma').addEventListener('click', () => exportarExcel('ubicaciones', ['UBICACIONES', 'ARTICULOS']));
  }
  if (tab === 'agente') {
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => preguntar(b.dataset.q)));
    document.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', () => {
      const f = BIBLIOTECA[Number(b.dataset.ficha)];
      estado.chat = [...(estado.chat || []), { de: 'yo', texto: [f.titulo] }, { de: 'agente', texto: [`${f.titulo}:`, ...f.texto] }].slice(-20);
      mostrar('agente');
      $('#chat')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    }));
    $('#formChat').addEventListener('submit', (e) => { e.preventDefault(); preguntar($('#pregunta').value); });
    $('#diagExcel').addEventListener('click', () => exportarExcel('diagnostico', ['DIAGNOSTICO', 'ARTICULOS', 'REUBICACION']));
    $('#diagCopiar').addEventListener('click', () => copiar(textoDiagnostico(diagnostico(contexto()))));
  }
  if (tab === 'ubicaciones') {
    $('#fZona').addEventListener('change', (e) => { estado.filtroZona = e.target.value; estado.filtroPasillo = ''; mostrar('ubicaciones'); });
    $('#fPasillo').addEventListener('change', (e) => { estado.filtroPasillo = e.target.value; mostrar('ubicaciones'); });
  }
  if (tab === 'reubicacion') {
    $('#zReubicar').addEventListener('change', (e) => { estado.zonaReubicar = e.target.value; });
    $('#proponer').addEventListener('click', () => {
      const z = $('#zReubicar').value;
      const usables = estado.posiciones.filter((p) => !p.faltan.length && p.clase && (!z || p.fila.SECCION === z));
      estado.propuesta = proponerReubicacion(usables);
      estado.zonaReubicar = z;
      mostrar('reubicacion');
    });
    const plan = () => aCSV(estado.propuesta.movimientos.map((m, i) => ({ ...m, orden: i + 1 })), [['orden', 'ORDEN'], ['codigoArticulo', 'CODIGO_ARTICULO'], ['articulo', 'ARTICULO'], ['clase', 'CLASE'], ['desde', 'UBICACION_ACTUAL'], ['hacia', 'UBICACION_NUEVA'], ['pasillo', 'PASILLO']]);
    $('#exportarPlan')?.addEventListener('click', () => descargar('plan-reubicacion.csv', plan()));
    $('#excelPlan')?.addEventListener('click', () => exportarExcel('plan-reubicacion', ['REUBICACION', 'ARTICULOS']));
    $('#copiarPlan')?.addEventListener('click', () => copiar(plan()));
  }
  if (tab === 'pedidos') {
    $('#pedidoSel').addEventListener('change', (e) => { estado.pedidoSel = e.target.value; mostrarPedido(e.target.value); });
    $('#simularTodos').addEventListener('click', simularTodos);
    if (estado.pedidoSel) mostrarPedido(estado.pedidoSel);
  }
  if (tab === 'calculadora') {
    $('#cArt').addEventListener('change', (e) => {
      const p = estado.posiciones.find((x) => x.art.codigo === e.target.value);
      if (!p) return;
      $('#cA').value = p.art.largo; $('#cB').value = p.art.ancho; $('#cH').value = p.art.alto; $('#cP').value = p.art.peso;
      $('#cE').value = p.art.empaque; $('#cM').value = p.art.maxCajasEncima || '';
    });
    $('#calcular').addEventListener('click', async () => {
      const p = estado.posiciones.find((x) => x.art.codigo === $('#cArt').value);
      const empaque = $('#cE').value;
      const art = {
        codigo: p?.art.codigo || 'MANUAL', nombre: p?.art.nombre || 'Artículo', largo: Number($('#cA').value), ancho: Number($('#cB').value), alto: Number($('#cH').value),
        peso: Number($('#cP').value), empaque, liquido: !!p?.art.liquido, delicado: !!p?.art.delicado, esteLadoArriba: empaque !== 'BULTO' || !!p?.art.liquido,
        maxCajasEncima: Number($('#cM').value) || null,
      };
      const r = paletMono(art, estado.palet);
      const out = $('#resultadoCalc');
      if (r.datosFaltantes?.length) { out.innerHTML = `<div class="aviso error">Faltan datos: ${r.datosFaltantes.join(', ')}</div>`; return; }
      if (!r.colocaciones.length) { out.innerHTML = `<div class="aviso error">${esc((r.advertencias || []).join(' '))}</div>`; return; }
      const nombres = { altura: 'la altura máxima', peso: 'el peso máximo', compresion: 'lo que aguanta la caja', cantidad: 'la cantidad' };
      out.innerHTML = `<div class="cifras">
        <div class="cifra"><b>${r.cajasPorCapa} × ${r.capas}</b><span>cajas por capa × capas (TI × HI)</span></div>
        <div class="cifra"><b>${r.totalCajas}</b><span>cajas en el palet</span></div>
        <div class="cifra"><b>${fmt(r.alturaTotal)} mm</b><span>altura total</span></div>
        <div class="cifra"><b>${fmt(r.pesoTotal, 1)} kg</b><span>peso con estiba</span></div>
        <div class="cifra"><b>${fmt(r.usoArea * 100)} %</b><span>uso del área</span></div></div>
        <p class="nota">Lo que limita: ${nombres[r.limitante]}. ${esc(r.advertencias.join(' '))}</p><div id="vistaCalc"></div>`;
      await mostrarEstiba($('#vistaCalc'), { numero: 1, cajas: r.colocaciones.map((c) => ({ ...c, nombre: art.nombre })), totalCajas: r.totalCajas, pesoTotal: r.pesoTotal, alturaTotal: r.alturaTotal, usoVolumen: (r.totalCajas * art.largo * art.ancho * art.alto) / (estado.palet.largo * estado.palet.ancho * (estado.palet.alturaMaxTotal - estado.palet.altoBase)) }, `Palet de ${art.nombre || 'un artículo'}`);
    });
  }
  if (tab === 'ajustes') {
    $('#guardarAjustes').addEventListener('click', () => {
      const n = (id) => Number($(id).value);
      estado.palet = { largo: n('#aL'), ancho: n('#aW'), altoBase: n('#aB'), tara: n('#aT'), cargaMax: n('#aC'), alturaMaxTotal: n('#aH'), voladizoMax: n('#aV') };
      estado.reglas = { ...estado.reglas, soporteMinimo: Math.min(1, Math.max(0.3, n('#aS') / 100)) };
      estado.paletConfirmado = true;
      guardar('palet', estado.palet); guardar('reglas', estado.reglas); guardar('paletConfirmado', true);
      notificar('Guardado');
    });
    $('#borrar').addEventListener('click', async () => {
      if (!(await confirmar('¿Borrar todos los datos tomados y los pedidos de este equipo? Primero cópialos a la hoja si los necesitas.'))) return;
      borrarTodo();
      estado.filas = generarLayout(); estado.pedidos = []; estado.paletConfirmado = false; estado.palet = PALET_EJEMPLO;
      recalcular(); mostrar('inicio');
    });
  }
}

document.querySelectorAll('#pestanas button').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.tab)));
recalcular();
mostrar(pestanaActual);
alIniciar();
// Página web sin internet (no aplica dentro de la APK)
try {
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor && location.hostname.endsWith('github.io')) navigator.serviceWorker.register('sw.js');
} catch { /* sin soporte */ }
