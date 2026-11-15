// App del operador (versión en la nube): abre con el enlace contar.html?t=<token>, cuenta sus pasillos y verifica el de un compañero.
'use strict';

const $ = (s) => document.querySelector(s);
function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  hijos.flat().forEach((c) => c != null && el.append(c.nodeType ? c : String(c)));
  return el;
}

// Reemplaza el contenido de un elemento ignorando los vacíos (null/undefined)
const poner = (el, ...hijos) => el.replaceChildren(...hijos.flat().filter((x) => x != null && x !== false));
// Colores de ítems agregados por el administrador (los de siempre ya están en styles.css)
const COLORES_FIJOS = ['azul', 'blanca', 'verde', 'roja', 'canastilla'];
function estilosItems(cols = []) {
  let el = document.getElementById('estilos-items');
  if (!el) { el = document.createElement('style'); el.id = 'estilos-items'; document.head.append(el); }
  el.textContent = cols
    .filter((c) => !COLORES_FIJOS.includes(c.codigo) && /^[a-z0-9-]+$/.test(c.codigo) && /^#[0-9a-f]{6}$/i.test(c.hex))
    .map((c) => `.c-${c.codigo} { --c: ${c.hex}; }`).join('\n');
}

// ---------- Almacenamiento local seguro ----------
const almacen = {
  leer(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

// Identificador del celular: el enlace queda amarrado al primero que lo abre (lo maneja nube.js).
const idDispositivo = () => NUBE.dispositivo();

const TOKEN = decodeURIComponent((location.pathname.match(/\/c\/([^/]+)/) || [])[1] || new URLSearchParams(location.search).get('t') || '');
const DISPOSITIVO = idDispositivo();
const CLAVE_PEND = `pendientes-${TOKEN}`;
const CLAVE_INICIO = `iniciado-${TOKEN}`;
const CLAVE_CACHE = `estado-${TOKEN}`;      // última copia de las planillas (para abrir sin señal)
const CLAVE_TERM = `terminar-${TOKEN}`;     // pasillos terminados sin señal, por enviar

let temporizadorAviso;
function avisar(texto, tipo = '') {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = `aviso-flotante ver ${tipo}`;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (el.className = 'aviso-flotante'), 3500);
}

class ErrorRed extends Error {}
async function api(ruta, opciones = {}) {
  let r;
  try {
    r = await NUBE.pedir(`/api/contar/${encodeURIComponent(TOKEN)}${ruta}`, { method: opciones.method || 'GET', body: opciones.body });
  } catch {
    throw new ErrorRed('Sin conexión');
  }
  if (!r.ok) {
    const e = new Error(r.datos.error || `Error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.datos;
}

// ---------- Estado ----------
const estado = {
  datos: null, actual: null, sinRed: false, guardando: false,
  pendientes: almacen.leer(CLAVE_PEND, {}),
  porTerminar: almacen.leer(CLAVE_TERM, []),
};
const TIPO = {
  conteo: { texto: 'Conteo', chip: '', ayuda: 'Cuenta cada módulo y escribe la cantidad por color.' },
  verificacion: { texto: 'Verificación', chip: 'aviso', ayuda: 'Pasillo de un compañero. Cuenta tú mismo sin mirar su planilla.' },
  reconteo: { texto: 'Reconteo', chip: 'error', ayuda: 'El administrador pidió recontar solo estas casillas.' },
};

function mostrar(id) {
  ['#p-mensaje', '#p-bienvenida', '#p-lista', '#p-planilla'].forEach((s) => ($(s).hidden = s !== id));
  window.scrollTo(0, 0);
}

function mensaje(icono, titulo, texto) {
  $('#m-icono').textContent = icono;
  $('#m-titulo').textContent = titulo;
  $('#m-texto').textContent = texto;
  mostrar('#p-mensaje');
}

// ---------- Carga (con o sin señal) ----------
const estaTerminada = (a) => a.estado === 'terminada' || a.estado === 'terminada_local';

// Marca como terminados los pasillos que se cerraron sin señal y aún no llegan al servidor
function aplicarCambiosLocales(datos) {
  (datos.asignaciones || []).forEach((a) => {
    if (a.estado !== 'terminada' && estado.porTerminar.includes(a.id)) a.estado = 'terminada_local';
  });
  return datos;
}

function guardarCopia() {
  if (estado.datos && !estado.datos.terminado) almacen.guardar(CLAVE_CACHE, estado.datos);
}

async function cargar({ silencioso = false } = {}) {
  if (!TOKEN) return mensaje('🔗', 'Enlace incompleto', 'Abre el enlace completo que te envió el administrador.');
  try {
    await sincronizar();
    const datos = await api('');
    estado.sinRed = false;
    estado.datos = aplicarCambiosLocales(datos);
    guardarCopia();
    marcarGuardado(hayPorEnviar() ? 'pendiente' : 'ok');
    mostrarDatos({ silencioso });
  } catch (e) {
    if (e instanceof ErrorRed) {
      estado.sinRed = true;
      marcarGuardado('red');
      if (estado.datos) { if (!silencioso) mostrarDatos(); return; } // se sigue trabajando con lo que hay
      const copia = almacen.leer(CLAVE_CACHE, null);
      if (copia) {
        estado.datos = aplicarCambiosLocales(copia);
        avisar('Sin conexión: trabajando con lo guardado en el celular');
        return mostrarDatos({ silencioso });
      }
      return mensaje('📶', 'Sin conexión', 'La primera vez el enlace se debe abrir con Wi-Fi o datos. Después funciona sin conexión. Reintentando…');
    }
    salirPantallaCompleta();
    const iconos = { 410: '✅', 423: '📵', 404: '🔗' };
    const perdidos = hayPorEnviar() ? ' Había conteos sin enviar: avisa al administrador.' : '';
    mensaje(iconos[e.status] || '⚠️', e.status === 410 ? 'Enlace usado' : 'No se puede abrir', e.message + perdidos);
    detenerSondeo();
  }
}

function mostrarDatos({ silencioso = false } = {}) {
  const datos = estado.datos;
  if (datos.terminado) return terminar(datos);
  $('#titulo').textContent = datos.inventario.nombre;
  $('#subtitulo').textContent = datos.participante.nombre;
  if (!almacen.leer(CLAVE_INICIO, false)) return pintarBienvenida();
  if (datos.inventario.estado !== 'en_curso') {
    return mensaje('⏳', 'El inventario aún no comienza', estado.sinRed
      ? 'No hay conexión. Cuando el administrador inicie el inventario y tengas señal, esta pantalla se actualiza sola.'
      : 'Cuando el administrador lo inicie, esta pantalla se actualiza sola.');
  }
  if (estado.actual) {
    const a = datos.asignaciones.find((x) => x.id === estado.actual.id);
    if (a && !estaTerminada(a)) { if (!silencioso) pintarPlanilla(a); return; }
  }
  pintarLista();
}

const hayPorEnviar = () => estado.porTerminar.length > 0 || Object.values(estado.pendientes).some((p) => Object.keys(p).length);

// Envía todo lo que quedó guardado en el celular: casillas y pasillos terminados sin señal
async function sincronizar() {
  await enviarPendientes();
  if (Object.values(estado.pendientes).some((p) => Object.keys(p).length)) throw new ErrorRed('Sin conexión');
  for (const aid of [...estado.porTerminar]) {
    try {
      await api(`/asignaciones/${aid}/terminar`, { method: 'POST' });
    } catch (e) {
      if (e instanceof ErrorRed) throw e;
      if (e.status !== 409 && e.status !== 404) throw e; // 409/404: ya estaba terminado o lo quitaron
    }
    estado.porTerminar = estado.porTerminar.filter((x) => x !== aid);
    almacen.guardar(CLAVE_TERM, estado.porTerminar);
  }
}

function terminar(datos) {
  almacen.guardar(CLAVE_PEND, {});
  almacen.guardar(CLAVE_TERM, []);
  try { localStorage.removeItem(CLAVE_CACHE); } catch { /* nada */ }
  salirPantallaCompleta();
  detenerSondeo();
  $('#alerta-salida').hidden = true;
  $('#titulo').textContent = datos.inventario.nombre;
  $('#subtitulo').textContent = datos.participante.nombre;
  mensaje('🎉', `¡Gracias, ${datos.participante.nombre}!`, 'Terminaste tu parte del inventario. Ya puedes desfijar la pantalla y salir de la app. Este enlace queda cerrado.');
  $('#estado-guardado').textContent = 'Terminado';
  $('#estado-guardado').className = 'chip ok';
}

function pintarBienvenida() {
  const d = estado.datos;
  $('#b-hola').textContent = `Hola, ${d.participante.nombre}`;
  poner($('#b-pasillos'), ...d.asignaciones.map((a) => h('span', { class: `chip ${TIPO[a.tipo].chip}` }, `${a.pasillo.nombre}${a.tipo !== 'conteo' ? ' · ' + TIPO[a.tipo].texto : ''}`)));
  mostrar('#p-bienvenida');
  indicarListoSinConexion();
}

async function comenzar() {
  await entrarPantallaCompleta();
  almacen.guardar(CLAVE_INICIO, true);
  activarVigilancia();
  cargar();
}

// Avance calculado en el celular (sirve sin señal)
function avanceLocal(a) {
  const cols = a.colores || estado.datos.colores || [];
  const total = a.celdas ? a.celdas.length : a.modulos.length * cols.length;
  if (!total) return 0;
  const llenas = new Set(a.conteos.map((c) => `${c.modulo}|${c.color}`));
  Object.entries(estado.pendientes[a.id] || {}).filter(([k]) => k !== OBS).forEach(([k, v]) => (v ? llenas.add(k) : llenas.delete(k)));
  return Math.round((llenas.size / total) * 100);
}

function pintarLista() {
  const d = estado.datos;
  estado.actual = null;
  poner($('#lista-asignaciones'), 
    ...d.asignaciones.map((a) => {
      const terminada = estaTerminada(a);
      const local = a.estado === 'terminada_local';
      return h('div', { class: `tarjeta asig ${terminada ? 'terminada' : ''}`, role: 'button', tabindex: terminada ? null : '0',
        onclick: () => !terminada && pintarPlanilla(a), onkeydown: (e) => e.key === 'Enter' && !terminada && pintarPlanilla(a) },
        h('div', {}, h('h3', {}, a.pasillo.nombre), h('small', { class: 'tenue' }, `${a.pasillo.seccion} · ${a.modulos.length} ${a.pasillo.seccion.startsWith('Canastillas') ? 'filas' : 'módulos'}`)),
        h('span', { class: `chip ${local ? 'aviso' : terminada ? 'ok' : TIPO[a.tipo].chip}` }, local ? 'Terminado · por enviar' : terminada ? 'Terminado ✓' : TIPO[a.tipo].texto),
        h('div', { class: 'barra-avance' }, h('div', { style: `width:${terminada ? 100 : avanceLocal(a)}%` })));
    })
  );
  const todasListas = d.asignaciones.length > 0 && d.asignaciones.every(estaTerminada);
  const faltaEnviar = d.asignaciones.some((a) => a.estado === 'terminada_local');
  $('#lista-espera').hidden = !(d.esperando || todasListas);
  $('#espera-titulo').textContent = faltaEnviar ? 'Terminaste tus pasillos sin conexión.' : 'Terminaste tus pasillos.';
  $('#espera-texto').textContent = faltaEnviar
    ? 'Tus conteos están guardados en el celular. Cuando tengas señal (datos o Wi-Fi) se envían solos y recibir la verificación del pasillo de un compañero.'
    : 'Esperando que un compañero termine para asignarte la verificación de su pasillo… Esto se actualiza solo.';
  mostrar('#p-lista');
  const siguiente = d.asignaciones.find((a) => !estaTerminada(a));
  if (siguiente && d.asignaciones.filter((a) => !estaTerminada(a)).length === 1 && siguiente.tipo !== 'conteo') {
    avisar(siguiente.tipo === 'verificacion' ? `Nueva tarea: verificar ${siguiente.pasillo.nombre}` : `Nuevo reconteo en ${siguiente.pasillo.nombre}`, 'ok');
  }
}

// ---------- Planilla ----------
function valorCasilla(texto) {
  const t = String(texto || '').trim();
  if (t === '') return { ok: true, valor: null };
  if (!/^\d{1,4}(\s*\+\s*\d{1,4}){0,20}$/.test(t)) return { ok: false };
  return { ok: true, valor: t.split('+').reduce((a, n) => a + Number(n), 0) };
}

function pintarPlanilla(a) {
  estado.actual = a;
  const cols = a.colores || estado.datos.colores;
  estilosItems(cols);
  const pendA = estado.pendientes[a.id] || {};
  const guardados = new Map(a.conteos.map((c) => [`${c.modulo}|${c.color}`, c.expresion || String(c.valor)]));
  const celdas = a.celdas ? new Set(a.celdas) : null;

  $('#pl-titulo').textContent = a.pasillo.nombre;
  $('#pl-tipo').textContent = TIPO[a.tipo].texto;
  $('#pl-tipo').className = `chip ${TIPO[a.tipo].chip}`;
  const esZona = a.pasillo.seccion.startsWith('Canastillas');
  $('#pl-ayuda').textContent = a.tipo === 'conteo' && esZona ? 'Cuenta cada fila: canastillas y pallets rojos. Puedes sumar arrumes, ej. 40+40+20.' : TIPO[a.tipo].ayuda;
  document.documentElement.style.setProperty('--ncol', cols.length);

  poner($('#pl-encabezado'), 
    h('span', {}, a.pasillo.seccion.startsWith('Canastillas') ? 'Fila' : 'Módulo'),
    ...cols.map((c) => h('span', { class: `c-${c.codigo}` }, h('i', { class: 'punto' }), c.nombre.replace('Pallet ', '')))
  );
  poner($('#pl-filas'), 
    ...a.modulos.map((m) =>
      h('div', { class: 'pl-fila', role: 'row' },
        h('span', { class: 'pl-modulo', role: 'rowheader' }, m),
        ...cols.map((c) => {
          const k = `${m}|${c.codigo}`;
          const habilitada = !celdas || celdas.has(k);
          const valor = pendA[k] ?? guardados.get(k) ?? '';
          const input = h('input', {
            type: 'text', inputmode: 'tel', autocomplete: 'off', placeholder: habilitada ? '' : '—', value: habilitada ? valor : '',
            disabled: !habilitada, 'aria-label': `Módulo ${m} ${c.nombre}`, dataset: { k },
            oninput: (e) => cambioCasilla(a, e.target),
            onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); siguienteCasilla(e.target); } },
          });
          const suma = h('small', { class: 'suma' }, sumaTexto(valor));
          return h('div', { class: `c-${c.codigo}` }, input, suma);
        })
      )
    )
  );
  actualizarTotales();
  const obs = $('#pl-obs');
  obs.value = pendA[OBS] ?? a.observacion ?? '';
  $('#pl-obs-cuenta').textContent = `${obs.value.length}/500`;
  obs.oninput = () => {
    $('#pl-obs-cuenta').textContent = `${obs.value.length}/500`;
    estado.pendientes[a.id] = { ...(estado.pendientes[a.id] || {}), [OBS]: obs.value };
    almacen.guardar(CLAVE_PEND, estado.pendientes);
    marcarGuardado('pendiente');
    clearTimeout(temporizadorGuardar);
    temporizadorGuardar = setTimeout(enviarPendientes, 1200);
  };
  mostrar('#p-planilla');
}

function sumaTexto(t) {
  const v = valorCasilla(t);
  return v.ok && String(t).includes('+') ? `= ${v.valor}` : '';
}

function siguienteCasilla(input) {
  const todos = [...document.querySelectorAll('#pl-filas input:not(:disabled)')];
  const i = todos.indexOf(input);
  if (todos[i + 1]) todos[i + 1].focus();
}

let temporizadorGuardar;
const OBS = '__obs'; // la observación viaja en la misma cola que las casillas (funciona sin señal)
function cambioCasilla(a, input) {
  const v = valorCasilla(input.value);
  input.classList.toggle('invalido', !v.ok);
  input.nextElementSibling.textContent = sumaTexto(input.value);
  actualizarTotales();
  if (!v.ok) return;
  estado.pendientes[a.id] = { ...(estado.pendientes[a.id] || {}), [input.dataset.k]: input.value.trim() };
  almacen.guardar(CLAVE_PEND, estado.pendientes);
  marcarGuardado('pendiente');
  clearTimeout(temporizadorGuardar);
  temporizadorGuardar = setTimeout(enviarPendientes, 800);
}

function actualizarTotales() {
  const cols = estado.actual?.colores || estado.datos.colores;
  const sumas = Object.fromEntries(cols.map((c) => [c.codigo, 0]));
  document.querySelectorAll('#pl-filas input:not(:disabled)').forEach((i) => {
    const v = valorCasilla(i.value);
    if (v.ok && v.valor) sumas[i.dataset.k.split('|')[1]] += v.valor;
  });
  // El total suma solo estibas; las canastillas se muestran aparte
  const estibas = cols.filter((c) => c.unidad !== 'canastilla');
  const total = estibas.reduce((a, c) => a + sumas[c.codigo], 0);
  $('#pl-totales').style.setProperty('--ntot', cols.length + (estibas.length > 1 ? 1 : 0));
  poner($('#pl-totales'), 
    ...cols.map((c) => h('div', { class: `total-color c-${c.codigo}` }, h('small', {}, c.nombre.replace('Pallet ', '')), h('strong', {}, sumas[c.codigo]))),
    estibas.length > 1 ? h('div', { class: 'total-color' }, h('small', {}, 'Total estibas'), h('strong', {}, total)) : null
  );
}

function marcarGuardado(tipo) {
  const el = $('#estado-guardado');
  const t = { ok: ['Guardado ✓', 'chip ok'], pendiente: ['Guardando…', 'chip aviso'], red: ['Sin señal: guardado en el celular', 'chip error'] }[tipo];
  el.textContent = t[0];
  el.className = t[1];
}

// Envía al servidor lo que se digitó (también lo que quedó guardado sin señal).
async function enviarPendientes() {
  if (estado.guardando) return;
  const ids = Object.keys(estado.pendientes).filter((id) => Object.keys(estado.pendientes[id]).length);
  if (!ids.length) return;
  estado.guardando = true;
  try {
    for (const id of ids) {
      const lote = estado.pendientes[id];
      const casillas = Object.entries(lote).filter(([k]) => k !== OBS).map(([k, expresion]) => {
        const [modulo, color] = k.split('|');
        return { modulo, color, expresion };
      });
      const cuerpo = { casillas };
      if (OBS in lote) cuerpo.observacion = lote[OBS];
      try {
        const a = await api(`/asignaciones/${id}`, { method: 'PUT', body: cuerpo });
        // Solo se borra lo enviado que no cambió mientras tanto
        const ahora = estado.pendientes[id] || {};
        for (const [k, v] of Object.entries(lote)) if (ahora[k] === v) delete ahora[k];
        if (estado.actual && estado.actual.id === a.id) Object.assign(estado.actual, { conteos: a.conteos, observacion: a.observacion });
        const enDatos = estado.datos?.asignaciones?.find((x) => x.id === a.id);
        if (enDatos) Object.assign(enDatos, { conteos: a.conteos, observacion: a.observacion });
        guardarCopia();
      } catch (e) {
        if (e instanceof ErrorRed) throw e;
        // Se descartan solo si el pasillo ya se terminó o lo quitaron; si el inventario no está abierto se conservan
        if (e.status === 404 || (e.status === 409 && /terminó/.test(e.message))) delete estado.pendientes[id];
        avisar(e.message, 'error');
      }
    }
    almacen.guardar(CLAVE_PEND, estado.pendientes);
    marcarGuardado('ok');
  } catch (e) {
    if (e instanceof ErrorRed) marcarGuardado('red');
  } finally {
    estado.guardando = false;
  }
}

async function terminarPasillo() {
  const a = estado.actual;
  const invalidas = document.querySelectorAll('#pl-filas input.invalido').length;
  if (invalidas) return avisar(`Corrige ${invalidas} casilla(s) en rojo`, 'error');
  const vacias = [...document.querySelectorAll('#pl-filas input:not(:disabled)')].filter((i) => !i.value.trim()).length;
  const texto = vacias
    ? `Hay ${vacias} casillas vacías: se guardarán como 0. ¿Terminar ${a.pasillo.nombre}?`
    : `¿Terminar ${a.pasillo.nombre}? Después no podrás cambiarlo.`;
  if (!confirm(texto)) return;
  clearTimeout(temporizadorGuardar);
  await enviarPendientes();
  const sinEnviar = Object.keys(estado.pendientes[a.id] || {}).length > 0;
  try {
    if (sinEnviar) throw new ErrorRed('Sin conexión');
    const datos = await api(`/asignaciones/${a.id}/terminar`, { method: 'POST' });
    delete estado.pendientes[a.id];
    almacen.guardar(CLAVE_PEND, estado.pendientes);
    estado.datos = aplicarCambiosLocales(datos);
    guardarCopia();
    estado.actual = null;
    if (datos.terminado) return terminar(datos);
    avisar(`${a.pasillo.nombre} terminado`, 'ok');
    pintarLista();
  } catch (e) {
    if (!(e instanceof ErrorRed)) return avisar(e.message, 'error');
    // Sin señal: queda terminado en el celular y se envía solo al volver la conexión
    if (!estado.porTerminar.includes(a.id)) estado.porTerminar.push(a.id);
    almacen.guardar(CLAVE_TERM, estado.porTerminar);
    const enDatos = estado.datos.asignaciones.find((x) => x.id === a.id);
    if (enDatos) enDatos.estado = 'terminada_local';
    guardarCopia();
    estado.actual = null;
    marcarGuardado('red');
    avisar(`${a.pasillo.nombre} terminado en el celular. Se enviará cuando vuelva la señal.`, 'ok');
    pintarLista();
  }
}

// Avisa cuando la app ya quedó guardada en el celular para abrirse sin conexión
function indicarListoSinConexion() {
  const el = $('#b-offline');
  if (!el || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then(() => caches.keys().then((k) => k.some((x) => x.startsWith('inventario-nube'))))
    .then((ok) => { if (ok) el.hidden = false; })
    .catch(() => {});
}

// ---------- Modo bloqueo: pantalla completa, pantalla encendida y registro de salidas ----------
let bloqueoPantalla = null;
async function entrarPantallaCompleta() {
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* no soportado */ }
  try { if ('wakeLock' in navigator) bloqueoPantalla = await navigator.wakeLock.request('screen'); } catch { /* no soportado */ }
}
function salirPantallaCompleta() {
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* nada */ }
}

function enviarEvento(tipo) {
  NUBE.pedir(`/api/contar/${encodeURIComponent(TOKEN)}/eventos`, { method: 'POST', body: { tipo } })
    .then((r) => { if (r.ok && typeof r.datos.salidas === 'number') estado.salidas = r.datos.salidas; }).catch(() => {});
}

let vigilando = false;
function activarVigilancia() {
  if (vigilando) return;
  vigilando = true;
  document.addEventListener('visibilitychange', () => {
    if (!almacen.leer(CLAVE_INICIO, false) || estado.datos?.terminado) return;
    if (document.visibilityState === 'hidden') {
      enviarEvento('salio');
    } else {
      enviarEvento('volvio');
      if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((b) => (bloqueoPantalla = b)).catch(() => {});
      mostrarAlertaSalida();
      cargar({ silencioso: true });
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !estado.datos?.terminado) {
      enviarEvento('sin_pantalla_completa');
      mostrarAlertaSalida('Saliste de pantalla completa.');
    }
  });
}

function mostrarAlertaSalida(extra = '') {
  setTimeout(() => {
    const n = estado.salidas ?? estado.datos?.participante?.salidas ?? 0;
    const el = $('#alerta-salida');
    poner(el, 
      `${extra} ${n ? `Saliste de la app ${n} ${n === 1 ? 'vez' : 'veces'}. ` : ''}Mientras cuentas no uses otras aplicaciones: el administrador lo ve.`,
      h('button', { type: 'button', onclick: () => { el.hidden = true; entrarPantallaCompleta(); } }, 'Entendido')
    );
    el.hidden = false;
  }, 400);
}

window.addEventListener('beforeunload', (e) => {
  if (Object.values(estado.pendientes).some((p) => Object.keys(p).length)) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('online', () => cargar({ silencioso: Boolean(estado.actual) }));
window.addEventListener('offline', () => { estado.sinRed = true; marcarGuardado('red'); });

// Sondeo: actualiza para recibir la verificación asignada o el inicio del inventario
let sondeo;
function iniciarSondeo() {
  sondeo = setInterval(() => {
    if (!estado.actual) cargar({ silencioso: true });
    else enviarPendientes().then(guardarCopia);
  }, 10000);
}
function detenerSondeo() { clearInterval(sondeo); }

// ---------- Inicio ----------
$('#btn-comenzar').addEventListener('click', comenzar);
$('#btn-volver').addEventListener('click', async () => { await enviarPendientes(); estado.actual = null; cargar(); });
$('#btn-terminar').addEventListener('click', terminarPasillo);
if (almacen.leer(CLAVE_INICIO, false)) activarVigilancia();
if ('serviceWorker' in navigator && !window.Capacitor) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
cargar();
iniciarSondeo();
