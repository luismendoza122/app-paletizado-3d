// Panel de administrador del inventario mensual de estibas (versión en la nube).
// Igual que en el PC; cambia la conexión (nube.js), el ingreso con código personal y Aura con Copilot.
'use strict';

// Título que sale en la planilla impresa (igual a la de papel)
const TITULO_PLANILLA = 'PLANTILLA DE INVENTARIO ATS R10 VALLEDUPAR';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
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

const sesion = {
  leer(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  guardar(k, v) { try { sessionStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  borrar(k) { try { sessionStorage.removeItem(k); } catch { /* nada */ } },
};
const fmt = (n) => Number(n || 0).toLocaleString('es-CO');

let temporizadorAviso;
function avisar(texto, tipo = '') {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = `aviso-flotante ver ${tipo}`;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (el.className = 'aviso-flotante'), 3500);
}

const estado = { clave: null, acceso: null, rol: '', vueltas: 0, invId: Number(sesion.leer('inventario')) || null, resumen: null, config: null, info: null, vista: 'tablero' };

async function api(ruta, opciones = {}) {
  if (!estado.acceso) estado.acceso = await NUBE.acceso();
  const r = await NUBE.pedir(`/api/admin${ruta}`, { method: opciones.method || 'GET', body: opciones.body, acceso: estado.acceso });
  if (r.status === 401) { salir(r.datos.error); const e = new Error(r.datos.error || 'Código no válido'); e.status = 401; throw e; }
  if (opciones.blob) {
    if (!r.ok || !r.datos.archivo) throw new Error(r.datos.error || 'No se pudo descargar');
    return r.datos.archivo;
  }
  const datos = r.datos;
  if (!r.ok) {
    const e = new Error(datos.detalle ? `${datos.error}: ${datos.detalle.join(', ')}` : datos.error || `Error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return datos;
}
const intentar = (fn) => async (...args) => { try { await fn(...args); } catch (e) { avisar(e.message, 'error'); } };

const ESTADOS = {
  sin_asignar: ['Sin asignar', 'gris'], asignado: ['Asignado', 'gris'], contando: ['Contando', ''], contado: ['Contado, sin verificar', ''],
  verificando: ['Verificando', 'aviso'], diferencias: ['Con diferencias', 'error'], en_reconteo: ['En reconteo', 'aviso'], cuadrado: ['Cuadrado', 'ok'],
  ok: ['Cuadra', 'ok'], diferencia: ['Diferencia', 'error'], revisar: ['Revisar', 'error'], resuelto: ['Resuelto', 'ok'], ajustado: ['Ajustado', 'ok'],
  sin_verificar: ['Sin verificar', 'gris'], pendiente: ['Pendiente', 'gris'],
};
const chipEstado = (e) => h('span', { class: `chip ${ESTADOS[e]?.[1] ?? ''}` }, ESTADOS[e]?.[0] ?? e);
const ESTADO_INV = { preparacion: ['En preparación', 'gris'], en_curso: ['En curso', 'ok'], cerrado: ['Cerrado', 'aviso'] };
const ESTADO_PERSONA = { pendiente: ['Sin abrir', 'gris'], activo: ['Contando', ''], terminado: ['Terminó', 'ok'] };
const TIPO = { conteo: 'Conteo', verificacion: 'Verificación', reconteo: 'Reconteo' };

// ---------- Ingreso ----------
// Código de administrador (un solo celular, vence) o, si se escribe un correo, la cuenta principal con su contraseña
function salir(motivo, { olvidar = true } = {}) {
  if (olvidar) NUBE.salir();
  estado.acceso = null;
  estado.clave = null;
  $('#v-app').hidden = true;
  $('#v-login').hidden = false;
  if (motivo) avisar(motivo, 'error');
}
$('#clave').addEventListener('input', () => {
  const correo = $('#clave').value.includes('@');
  $('#campo-pass').hidden = !correo;
  $('#pass').required = correo;
});

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = $('#clave').value.trim();
  try {
    if (valor.includes('@')) {
      await NUBE.iniciarSesion(valor, $('#pass').value);
      NUBE.guardarCodigo(null);
    } else {
      NUBE.guardarCodigo(valor);
    }
    estado.acceso = await NUBE.acceso();
    const q = await NUBE.pedir('/api/admin/quien', { acceso: estado.acceso });
    if (!['admin', 'propietario'].includes(q.datos.rol)) { salir(q.datos.motivo || 'Código no válido o ya fue quitado.'); return; }
    $('#pass').value = '';
    await iniciarPanel();
  } catch (err) {
    avisar(err.message, 'error');
  }
});
$('#btn-salir').addEventListener('click', () => { if (confirm('¿Salir de la administración en este celular?')) salir(); });

async function iniciarPanel() {
  const [config, info] = await Promise.all([api('/config'), api('/info')]);
  estado.config = config;
  estado.info = info;
  estado.rol = info.rol;
  estado.clave = true;
  $('#pest-admins').hidden = info.rol !== 'propietario';
  $('#v-login').hidden = true;
  $('#v-app').hidden = false;
  pintarConfig();
  await cargarInventarios();
  cargarOperadores().catch(() => {});
  cargarAura().catch(() => {});
}

// ---------- Inventarios ----------
async function cargarInventarios() {
  const lista = await api('/inventarios');
  if (!lista.length) {
    poner($('#sel-inventario'), h('option', { value: '' }, 'Sin inventarios'));
    pintarVacio();
    return abrirNuevoInventario();
  }
  estado.inventarios = lista;
  const activos = lista.filter((i) => !i.archivado);
  const archivados = lista.filter((i) => i.archivado);
  if (!lista.some((i) => i.id === estado.invId)) estado.invId = (activos[0] || lista[0]).id;
  const opcion = (i) => h('option', { value: i.id }, `${i.archivado ? '🗄 ' : ''}${i.nombre} · ${ESTADO_INV[i.estado][0]}`);
  poner($('#sel-inventario'), ...activos.map(opcion),
    archivados.length ? h('optgroup', { label: `Archivados (${archivados.length})` }, ...archivados.map(opcion)) : null);
  $('#sel-inventario').value = estado.invId;
  await cargarResumen();
}

function pintarVacio() {
  poner($('#franja-estado'), h('span', { class: 'tenue' }, 'Crea el inventario del mes para empezar.'));
}

function abrirNuevoInventario() {
  const ahora = new Date();
  const mes = ahora.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  $('#ni-nombre').value = `Inventario ${mes}`;
  $('#ni-fecha').value = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('#dlg-inventario').showModal();
}
$('#btn-nuevo-inv').addEventListener('click', abrirNuevoInventario);
$('#ni-cancelar').addEventListener('click', () => $('#dlg-inventario').close());
$('#form-inventario').addEventListener('submit', intentar(async () => {
  const inv = await api('/inventarios', { method: 'POST', body: { nombre: $('#ni-nombre').value, fecha: $('#ni-fecha').value, max_verificaciones: Number($('#ni-verif').value) } });
  estado.invId = inv.id;
  estado.espSucio = false;
  estado.obsSucia = false;
  sesion.guardar('inventario', inv.id);
  avisar('Inventario creado. Ahora agrega las personas y sus pasillos.', 'ok');
  await cargarInventarios();
  irA('personas');
}));
// ---------- Editar, archivar o borrar el inventario elegido ----------
function invActual() { return (estado.inventarios || []).find((i) => i.id === estado.invId); }
function abrirEditarInventario() {
  const i = invActual();
  if (!i) return avisar('Primero crea o elige un inventario.', 'error');
  $('#ei-nombre').value = i.nombre;
  $('#ei-fecha').value = i.fecha;
  $('#ei-verif').value = i.max_verificaciones;
  $('#ei-estado').textContent = `Estado: ${ESTADO_INV[i.estado][0]} · ${i.personas} persona(s) · creado ${i.creado_en}${i.archivado ? ' · ARCHIVADO' : ''}`;
  $('#ei-archivar').textContent = i.archivado ? '↩ Desarchivar' : '🗄 Archivar';
  $('#ei-archivar').disabled = !i.archivado && i.estado === 'en_curso';
  $('#ei-nombre-actual').textContent = i.nombre;
  $('#ei-confirmar').value = '';
  $('#ei-borrar').disabled = true;
  $('#ei-borrar').title = i.estado === 'en_curso' ? 'Cierra el inventario antes de borrarlo' : '';
  $('#dlg-editar-inv').showModal();
}
$('#btn-editar-inv').addEventListener('click', abrirEditarInventario);
$('#ei-cancelar').addEventListener('click', () => $('#dlg-editar-inv').close());
$('#form-editar-inv').addEventListener('submit', intentar(async () => {
  await api(`/inventarios/${estado.invId}`, { method: 'PUT', body: { nombre: $('#ei-nombre').value, fecha: $('#ei-fecha').value, max_verificaciones: Number($('#ei-verif').value) } });
  avisar('Inventario actualizado.', 'ok');
  await cargarInventarios();
}));
$('#ei-archivar').addEventListener('click', intentar(async () => {
  const i = invActual();
  await api(`/inventarios/${i.id}`, { method: 'PUT', body: { archivado: !i.archivado } });
  $('#dlg-editar-inv').close();
  avisar(i.archivado ? 'Inventario desarchivado.' : 'Inventario archivado (sigue al final de la lista, en "Archivados").', 'ok');
  await cargarInventarios();
}));
$('#ei-confirmar').addEventListener('input', () => {
  const i = invActual();
  $('#ei-borrar').disabled = !i || i.estado === 'en_curso' || $('#ei-confirmar').value.trim().toLowerCase() !== i.nombre.trim().toLowerCase();
});
$('#ei-borrar').addEventListener('click', intentar(async () => {
  const i = invActual();
  const r = await api(`/inventarios/${i.id}`, { method: 'DELETE', body: { confirmar: $('#ei-confirmar').value } });
  $('#dlg-editar-inv').close();
  estado.invId = null;
  sesion.guardar('inventario', '');
  avisar(`Se borró "${r.nombre}" (${r.personas} personas, ${r.conteos} conteos).${r.respaldo ? ` Quedó una copia completa en la nube (${r.respaldo})` : ''}`, 'ok');
  await cargarInventarios();
}));

$('#sel-inventario').addEventListener('change', intentar(async (e) => {
  estado.invId = Number(e.target.value);
  estado.espSucio = false;
  estado.obsSucia = false;
  sesion.guardar('inventario', estado.invId);
  await cargarResumen();
}));

async function cargarResumen() {
  if (!estado.invId) return;
  estado.resumen = await api(`/inventarios/${estado.invId}`);
  estilosItems(estado.resumen.colores);
  pintarFranja();
  pintarEsperados();
  pintarObsGeneral();
  pintarTablero();
  pintarPersonas();
  pintarOperadores();
  pintarTotales();
  llenarSelectPasillos();
  if (estado.vista === 'cruce') await cargarCruce();
}

function pintarFranja() {
  const { inventario: inv, estados, pasillos } = estado.resumen;
  const [txt, cls] = ESTADO_INV[inv.estado];
  const botones = [];
  if (inv.estado === 'preparacion') botones.push(h('button', { class: 'boton chico ok', type: 'button', onclick: () => cambiarEstado('en_curso', '¿Iniciar el inventario? Los enlaces ya permitirán contar.') }, '▶ Iniciar inventario'));
  if (inv.estado === 'en_curso') botones.push(h('button', { class: 'boton chico peligro', type: 'button', onclick: () => cambiarEstado('cerrado', `¿Cerrar el inventario? ${pasillos.length - (estados.cuadrado || 0)} pasillos no están cuadrados. Los enlaces dejarán de funcionar.`) }, '■ Cerrar inventario'));
  if (inv.estado === 'cerrado') botones.push(h('button', { class: 'boton chico secundario', type: 'button', onclick: () => cambiarEstado('en_curso', '¿Reabrir el inventario?') }, 'Reabrir'));
  poner($('#franja-estado'), 
    h('span', { class: `chip ${cls}` }, txt),
    h('span', { class: 'tenue' }, `Fecha ${inv.fecha} · verificación: ${inv.max_verificaciones === 0 ? 'hasta completar' : inv.max_verificaciones + ' pasillo(s) por persona'}`),
    h('span', { class: 'espacio' }),
    h('span', { class: 'tenue pequeno' }, `Actualizado ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`),
    h('button', { class: 'boton chico secundario', type: 'button', onclick: intentar(cargarResumen) }, '↻'),
    ...botones
  );
}

const cambiarEstado = intentar(async (nuevo, pregunta) => {
  if (!confirm(pregunta)) return;
  await api(`/inventarios/${estado.invId}/estado`, { method: 'POST', body: { estado: nuevo } });
  await cargarInventarios();
});

// ---------- Según sistema vs contado (arriba del tablero) ----------
// Diferencia = contado − según sistema: negativo = faltan, positivo = sobran
function difTexto(d) {
  if (d === null || Number.isNaN(d)) return h('span', { class: 'tenue pequeno' }, '—');
  if (d === 0) return h('span', { class: 'esp-dif cuadra' }, h('i', { 'aria-hidden': 'true' }, '✓'), 'Cuadra');
  return d < 0
    ? h('span', { class: 'esp-dif faltan' }, h('i', { 'aria-hidden': 'true' }, '▼'), `Faltan ${fmt(-d)}`)
    : h('span', { class: 'esp-dif sobran' }, h('i', { 'aria-hidden': 'true' }, '▲'), `Sobran ${fmt(d)}`);
}
const leerCantidad = (input) => (input.value.trim() === '' ? null : Math.max(0, Math.floor(Number(input.value))));

function pintarEsperados() {
  const esp = estado.resumen.esperados;
  // Si el admin está escribiendo (cambios sin guardar), se conservan sus números
  const escritos = estado.espSucio ? Object.fromEntries($$('#esp-filas input[data-clave]').map((i) => [i.dataset.clave, i.value])) : {};
  const notas = estado.espSucio ? Object.fromEntries($$('#esp-filas input[data-obs]').map((i) => [i.dataset.obs, i.value])) : {};
  poner($('#esp-filas'), ...esp.filas.flatMap((f) => {
    const input = h('input', {
      type: 'number', min: 0, step: 1, inputmode: 'numeric', 'aria-label': `${f.nombre} según sistema`, placeholder: '—',
      value: f.clave in escritos ? escritos[f.clave] : f.esperado ?? '', dataset: { clave: f.clave, contado: f.contado, unidad: f.unidad, seccion: f.seccion ? '1' : '' },
      oninput: () => { estado.espSucio = true; recalcularEsperados(); },
    });
    const nota = f.clave in notas ? notas[f.clave] : f.observacion || '';
    const filaObs = h('tr', { class: 'esp-obs', hidden: !nota },
      h('td', { colspan: 4 }, h('input', {
        type: 'text', maxlength: 300, value: nota, placeholder: `Observación de ${f.nombre.replace('Pallet ', '')} (opcional)`, 'aria-label': `Observación de ${f.nombre}`,
        dataset: { obs: f.clave }, oninput: () => { estado.espSucio = true; recalcularEsperados(); },
      })));
    const boton = h('button', { type: 'button', class: `btn-nota${nota ? ' activa' : ''}`, title: 'Agregar observación', 'aria-label': `Observación de ${f.nombre}`,
      onclick: () => { filaObs.hidden = false; fila.classList.add('con-obs'); filaObs.querySelector('input').focus(); } }, '📝');
    const fila = h('tr', { class: nota ? 'con-obs' : null },
      h('td', {}, h('span', { class: `esp-nombre c-${f.seccion ? 'pilas' : f.clave}`, style: f.seccion ? '--c:#5b6472' : null }, h('i', { class: 'punto' }), f.nombre.replace('Pallet ', ''),
        f.detalle ? h('small', { class: 'tenue' }, `(${f.detalle})`) : null, boton)),
      h('td', {}, input),
      h('td', { class: 'num' }, h('strong', {}, fmt(f.contado))),
      h('td', { class: 'esp-celda-dif' }));
    return [fila, filaObs];
  }));
  recalcularEsperados();
}

function recalcularEsperados() {
  const esp = estado.resumen.esperados;
  const inputs = $$('#esp-filas input[data-clave]');
  inputs.forEach((i) => {
    const v = leerCantidad(i);
    poner(i.closest('tr').querySelector('.esp-celda-dif'), difTexto(v === null ? null : Number(i.dataset.contado) - v));
  });
  // Total estibas = suma de los colores que son estiba (sin la fila de pilas, que ya está incluida en los colores)
  const deEstiba = inputs.filter((i) => i.dataset.unidad === 'estiba' && !i.dataset.seccion);
  const conDato = deEstiba.map(leerCantidad).filter((v) => v !== null);
  const esperadoTotal = conDato.length ? conDato.reduce((a, b) => a + b, 0) : null;
  poner($('#esp-total'), h('tr', {},
    h('td', {}, 'Total estibas'),
    h('td', { class: 'num' }, esperadoTotal === null ? '—' : fmt(esperadoTotal)),
    h('td', { class: 'num' }, fmt(esp.total.contado)),
    h('td', {}, difTexto(esperadoTotal === null ? null : esp.total.contado - esperadoTotal))));
  const pie = $('#esp-guardar').parentElement;
  pie.classList.toggle('sucio', Boolean(estado.espSucio));
  $('#esp-nota').textContent = estado.espSucio
    ? 'Hay cambios sin guardar.'
    : esp.actualizado ? `Guardado ${esp.actualizado.slice(0, 16)}. Lo contado se actualiza solo.` : 'Lo contado se actualiza solo mientras avanza el inventario.';
}

$('#tb-esperados').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  const esperados = $$('#esp-filas input[data-clave]').map((i) => ({
    clave: i.dataset.clave, cantidad: leerCantidad(i), observacion: $(`#esp-filas input[data-obs="${i.dataset.clave}"]`)?.value ?? null,
  }));
  await api(`/inventarios/${estado.invId}/esperados`, { method: 'PUT', body: { esperados } });
  estado.espSucio = false;
  await cargarResumen();
  avisar('Cantidades según sistema guardadas', 'ok');
}));

// ---------- Observaciones generales del inventario ----------
function pintarObsGeneral() {
  const el = $('#obs-general');
  if (document.activeElement === el || estado.obsSucia) return; // no se pisa lo que se está escribiendo
  el.value = estado.resumen.inventario.observaciones || '';
}
$('#obs-general').addEventListener('input', () => { estado.obsSucia = true; $('#obs-nota').textContent = 'Hay cambios sin guardar.'; });
$('#tb-obs').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  await api(`/inventarios/${estado.invId}`, { method: 'PUT', body: { observaciones: $('#obs-general').value } });
  estado.obsSucia = false;
  $('#obs-nota').textContent = 'Salen en el Excel y en el dashboard.';
  await cargarResumen();
  avisar('Observaciones guardadas', 'ok');
}));

// ---------- Dashboard ----------
const descargarDashboard = intentar(async () => {
  if (estado.espSucio && !confirm('Hay cantidades "según sistema" sin guardar. ¿Descargar el dashboard sin ellas?')) return;
  avisar('Preparando dashboard…');
  const elaboro = $('#tt-elaboro').value.trim();
  const archivo = await api(`/inventarios/${estado.invId}/dashboard${elaboro ? `?elaboro=${encodeURIComponent(elaboro)}` : ''}`, { blob: true });
  await NUBE.descargar(archivo, `Dashboard ${estado.resumen.inventario.nombre}.html`);
  avisar('Dashboard descargado: ábrelo con el navegador. Desde ahí se imprime o se guarda en PDF.', 'ok');
});
$('#btn-dashboard').addEventListener('click', descargarDashboard);
$('#btn-dashboard-tb').addEventListener('click', descargarDashboard);

// ---------- Tablero ----------
function pintarTablero() {
  const r = estado.resumen;
  const e = r.estados;
  const activos = r.participantes.filter((p) => p.estado === 'activo').length;
  poner($('#tb-contadores'), 
    contador('Pasillos cuadrados', `${e.cuadrado || 0} / ${r.pasillos.length}`, 'var(--ok)'),
    contador('Con diferencias', e.diferencias || 0, 'var(--error)'),
    contador('En proceso', (e.contando || 0) + (e.asignado || 0) + (e.verificando || 0) + (e.en_reconteo || 0) + (e.contado || 0)),
    contador('Sin asignar', e.sin_asignar || 0, 'var(--borde)'),
    contador('Personas contando', `${activos} / ${r.participantes.length}`),
    contador('Total estibas', fmt(r.global.total), 'var(--azul-marca)'),
    r.global.canastillas ? contador('Canastillas', fmt(r.global.canastillas), 'var(--pallet-canastilla)') : null
  );
  const alertas = r.participantes.filter((p) => p.salidas > 0);
  const deAgentes = (aura.vig?.alertas || []).filter((a) => a.nivel !== 'info' && a.tipo !== 'salidas_app');
  poner($('#tb-alertas'), 
    ...alertas.map((p) => h('div', { class: 'alerta' }, `⚠ ${p.nombre} salió de la app ${p.salidas} ${p.salidas === 1 ? 'vez' : 'veces'} mientras contaba.`)),
    deAgentes.length ? h('button', { class: 'alerta alerta-boton', type: 'button', onclick: () => irA('aura') }, `🛡️ Los agentes de Aura tienen ${deAgentes.length} alerta(s): ${deAgentes.slice(0, 2).map((a) => a.mensaje).join(' · ')}${deAgentes.length > 2 ? ' …' : ''} → ver`) : null
  );
  const porSeccion = new Map();
  r.pasillos.forEach((p) => { if (!porSeccion.has(p.seccion)) porSeccion.set(p.seccion, []); porSeccion.get(p.seccion).push(p); });
  poner($('#tb-secciones'), 
    ...[...porSeccion.entries()].map(([seccion, lista]) => {
      const s = r.secciones.find((x) => x.nombre === seccion);
      return h('div', { class: 'seccion-tablero' },
        h('h2', {}, seccion, h('span', { class: 'tenue pequeno' }, `${s.cuadrados}/${s.pasillos} cuadrados · ${resumenUnidades(s)}`)),
        h('div', { class: 'grilla-pasillos' }, ...lista.map((p) =>
          h('button', { type: 'button', class: `pasillo-tile e-${p.estado}`, onclick: () => { irA('cruce'); $('#cr-pasillo').value = p.id; cargarCruce(); } },
            h('strong', {}, p.nombre),
            chipEstado(p.estado),
            h('small', {}, p.conto ? `Contó: ${p.conto.persona}${p.conto.estado === 'terminada' ? ' ✓' : ''}` : 'Sin persona asignada'),
            p.verifico ? h('small', {}, `Verificó: ${p.verifico.persona}${p.verifico.estado === 'terminada' ? ' ✓' : ''}`) : null,
            h('span', { class: 'tot' }, totalesCortos(p)),
            p.observaciones?.length || p.nota_admin ? h('span', { class: 'nota' }, `📝 ${(p.observaciones?.length || 0) + (p.nota_admin ? 1 : 0)} observación(es)`) : null
          )))
      );
    })
  );
}

const nombreCorto = (codigo) => {
  const c = estado.resumen?.colores.find((x) => x.codigo === codigo);
  return c ? c.nombre.replace('Pallet ', '') : codigo;
};
// "A 12 · B 8 · V 0 = 20" para pallets; las canastillas van aparte
function totalesCortos(p) {
  const partes = p.colores.map((c) => `${c === 'canastilla' ? 'Canast.' : nombreCorto(c).charAt(0).toUpperCase()} ${p.totales[c] || 0}`).join(' · ');
  const pallets = p.colores.filter((c) => c !== 'canastilla');
  return pallets.length > 1 ? `${partes} = ${p.total}` : partes;
}
function resumenUnidades(x) {
  return [x.total || !x.canastillas ? `${fmt(x.total)} estibas` : null, x.canastillas ? `${fmt(x.canastillas)} canastillas` : null].filter(Boolean).join(' · ');
}

function contador(rotulo, valor, color) {
  return h('div', { class: 'contador', style: color ? `--c:${color}` : null }, h('small', {}, rotulo), h('strong', {}, valor));
}

// ---------- Personas y enlaces ----------
function pasillosConConteo() {
  const mapa = new Map();
  estado.resumen.participantes.forEach((p) => p.asignaciones.filter((a) => a.tipo === 'conteo').forEach((a) => mapa.set(a.pasillo_id, p.nombre)));
  return mapa;
}

function pintarPersonas() {
  const r = estado.resumen;
  const ocupados = pasillosConConteo();
  const cerrado = r.inventario.estado === 'cerrado';
  poner($('#p-pasillos'), 
    ...estado.config.secciones.map((s) => {
      const activos = s.pasillos.filter((p) => p.activo);
      if (!activos.length) return null;
      return h('fieldset', {},
        h('legend', {}, s.nombre, ' ', h('button', { type: 'button', class: 'boton texto', onclick: () => {
          $$(`#p-pasillos input[data-seccion="${s.id}"]:not(:disabled)`).forEach((i) => (i.checked = true));
        } }, 'todos')),
        h('div', { class: 'opciones' }, ...activos.map((p) => {
          const quien = ocupados.get(p.id);
          return h('label', { class: 'opcion', title: quien ? `Ya lo cuenta ${quien}` : p.nombre },
            h('input', { type: 'checkbox', value: p.id, disabled: Boolean(quien), dataset: { seccion: s.id } }),
            h('span', {}, p.codigo));
        })));
    })
  );
  $('#form-persona button[type=submit]').disabled = cerrado;
  $('#p-cuenta').textContent = `(${r.participantes.length})`;

  const pasillosActivos = estado.config.secciones.flatMap((s) => s.pasillos.filter((p) => p.activo));
  poner($('#lista-personas'), 
    ...(r.participantes.length ? r.participantes.map((p) => {
      const [txt, cls] = ESTADO_PERSONA[p.estado];
      const selPasillo = h('select', { 'aria-label': 'Pasillo' }, ...pasillosActivos.map((x) => h('option', { value: x.id }, x.codigo)));
      const selTipo = h('select', { 'aria-label': 'Tipo' }, h('option', { value: 'conteo' }, 'Conteo'), h('option', { value: 'verificacion' }, 'Verificación'));
      return h('div', { class: 'tarjeta persona' },
        h('div', { class: 'persona-cab' },
          h('strong', {}, p.nombre),
          p.salidas ? h('span', { class: 'chip error' }, `Salió ${p.salidas}×`) : null,
          h('span', { class: `chip ${cls}` }, txt)),
        h('div', { class: 'asigs' }, ...(p.asignaciones.length ? p.asignaciones.map((a) =>
          h('span', { class: `chip ${a.estado === 'terminada' ? 'ok' : a.tipo === 'verificacion' ? 'aviso' : a.tipo === 'reconteo' ? 'error' : ''}`, title: `${TIPO[a.tipo]} · ${a.estado}` },
            `${a.pasillo} · ${TIPO[a.tipo]}${a.celdas ? ` (${a.celdas.length})` : ''}${a.estado === 'terminada' ? ' ✓' : ''}`,
            cerrado ? null : h('button', { type: 'button', 'aria-label': `Quitar ${a.pasillo}`, onclick: () => anularAsignacion(a) }, '×'))
        ) : [h('span', { class: 'tenue pequeno' }, 'Sin pasillos')])),
        cerrado ? null : h('div', { class: 'acciones' },
          p.estado !== 'terminado' ? h('button', { class: 'boton chico', type: 'button', onclick: () => mostrarEnlace(p) }, 'Enlace / WhatsApp') : null,
          p.estado !== 'terminado' ? h('button', { class: 'boton chico secundario', type: 'button', onclick: () => nuevoEnlace(p) }, 'Enlace nuevo') : null,
          p.estado !== 'terminado' ? h('button', { class: 'boton chico texto', type: 'button', onclick: () => finalizar(p) }, 'Finalizar') : null,
          h('span', { class: 'asignar-extra' }, selPasillo, selTipo,
            h('button', { class: 'boton chico secundario', type: 'button', onclick: () => asignarExtra(p, selPasillo.value, selTipo.value) }, '+ Asignar'))
        ));
    }) : [h('p', { class: 'tenue' }, 'Aún no hay personas. Agrégalas con el formulario.')])
  );
}

$('#form-persona').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  const pasillos = $$('#p-pasillos input:checked').map((i) => Number(i.value));
  if (!pasillos.length && !confirm('No marcaste pasillos. ¿Agregar la persona sin pasillos?')) return;
  const p = await api(`/inventarios/${estado.invId}/participantes`, { method: 'POST', body: { nombre: $('#p-nombre').value, pasillos } });
  $('#p-nombre').value = '';
  cargarOperadores().catch(() => {});
  await cargarResumen();
  mostrarEnlace(p);
}));

const anularAsignacion = intentar(async (a) => {
  const aviso = a.estado === 'terminada' ? ' Ya está terminado: se descartará lo que contó.' : '';
  if (!confirm(`¿Quitar ${a.pasillo} (${TIPO[a.tipo]})?${aviso}`)) return;
  await api(`/inventarios/${estado.invId}/asignaciones/${a.id}/anular`, { method: 'POST' });
  await cargarResumen();
});

const asignarExtra = intentar(async (p, pasilloId, tipo) => {
  await api(`/inventarios/${estado.invId}/asignaciones`, { method: 'POST', body: { participante_id: p.id, pasillo_id: Number(pasilloId), tipo } });
  await cargarResumen();
  const actualizado = estado.resumen.participantes.find((x) => x.id === p.id);
  if (p.estado === 'terminado') mostrarEnlace(actualizado, 'Se le creó un enlace nuevo porque ya había terminado.');
  else avisar(`Asignado. Le aparecerá en su celular en unos segundos.`, 'ok');
});

const nuevoEnlace = intentar(async (p) => {
  if (!confirm(`¿Crear un enlace nuevo para ${p.nombre}? El anterior dejará de funcionar (úsalo si cambió de celular).`)) return;
  const nuevo = await api(`/inventarios/${estado.invId}/participantes/${p.id}/enlace`, { method: 'POST' });
  await cargarResumen();
  mostrarEnlace(nuevo);
});

const finalizar = intentar(async (p) => {
  if (!confirm(`¿Dar por terminado a ${p.nombre}? Su enlace se cerrará.`)) return;
  await api(`/inventarios/${estado.invId}/participantes/${p.id}/finalizar`, { method: 'POST' });
  await cargarResumen();
});

// Los enlaces de los operadores abren la página pública del inventario (cualquier celular con internet)
function mostrarEnlace(p, nota = '') {
  const url = enlaceDe(p); // enlace personal
  const texto = `Hola ${p.nombre}, este es tu enlace para el ${estado.resumen.inventario.nombre}. Ábrelo solo en tu celular (es de un solo uso): ${url}`;
  $('#en-titulo').textContent = `Enlace de ${p.nombre}`;
  $('#en-texto').textContent = `${nota} Funciona en un solo celular: el primero que lo abra. Cada persona lo abre en su celular (con datos o Wi-Fi).`.trim();
  $('#en-url').value = url;
  $('#en-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  estado.compartir = { title: `Enlace de ${p.nombre}`, text: texto };
  $('#en-compartir').hidden = !navigator.share;
  $('#dlg-enlace').showModal();
}
$('#en-compartir').addEventListener('click', () => navigator.share(estado.compartir).catch(() => {}));

const enlaceDe = (p) => NUBE.enlaceOperador(p.token);
$('#btn-copiar-todos').addEventListener('click', async () => {
  const activos = (estado.resumen?.participantes || []).filter((p) => p.estado !== 'terminado');
  if (!activos.length) return avisar('No hay enlaces activos');
  const texto = [`${estado.resumen.inventario.nombre} — enlaces personales (cada uno es de un solo uso)`, '',
    ...activos.map((p) => `${p.nombre} (${p.asignaciones.map((a) => a.pasillo).join(', ') || 'sin pasillos'}): ${enlaceDe(p)}`)].join('\n');
  try { await navigator.clipboard.writeText(texto); avisar(`${activos.length} enlaces copiados. Envía a cada persona solo el suyo.`, 'ok'); }
  catch { prompt('Copia los enlaces:', texto); }
});
$('#en-copiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#en-url').value); avisar('Enlace copiado', 'ok'); }
  catch { $('#en-url').select(); avisar('Selecciona y copia el enlace'); }
});
$('#en-cerrar').addEventListener('click', () => $('#dlg-enlace').close());

// ---------- Operadores guardados y reparto automático ----------
async function cargarOperadores() {
  estado.operadores = await api('/operadores');
  pintarOperadores();
}
function pintarOperadores() {
  const lista = estado.operadores || [];
  const marcados = new Set($$('#rp-operadores input:checked').map((i) => i.value));
  const yaEstan = new Set((estado.resumen?.participantes || []).map((p) => p.nombre.toLowerCase()));
  poner($('#lista-operadores'), ...lista.map((o) => h('option', { value: o.nombre })));
  poner($('#rp-operadores'), ...(lista.length ? lista.map((o) => h('label', { class: 'opcion', title: yaEstan.has(o.nombre.toLowerCase()) ? 'Ya está en este inventario' : `${o.veces} inventario(s)` },
    h('input', { type: 'checkbox', value: o.nombre, checked: marcados.has(o.nombre) }),
    h('span', {}, o.nombre, yaEstan.has(o.nombre.toLowerCase()) ? ' ✓' : '', h('b', { class: 'quitar', role: 'button', 'aria-label': `Quitar ${o.nombre} de la lista`, onclick: (e) => { e.preventDefault(); quitarOperador(o); } }, '×')))) : [h('span', { class: 'tenue pequeno' }, 'Todavía no hay nombres guardados. Se guardan solos al agregar personas, o escríbelos abajo.')]));
}
const quitarOperador = intentar(async (o) => {
  if (!confirm(`¿Quitar a ${o.nombre} de la lista de operadores guardados? (no lo saca de ningún inventario)`)) return;
  estado.operadores = await api(`/operadores/${o.id}`, { method: 'DELETE' });
  pintarOperadores();
});
$('#rp-todos').addEventListener('click', () => $$('#rp-operadores input').forEach((i) => (i.checked = true)));
$('#rp-pasillos-modo').addEventListener('change', (e) => { $('#rp-pasillos').hidden = e.target.value !== 'elegir'; });
$('#rp-guardar').addEventListener('click', intentar(async () => {
  const nombres = $('#rp-nuevos').value.split(',').map((x) => x.trim()).filter((x) => x.length >= 2);
  if (!nombres.length) return avisar('Escribe uno o más nombres separados por coma', 'error');
  estado.operadores = await api('/operadores', { method: 'POST', body: { nombres } });
  $('#rp-nuevos').value = '';
  pintarOperadores();
  nombres.forEach((n) => { const i = $$('#rp-operadores input').find((x) => x.value.toLowerCase() === n.toLowerCase()); if (i) i.checked = true; });
  avisar(`${nombres.length} nombre(s) guardados`, 'ok');
}));
function datosReparto() {
  const nombres = $$('#rp-operadores input:checked').map((i) => i.value);
  const cuerpo = { pasillos: $('#rp-pasillos-modo').value === 'todos' ? 'todos' : $('#rp-pasillos').value.trim() || 'todos' };
  if (nombres.length) cuerpo.nombres = nombres;
  else if (Number($('#rp-cantidad').value) > 0) cuerpo.cantidad = Number($('#rp-cantidad').value);
  else throw new Error('Marca operadores guardados o escribe cuántos operadores');
  if (Number($('#rp-por').value) > 0) cuerpo.por_persona = Number($('#rp-por').value);
  return cuerpo;
}
function pintarPlan(plan, titulo) {
  poner($('#rp-vista'), h('strong', { class: 'pequeno' }, titulo),
    h('table', {}, h('tbody', {}, ...plan.grupos.map((g) => h('tr', {}, h('td', {}, h('strong', {}, g.nombre)), h('td', {}, g.pasillos.join(', '), h('small', { class: 'tenue' }, `${fmt(g.casillas)} casillas`)))))),
    plan.ya_asignados.length ? h('small', { class: 'tenue' }, `Ya tenían persona (se respetan): ${plan.ya_asignados.join(', ')}`) : null,
    plan.sobrantes.length ? h('small', { class: 'tenue' }, `Quedan sin asignar: ${plan.sobrantes.join(', ')}`) : null,
    plan.sin_pasillos.length ? h('small', { class: 'tenue' }, `Sin pasillos (sobran personas): ${plan.sin_pasillos.join(', ')}`) : null);
}
$('#rp-previa').addEventListener('click', intentar(async () => {
  const plan = await api(`/inventarios/${estado.invId}/repartir`, { method: 'POST', body: { ...datosReparto(), vista_previa: 1 } });
  pintarPlan(plan, 'Vista previa (todavía no se asigna nada):');
}));
$('#form-repartir').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  const cuerpo = datosReparto();
  const previa = await api(`/inventarios/${estado.invId}/repartir`, { method: 'POST', body: { ...cuerpo, vista_previa: 1 } });
  if (!confirm(`¿Repartir ${previa.grupos.reduce((a, g) => a + g.pasillos.length, 0)} pasillo(s) entre ${previa.grupos.length} operador(es)? Cada uno recibe su enlace.`)) return;
  const r = await api(`/inventarios/${estado.invId}/repartir`, { method: 'POST', body: cuerpo });
  pintarPlan(r, '✓ Repartido. Ahora envía los enlaces ("Copiar todos los enlaces").');
  await Promise.all([cargarResumen(), cargarOperadores()]);
  avisar('Pasillos repartidos y enlaces creados', 'ok');
}));

// ---------- Cruce y reconteos ----------
function llenarSelectPasillos() {
  const r = estado.resumen;
  const actual = $('#cr-pasillo').value;
  const grupos = new Map();
  r.pasillos.forEach((p) => { if (!grupos.has(p.seccion)) grupos.set(p.seccion, []); grupos.get(p.seccion).push(p); });
  const opciones = [...grupos.entries()].map(([s, lista]) =>
    h('optgroup', { label: s }, ...lista.map((p) => h('option', { value: p.id }, `${p.codigo} — ${ESTADOS[p.estado][0]}`))));
  poner($('#cr-pasillo'), ...opciones);
  poner($('#tt-planilla'), h('option', { value: 'todas' }, 'Todos los pasillos'), ...opciones.map((o) => o.cloneNode(true)));
  const conDif = r.pasillos.find((p) => p.estado === 'diferencias');
  $('#cr-pasillo').value = actual || (conDif ? conDif.id : r.pasillos[0]?.id);
  poner($('#rc-persona'), 
    h('option', { value: '' }, '— Elegir —'),
    ...r.participantes.map((p) => h('option', { value: p.id }, `${p.nombre} (${ESTADO_PERSONA[p.estado][0]})`)),
    h('option', { value: 'nuevo' }, '+ Persona nueva')
  );
}

async function cargarCruce() {
  const pid = Number($('#cr-pasillo').value);
  if (!pid || !estado.invId) return;
  const c = await api(`/inventarios/${estado.invId}/cruce/${pid}`);
  estado.cruce = c;
  const res = c.resumen;
  poner($('#cr-cabecera'), h('div', { class: 'cabecera-cruce' },
    h('strong', {}, c.pasillo.nombre), chipEstado(c.estado),
    h('span', { class: 'tenue' }, c.conto ? `Contó: ${c.conto.persona}` : 'Sin conteo'),
    h('span', { class: 'tenue' }, c.verifico ? `Verificó: ${c.verifico.persona}${c.verifico.estado !== 'terminada' ? ' (en curso)' : ''}` : 'Sin verificación'),
    ...c.reconteos.map((r) => h('span', { class: 'chip aviso' }, `Reconteo: ${r.persona}${r.estado === 'terminada' ? ' ✓' : ''}`)),
    h('span', { class: 'chip ok' }, `${res.ok + res.resuelto + res.ajustado} cuadran`),
    res.diferencia + res.revisar ? h('span', { class: 'chip error' }, `${res.diferencia + res.revisar} diferencias`) : null,
    h('span', { class: 'tenue' }, `Total: ${c.colores.map((col) => `${col.nombre.replace('Pallet ', '')} ${c.totales[col.codigo]}`).join(' · ')} · ${resumenUnidades(c)}`)
  ));
  pintarObsPasillo(c);
  pintarFilasCruce();
  $('#cr-reconteo').hidden = estado.resumen.inventario.estado !== 'en_curso';
}

function pintarObsPasillo(c) {
  const area = h('textarea', { id: 'cr-nota', rows: 2, maxlength: 1000, placeholder: 'Observación del administrador sobre este pasillo (opcional)' });
  // si el admin estaba escribiendo en este pasillo, la actualización automática no le borra el texto
  const sucia = estado.notaSucia?.pid === c.pasillo.id ? estado.notaSucia.texto : null;
  area.value = sucia ?? c.nota_admin ?? '';
  area.addEventListener('input', () => { estado.notaSucia = { pid: c.pasillo.id, texto: area.value }; });
  poner($('#cr-obs'),
    h('strong', {}, `📝 Observaciones de ${c.pasillo.nombre}`),
    c.observaciones.length
      ? h('ul', { class: 'obs-lista' }, ...c.observaciones.map((o) => h('li', {}, h('strong', {}, `${o.persona} (${o.tipo}):`), o.texto)))
      : h('span', { class: 'tenue pequeno' }, 'Quienes contaron no escribieron observaciones.'),
    h('label', { for: 'cr-nota', class: 'pequeno' }, 'Tu observación'),
    area,
    h('div', {}, h('button', { class: 'boton chico secundario', type: 'button', onclick: intentar(async () => {
      estado.cruce = await api(`/inventarios/${estado.invId}/pasillos/${c.pasillo.id}/observacion`, { method: 'PUT', body: { texto: area.value } });
      estado.notaSucia = null;
      avisar('Observación guardada', 'ok');
      await cargarResumen();
    }) }, 'Guardar observación')));
}

function pintarFilasCruce() {
  const c = estado.cruce;
  if (!c) return;
  const todo = $('#cr-todo').checked;
  const nombreColor = Object.fromEntries(c.colores.map((x) => [x.codigo, x.nombre.replace('Pallet ', '')]));
  const filas = c.filas.filter((f) => todo || !['ok', 'pendiente', 'sin_verificar', 'verificando'].includes(f.estado));
  const marcable = (f) => f.estado === 'diferencia' || f.estado === 'revisar';
  poner($('#cr-tabla tbody'), 
    ...(filas.length ? filas.map((f) =>
      h('tr', { class: marcable(f) ? 'fila-dif' : '' },
        h('td', {}, marcable(f) ? h('input', { type: 'checkbox', dataset: { celda: `${f.modulo}|${f.color}` }, 'aria-label': `Recontar ${f.modulo} ${f.color}` }) : ''),
        h('td', {}, h('strong', {}, f.modulo)),
        h('td', { class: `c-${f.color}` }, h('i', { class: 'punto' }), ' ', nombreColor[f.color] || f.color),
        h('td', { class: 'num' }, f.conteo ?? '—'),
        h('td', { class: 'num' }, f.verificacion ?? '—'),
        h('td', { class: 'num' }, f.reconteos.length ? f.reconteos.join(' / ') : '—'),
        h('td', { class: 'num' }, h('strong', {}, f.final ?? '—')),
        h('td', {}, chipEstado(f.estado), f.motivo ? h('small', { class: 'tenue', style: 'display:block' }, f.motivo) : null),
        h('td', {}, f.conteo !== null && estado.resumen.inventario.estado !== 'cerrado'
          ? h('button', { class: 'boton chico texto', type: 'button', onclick: () => aceptarValor(f) }, 'Fijar valor') : null)
      )) : [h('tr', {}, h('td', { colspan: 9, class: 'tenue' }, c.estado === 'cuadrado' ? 'Todo cuadra en este pasillo ✓' : 'No hay diferencias para mostrar. Marca "Ver todas las casillas" para ver el detalle.'))])
  );
}

const aceptarValor = intentar(async (f) => {
  const sugerido = f.final ?? f.reconteos.at(-1) ?? f.verificacion ?? f.conteo;
  const valor = prompt(`Valor final para módulo ${f.modulo} (${f.color}).\nConteo ${f.conteo ?? '—'} · Verificación ${f.verificacion ?? '—'} · Reconteo ${f.reconteos.join('/') || '—'}`, sugerido ?? '');
  if (valor === null) return;
  const motivo = prompt('Motivo (queda en el informe):', 'Verificado por el administrador');
  if (!motivo) return;
  estado.cruce = await api(`/inventarios/${estado.invId}/resoluciones`, { method: 'POST', body: { pasillo_id: f.pasillo_id ?? estado.cruce.pasillo.id, modulo: f.modulo, color: f.color, valor: Number(valor), motivo } });
  avisar('Valor fijado', 'ok');
  await cargarResumen();
});

$('#cr-pasillo').addEventListener('change', intentar(cargarCruce));
$('#cr-todo').addEventListener('change', pintarFilasCruce);
$('#cr-marcar-todo').addEventListener('change', (e) => $$('#cr-tabla tbody input[type=checkbox]').forEach((i) => (i.checked = e.target.checked)));
$('#rc-persona').addEventListener('change', (e) => { $('#rc-nuevo-env').hidden = e.target.value !== 'nuevo'; });
$('#btn-reconteo').addEventListener('click', intentar(async () => {
  const sel = $('#rc-persona').value;
  if (!sel) return avisar('Elige quién hace el reconteo', 'error');
  const celdas = $$('#cr-tabla tbody input[type=checkbox]:checked').map((i) => i.dataset.celda);
  const cuerpo = { pasillo_id: estado.cruce.pasillo.id, celdas: celdas.length ? celdas : undefined };
  if (sel === 'nuevo') cuerpo.nombre = $('#rc-nuevo').value.trim();
  else cuerpo.participante_id = Number(sel);
  const r = await api(`/inventarios/${estado.invId}/reconteos`, { method: 'POST', body: cuerpo });
  await cargarResumen();
  const p = estado.resumen.participantes.find((x) => x.id === r.participante.id);
  if (p.estado === 'activo') avisar(`Reconteo asignado a ${p.nombre}: le aparece en su celular en unos segundos.`, 'ok');
  else mostrarEnlace(p, `Reconteo de ${r.asignacion.celdas.length} casilla(s) en ${estado.cruce.pasillo.nombre}.`);
}));

// ---------- Totales, Excel e impresión ----------
function pintarTotales() {
  const r = estado.resumen;
  const cols = r.colores;
  poner($('#tt-global'), 
    ...cols.map((c) => contador(c.nombre, fmt(r.global.totales[c.codigo]), `var(--pallet-${c.codigo}, ${c.hex})`)),
    contador('Total estibas CEDI', fmt(r.global.total), 'var(--azul-marca)')
  );
  const celda = (x, c) => h('td', { class: 'num' }, x.colores.includes(c.codigo) ? fmt(x.totales[c.codigo]) : '');
  const cab = (primero, extra = []) => h('thead', {}, h('tr', {}, h('th', {}, primero), ...cols.map((c) => h('th', { class: 'num' }, c.nombre.replace('Pallet ', ''))), h('th', { class: 'num' }, 'Total estibas'), ...extra.map((x) => h('th', {}, x))));
  poner($('#tt-secciones'), 
    cab('Sección', ['Cuadrados']),
    h('tbody', {}, ...r.secciones.map((s) => h('tr', {}, h('td', {}, s.nombre), ...cols.map((c) => celda(s, c)), h('td', { class: 'num' }, h('strong', {}, fmt(s.total))), h('td', {}, `${s.cuadrados}/${s.pasillos}`)))),
    h('tfoot', {}, h('tr', {}, h('td', {}, 'TOTAL'), ...cols.map((c) => h('td', { class: 'num' }, fmt(r.global.totales[c.codigo]))), h('td', { class: 'num' }, fmt(r.global.total)), h('td', {}, '')))
  );
  poner($('#tt-pasillos'), 
    cab('Pasillo', ['Estado']),
    h('tbody', {}, ...r.pasillos.map((p) => h('tr', {}, h('td', {}, `${p.codigo}`, h('small', { class: 'tenue' }, ` ${p.seccion}`)), ...cols.map((c) => celda(p, c)), h('td', { class: 'num' }, h('strong', {}, fmt(p.total))), h('td', {}, chipEstado(p.estado)))))
  );
}

$('#btn-excel').addEventListener('click', intentar(async () => {
  const elaboro = $('#tt-elaboro').value.trim();
  avisar('Preparando Excel…');
  const archivo = await api(`/inventarios/${estado.invId}/excel${elaboro ? `?elaboro=${encodeURIComponent(elaboro)}` : ''}`, { blob: true });
  await NUBE.descargar(archivo, `${estado.resumen.inventario.nombre}.xlsx`);
}));

$('#btn-imprimir').addEventListener('click', intentar(async () => {
  const sel = $('#tt-planilla').value;
  const ids = sel === 'todas' ? estado.resumen.pasillos.map((p) => p.id) : [Number(sel)];
  avisar('Preparando planillas…');
  const cruces = [];
  for (const id of ids) cruces.push(await api(`/inventarios/${estado.invId}/cruce/${id}`));
  poner($('#impresion'), ...cruces.map(hojaPlanilla));
  window.print();
}));

// Planilla con el mismo formato del papel: un bloque por color, columnas de 10 módulos
function hojaPlanilla(c) {
  const fecha = estado.resumen.inventario.fecha.split('-').reverse().join('/');
  const valor = new Map(c.filas.map((f) => [`${f.modulo}|${f.color}`, f.final ?? f.conteo]));
  const grupos = [];
  for (let i = 0; i < c.modulos.length; i += 10) grupos.push(c.modulos.slice(i, i + 10));
  const elaboro = $('#tt-elaboro').value.trim();
  return h('div', { class: 'hoja' },
    h('div', { class: 'hoja-cab' },
      h('h1', {}, TITULO_PLANILLA),
      h('span', {}, `PASILLO ${c.pasillo.codigo}`),
      h('span', { class: 'c' }, `CONTEO: ${c.estado === 'cuadrado' ? 'FINAL' : 'PROVISIONAL'}`),
      h('span', { class: 'd' }, `FECHA: ${fecha}`)),
    ...c.colores.map((col) =>
      h('div', { class: 'bloque' },
        h('div', { class: 'bloque-tit' }, `${col.nombre.toUpperCase()}  TOTAL: ${c.totales[col.codigo]}`),
        h('div', { class: 'bloque-cols' }, ...grupos.map((g) =>
          h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'MODULO'), h('th', {}, 'CONTEO'))),
            h('tbody', {}, ...g.map((m) => h('tr', {}, h('td', {}, m), h('td', {}, valor.get(`${m}|${col.codigo}`) ?? ''))))))))),
    h('div', { class: 'obs-hoja' }, h('strong', {}, 'OBSERVACIONES: '),
      [...c.observaciones.map((o) => `${o.persona} (${o.tipo}): ${o.texto}`), c.nota_admin ? `Admin: ${c.nota_admin}` : null].filter(Boolean).join(' · ') || '______________________________________________'),
    h('div', { class: 'firma' },
      h('span', {}, `REALIZÓ: ${c.conto?.persona || '________________'}`),
      h('span', {}, `VERIFICÓ: ${c.verifico?.persona || '________________'}`),
      h('span', {}, `ELABORÓ: ${elaboro || '________________'}`))
  );
}

// ---------- Configuración de pasillos ----------
function pintarItems() {
  const cfg = estado.config;
  estilosItems(cfg.items);
  const UNIDAD = { estiba: 'estiba', canastilla: 'no es estiba' };
  poner($('#cf-items'), ...cfg.items.map((c) => h('span', { class: `item c-${c.codigo}${c.activo ? '' : ' oculto'}` },
    h('i', { class: 'punto' }),
    h('strong', {}, c.nombre),
    h('small', {}, `${UNIDAD[c.unidad]}${c.activo ? '' : ' · oculto'}`),
    h('input', { type: 'color', value: c.hex, 'aria-label': `Color de ${c.nombre}`, style: 'width:38px;height:32px;min-height:0;padding:0;border:0;background:none',
      onchange: intentar(async (e) => { await api(`/items/${c.codigo}`, { method: 'PUT', body: { hex: e.target.value } }); await recargarConfig(); }) }),
    h('button', { class: 'boton chico texto', type: 'button', onclick: intentar(async () => {
      if (c.activo && !confirm(`¿Ocultar "${c.nombre}"? Deja de salir en las planillas y en los totales (lo contado no se borra).`)) return;
      await api(`/items/${c.codigo}`, { method: 'PUT', body: { activo: c.activo ? 0 : 1 } });
      await recargarConfig();
      avisar(`${c.nombre}: ${c.activo ? 'oculto' : 'visible otra vez'}`, 'ok');
    }) }, c.activo ? 'Ocultar' : 'Mostrar'))));
  poner($('#ni-secciones'), ...cfg.secciones.map((s) => h('label', { class: 'opcion' },
    h('input', { type: 'checkbox', value: s.id }), h('span', {}, s.nombre))));
}

async function recargarConfig() {
  estado.config = await api('/config');
  pintarConfig();
  await cargarResumen();
}

$('#form-item').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  const secciones = $$('#ni-secciones input:checked').map((i) => Number(i.value));
  if (!secciones.length && !confirm('No marcaste secciones: el ítem se crea pero no saldrá en ninguna planilla hasta que lo marques en "Qué se cuenta". ¿Seguir?')) return;
  const item = await api('/items', { method: 'POST', body: { nombre: $('#ni-item').value, hex: $('#ni-hex').value, unidad: $('#ni-unidad').value, secciones } });
  $('#ni-item').value = '';
  await recargarConfig();
  avisar(`"${item.nombre}" agregado${secciones.length ? ': ya sale como columna en esas planillas' : ''}`, 'ok');
}));

function pintarConfig() {
  const cfg = estado.config;
  pintarItems();
  poner($('#np-seccion'), ...cfg.secciones.map((s) => h('option', { value: s.id }, s.nombre)));
  poner($('#cf-secciones'), ...cfg.secciones.map((s) =>
    h('div', {}, h('h2', {}, s.nombre),
      h('div', { class: 'que-se-cuenta' },
        h('span', { class: 'tenue' }, 'Qué se cuenta:'),
        ...cfg.colores.map((c) => h('label', { class: `opcion c-${c.codigo}` },
          h('input', { type: 'checkbox', value: c.codigo, checked: s.conteos.includes(c.codigo), dataset: { seccion: s.id } }),
          h('span', {}, h('i', { class: 'punto' }), ' ', c.nombre))),
        h('button', { class: 'boton chico secundario', type: 'button', onclick: intentar(async () => {
          const conteos = $$(`#cf-secciones input[data-seccion="${s.id}"]:checked`).map((i) => i.value);
          await api(`/secciones/${s.id}`, { method: 'PUT', body: { conteos } });
          estado.config = await api('/config');
          pintarConfig();
          await cargarResumen();
          avisar(`${s.nombre}: guardado`, 'ok');
        }) }, 'Guardar')),
      h('div', { class: 'tabla-env' }, h('table', { class: 'tabla cf-tabla' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Código'), h('th', {}, 'Nombre'), h('th', {}, 'Módulo final'), h('th', {}, 'Lista especial (opcional)'), h('th', {}, 'Módulos'), h('th', {}, 'Activo'), h('th', {}, ''))),
        h('tbody', {}, ...s.pasillos.map((p) => {
          const nombre = h('input', { value: p.nombre, maxlength: 40, 'aria-label': 'Nombre' });
          const final = h('input', { type: 'number', min: 1, max: 999, value: p.modulo_final, style: 'width:90px', 'aria-label': 'Módulo final' });
          const lista = h('input', { value: p.modulos_lista || '', placeholder: 'ej. 001,002,004', 'aria-label': 'Lista de módulos' });
          const activo = h('input', { type: 'checkbox', checked: Boolean(p.activo), style: 'width:20px;height:20px;min-height:0', 'aria-label': 'Activo' });
          return h('tr', {},
            h('td', {}, p.codigo), h('td', {}, nombre), h('td', {}, final), h('td', {}, lista),
            h('td', { class: 'tenue' }, `${p.total_modulos} (${p.primer_modulo}–${p.ultimo_modulo})`), h('td', {}, activo),
            h('td', {}, h('button', { class: 'boton chico secundario', type: 'button', onclick: intentar(async () => {
              await api(`/pasillos/${p.id}`, { method: 'PUT', body: { nombre: nombre.value, modulo_final: Number(final.value), modulos_lista: lista.value, activo: activo.checked ? 1 : 0 } });
              estado.config = await api('/config');
              pintarConfig();
              await cargarResumen();
              avisar(`${p.codigo} guardado`, 'ok');
            }) }, 'Guardar')));
        })))))));
}

$('#form-pasillo').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  await api('/pasillos', { method: 'POST', body: { seccion_id: Number($('#np-seccion').value), codigo: $('#np-codigo').value, nombre: $('#np-nombre').value, modulo_final: Number($('#np-final').value) } });
  estado.config = await api('/config');
  e.target.reset();
  pintarConfig();
  await cargarResumen();
  avisar('Pasillo agregado', 'ok');
}));

// ---------- Aura: asistente del inventario (siempre bajo el mando del administrador) ----------
const aura = {
  historial: (() => { try { return JSON.parse(sessionStorage.getItem('aura-historial') || '[]'); } catch { return []; } })(),
  config: null, pensando: false, propuestas: { pendientes: [], recientes: [] },
};
const guardarHistorial = () => sesion.guardar('aura-historial', JSON.stringify(aura.historial.slice(-30)));
const SUGERENCIAS = [
  '¿Cómo va el inventario?',
  'Revisa si hay problemas en la app',
  '¿Qué pasillos tienen diferencias y quién debería recontarlos?',
  '¿Quién falta por contar?',
  '¿Cómo hago un reconteo?',
  'Un operador dice que su enlace no abre',
];
const ACCION = {
  proponer_enlace_nuevo: 'Enlace nuevo', proponer_asignacion: 'Asignar pasillo', proponer_quitar_asignacion: 'Quitar asignación',
  proponer_reconteo: 'Reconteo', proponer_fijar_valor: 'Fijar valor', proponer_observacion_pasillo: 'Observación',
  proponer_cambio_pasillo: 'Cambiar pasillo', proponer_finalizar_persona: 'Finalizar persona', proponer_estado_inventario: 'Estado del inventario',
  proponer_item: 'Ítem nuevo', proponer_editar_archivo: 'Corregir código', proponer_repartir: 'Armar / repartir inventario',
};

async function cargarAura({ todo = false } = {}) {
  const tareas = [api('/aura/propuestas').then((p) => (aura.propuestas = p)), api(`/aura/vigilantes${estado.invId ? `?inventario=${estado.invId}` : ''}`).then((v) => (aura.vig = v)).catch(() => {})];
  if (todo || !aura.config) tareas.push(api('/aura/config').then((c) => (aura.config = c)));
  if (todo) tareas.push(api('/aura/notas').then(pintarNotasAura), api('/aura/cambios').then(pintarCambiosAura), api('/aura/respuestas').then(pintarRespuestasAura));
  await Promise.all(tareas);
  pintarEstadoAura();
  pintarPropuestas();
  pintarVigilantes();
  if (todo) pintarChat();
}

// ---------- Agentes vigilantes ----------
const NIVEL = { critico: ['⛔', 'Grave'], aviso: ['⚠', 'Atención'], info: ['ℹ', 'Aviso'] };
function pintarVigilantes() {
  const v = aura.vig;
  if (!v) return;
  poner($('#vig-agentes'), ...v.agentes.map((a) => h('div', { class: 'vig-agente', title: a.hace },
    h('span', { class: 'ic', 'aria-hidden': 'true' }, a.icono), h('strong', {}, a.nombre),
    h('span', { class: `chip ${a.abiertas ? 'aviso' : 'ok'}` }, a.abiertas ? `${a.abiertas} alerta(s)` : 'Todo bien'))));
  $('#vig-auto').checked = Boolean(v.config.auto_reconteo);
  const cuando = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—');
  $('#vig-estado').textContent = `Revisan cada minuto mientras este panel está abierto y el inventario en curso. Última revisión: ${cuando(v.ultima_revision)}.`;
  const graves = v.alertas.filter((a) => a.nivel !== 'info');
  $('#aura-insignia').hidden = !(aura.propuestas.pendientes.length + graves.length);
  $('#aura-insignia').textContent = aura.propuestas.pendientes.length + graves.length;
  const tarjetaAlerta = (a) => {
    const ag = v.agentes.find((x) => x.id === a.agente);
    return h('div', { class: `alerta-vig ${a.nivel}` },
      h('span', {}, h('strong', {}, `${NIVEL[a.nivel][0]} ${ag?.icono || ''} `), a.mensaje),
      a.sugerencia ? h('small', {}, `💡 ${a.sugerencia}`) : null,
      h('div', { class: 'botones' },
        a.arreglo ? h('button', { class: 'boton chico', type: 'button', onclick: intentar(async () => {
          const p = await api(`/aura/alertas/${a.id}/proponer`, { method: 'POST' });
          avisar(`Propuesta #${p.id} lista: revísala y aprueba`, 'ok');
          await cargarAura();
        }) }, 'Proponer arreglo') : null,
        h('button', { class: 'boton chico texto', type: 'button', onclick: intentar(async () => {
          await api(`/aura/alertas/${a.id}/descartar`, { method: 'POST' });
          await cargarAura();
        }) }, 'Descartar')));
  };
  const primeras = v.alertas.slice(0, 5);
  const resto = v.alertas.slice(5);
  poner($('#vig-alertas'), ...(v.alertas.length ? [...primeras.map(tarjetaAlerta),
    resto.length ? h('details', {}, h('summary', { class: 'pequeno' }, `${resto.length} alerta(s) más`), ...resto.map(tarjetaAlerta)) : null]
    : [h('p', { class: 'tenue pequeno' }, '✓ Los agentes no ven problemas.')]));
}
$('#vig-revisar').addEventListener('click', intentar(async () => {
  aura.vig = await api('/aura/vigilantes/revisar', { method: 'POST', body: { inventario_id: estado.invId } });
  pintarVigilantes();
  avisar('Revisión hecha', 'ok');
  await cargarResumen();
}));
$('#vig-respaldar').addEventListener('click', intentar(async () => {
  const r = await api('/aura/vigilantes/respaldar', { method: 'POST' });
  avisar(r.mensaje || 'Los datos quedan guardados en la nube', 'ok');
  await cargarAura();
}));
$('#vig-auto').addEventListener('change', intentar(async (e) => {
  if (e.target.checked && !confirm('¿Activar el modo automático? El Supervisor asignará él mismo los reconteos de las diferencias a una persona que no participó en ese pasillo. Nunca borra ni cambia lo contado. Todo queda en el historial de propuestas.')) { e.target.checked = false; return; }
  await api('/aura/vigilantes', { method: 'PUT', body: { auto_reconteo: e.target.checked } });
  await cargarAura();
}));

function pintarEstadoAura() {
  const c = aura.config;
  const n = aura.propuestas.pendientes.length;
  $('#aura-insignia').hidden = !n;
  $('#aura-insignia').textContent = n;
  if (!c) return;
  $('#aura-estado').className = 'chip ok';
  $('#aura-estado').textContent = 'Trabaja con Copilot';
}

function pintarChat() {
  const caja = $('#aura-mensajes');
  if (!aura.historial.length) {
    poner(caja, h('div', { class: 'aura-vacio' }, '👋 Hola, soy Aura. Pregúntame por el inventario o por cómo usar la app. Lo que no sepa se lo preguntamos juntos a THEMENDO en Copilot.'));
  } else {
    poner(caja, ...aura.historial.map((m, i) => h('div', { class: `msg ${m.role === 'user' ? 'yo' : m.error ? 'error' : 'aura'}` },
      m.rapida ? h('span', { class: 'rapida' }, `⚡ Al instante · ${m.rapida.titulo}`) : null,
      m.content,
      accionesMensaje(m, i),
      cajaCopilot(m),
      m.propuestas?.length ? h('div', {}, ...m.propuestas.map((p) => h('span', { class: 'chip aviso prop-ref' }, `Propuesta #${p.id}: ${ACCION[p.accion] || p.accion}`))) : null,
      m.aprendido?.length ? h('span', { class: 'usadas' }, `🧠 Aprendió: ${m.aprendido.join(' · ')}`) : null,
      m.consultas?.length ? h('span', { class: 'usadas' }, `Revisó: ${[...new Set(m.consultas)].map((x) => x.replace(/_/g, ' ')).join(', ')}`) : null)));
  }
  if (aura.pensando) caja.append(h('div', { class: 'msg aura' }, 'Aura está pensando…'));
  caja.scrollTop = caja.scrollHeight;
  poner($('#aura-sugerencias'), ...(aura.historial.length > 2 ? [] : SUGERENCIAS.map((t) => h('button', { type: 'button', onclick: () => enviarAura(t) }, t))));
  $('#aura-enviar').disabled = aura.pensando;
}

// Botones bajo cada respuesta: preguntar a la IA (si fue rápida) o guardarla para responder al instante (si fue de la IA)
function accionesMensaje(m, i) {
  if (m.role !== 'assistant' || m.error || aura.pensando) return null;
  const pregunta = [...aura.historial.slice(0, i)].reverse().find((x) => x.role === 'user')?.content;
  if (!pregunta) return null;
  if (m.rapida) {
    return i === aura.historial.length - 1 ? h('div', { class: 'msg-acc' },
      h('button', { class: 'boton texto chico', type: 'button', onclick: () => enviarAura(pregunta, { forzarIA: true, repetir: true }) }, '✨ Preguntar a THEMENDO (Copilot)')) : null;
  }
  if (m.copilot || m.guardada || !m.content || m.content.startsWith('(')) return null;
  return h('div', { class: 'msg-acc' }, h('button', { class: 'boton texto chico', type: 'button', onclick: intentar(async () => {
    await api('/aura/respuestas', { method: 'POST', body: { pregunta, respuesta: m.content } });
    m.guardada = true;
    guardarHistorial();
    pintarChat();
    pintarRespuestasAura(await api('/aura/respuestas'));
    avisar('Guardada: la próxima vez Aura la contesta al instante', 'ok');
  }) }, '⚡ Guardar para responder al instante'));
}

async function enviarAura(texto, { forzarIA = false, repetir = false } = {}) {
  texto = String(texto || '').trim();
  if (!texto || aura.pensando) return;
  if (!repetir) aura.historial.push({ role: 'user', content: texto });
  aura.pensando = true;
  pintarChat();
  try {
    // A la IA no se le mandan las respuestas rápidas largas (ahorra cupo); sí la pregunta
    const mensajes = aura.historial.filter((m) => !m.error && !(m.rapida && forzarIA)).map((m) => ({ role: m.role, content: m.content }));
    const r = await api('/aura/chat', { method: 'POST', body: { mensajes, inventario_id: estado.invId, forzar_ia: forzarIA ? 1 : undefined } });
    aura.historial.push({ role: 'assistant', content: r.respuesta, rapida: r.rapida, propuestas: r.propuestas, consultas: r.consultas, aprendido: r.aprendido, copilot: r.copilot });
    if (r.aprendido?.length) api('/aura/notas').then(pintarNotasAura).catch(() => {});
    if (r.propuestas?.length) await cargarAura();
  } catch (e) {
    aura.historial.push({ role: 'assistant', content: e.message, error: true });
    if (e.status === 409) abrirConfigAura();
  } finally {
    aura.pensando = false;
    guardarHistorial();
    pintarChat();
  }
}

// Puente con THEMENDO en Copilot: copia la pregunta con el estado del inventario, abre Copilot
// y la respuesta que se pegue queda guardada para contestarla al instante la próxima vez.
function cajaCopilot(m) {
  if (!m.copilot || m.role !== 'assistant') return null;
  if (m.copilot.guardada) return h('span', { class: 'usadas' }, '✓ Respuesta de Copilot guardada: la próxima vez la contesto al instante.');
  const area = h('textarea', { maxlength: 6000, placeholder: 'Pega aquí lo que respondió THEMENDO…', 'aria-label': 'Respuesta de Copilot' });
  return h('div', { class: 'copilot-caja' },
    h('div', { class: 'botones' },
      h('button', { class: 'boton chico', type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(m.copilot.texto); avisar('Pregunta copiada: pégala en Copilot', 'ok'); }
        catch { prompt('Copia esto y pégalo en Copilot:', m.copilot.texto); }
        window.open('https://copilot.microsoft.com/', '_blank', 'noopener');
      } }, '🤖 Preguntar a THEMENDO en Copilot')),
    area,
    h('button', { class: 'boton chico secundario', type: 'button', onclick: intentar(async () => {
      const respuesta = area.value.trim();
      if (respuesta.length < 5) return avisar('Pega primero la respuesta de Copilot', 'error');
      await api('/aura/copilot', { method: 'POST', body: { pregunta: m.copilot.pregunta, respuesta } });
      m.copilot.guardada = true;
      aura.historial.push({ role: 'assistant', content: respuesta, rapida: { titulo: 'Respuesta de THEMENDO (Copilot)' } });
      guardarHistorial();
      pintarChat();
      pintarRespuestasAura(await api('/aura/respuestas'));
      avisar('Guardada: Aura ya lo sabe', 'ok');
    }) }, 'Guardar la respuesta de Copilot'));
}

$('#aura-form').addEventListener('submit', (e) => { e.preventDefault(); const t = $('#aura-texto').value; $('#aura-texto').value = ''; enviarAura(t); });
$('#aura-texto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#aura-form').requestSubmit(); } });
$('#aura-limpiar').addEventListener('click', () => { aura.historial = []; guardarHistorial(); pintarChat(); });

function pintarPropuestas() {
  const { pendientes, recientes } = aura.propuestas;
  const tarjeta = (p) => {
    const resuelta = p.estado !== 'pendiente';
    const codigo = p.accion === 'proponer_editar_archivo'
      ? h('details', {}, h('summary', { class: 'pequeno' }, `Ver cambio en ${p.datos.ruta}`),
        h('pre', {}, `— QUITA:\n${p.datos.buscar}\n\n+ PONE:\n${p.datos.reemplazar}`)) : null;
    return h('div', { class: `propuesta${resuelta ? ' resuelta' : ''}` },
      h('div', {}, h('strong', {}, `#${p.id} · ${ACCION[p.accion] || p.accion}`), ' ', resuelta ? chipPropuesta(p.estado) : null),
      h('span', {}, p.resumen),
      codigo,
      resuelta ? (p.resultado ? h('small', { class: 'tenue' }, p.resultado) : null) : h('div', { class: 'botones' },
        h('button', { class: 'boton chico ok', type: 'button', onclick: () => resolverPropuesta(p, 'aprobar') }, '✓ Aprobar'),
        h('button', { class: 'boton chico secundario', type: 'button', onclick: () => resolverPropuesta(p, 'rechazar') }, 'Rechazar')));
  };
  poner($('#aura-propuestas'),
    ...(pendientes.length ? pendientes.map(tarjeta) : [h('p', { class: 'tenue pequeno' }, 'No hay propuestas pendientes. Aura no cambia nada sin que tú lo apruebes aquí.')]),
    recientes.length ? h('details', {}, h('summary', { class: 'pequeno' }, `Historial (${recientes.length})`), ...recientes.map(tarjeta)) : null);
}
const chipPropuesta = (e) => h('span', { class: `chip ${e === 'aprobada' ? 'ok' : e === 'fallida' ? 'error' : 'gris'}` }, { aprobada: 'Aprobada', rechazada: 'Rechazada', fallida: 'Falló' }[e] || e);

const resolverPropuesta = intentar(async (p, accion) => {
  if (accion === 'aprobar' && p.accion === 'proponer_editar_archivo' && !confirm(`¿Aplicar el cambio en ${p.datos.ruta}? Se guarda una copia para poder deshacerlo.`)) return;
  const r = await api(`/aura/propuestas/${p.id}/${accion}`, { method: 'POST' });
  avisar(r.estado === 'fallida' ? `No se pudo: ${r.resultado}` : r.estado === 'aprobada' ? r.resultado : 'Propuesta rechazada', r.estado === 'fallida' ? 'error' : 'ok');
  aura.historial.push({ role: 'assistant', content: `(${r.estado === 'aprobada' ? '✓ Aprobaste' : r.estado === 'fallida' ? '✕ Falló' : 'Rechazaste'} la propuesta #${r.id}: ${r.resultado || r.resumen})` });
  guardarHistorial();
  await Promise.all([cargarAura({ todo: true }), cargarResumen()]);
});

function pintarNotasAura(lista) {
  poner($('#aura-notas'), ...(lista.length ? lista.map((n) => h('li', {},
    h('span', {}, n.texto, h('small', {}, `${n.tema} · ${n.creado_en.slice(0, 16)}`)),
    h('button', { class: 'boton texto chico', type: 'button', 'aria-label': 'Borrar nota', onclick: intentar(async () => {
      if (!confirm('¿Borrar esta nota? Aura la olvidará.')) return;
      await api(`/aura/notas/${n.id}`, { method: 'DELETE' });
      pintarNotasAura(await api('/aura/notas'));
    }) }, '×'))) : [h('li', {}, h('span', { class: 'tenue' }, 'Todavía no ha guardado nada.'))]));
}
$('#aura-nota-form').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  await api('/aura/notas', { method: 'POST', body: { texto: $('#aura-nota').value, tema: 'enseñado por el admin' } });
  $('#aura-nota').value = '';
  pintarNotasAura(await api('/aura/notas'));
  avisar('Aura lo aprendió', 'ok');
}));

function pintarRespuestasAura(lista) {
  $('#aura-resp-cuenta').textContent = `(${lista.length})`;
  poner($('#aura-respuestas'), ...(lista.length ? lista.map((r) => h('li', {},
    h('span', {}, r.pregunta, h('small', {}, `${r.fuente === 'aura' ? 'guardada por Aura' : r.fuente === 'copilot' ? 'traída de Copilot' : 'guardada por ti'} · usada ${r.usos} ${r.usos === 1 ? 'vez' : 'veces'}`)),
    h('button', { class: 'boton texto chico', type: 'button', 'aria-label': 'Borrar respuesta', onclick: intentar(async () => {
      if (!confirm('¿Borrar esta respuesta guardada?')) return;
      await api(`/aura/respuestas/${r.id}`, { method: 'DELETE' });
      pintarRespuestasAura(await api('/aura/respuestas'));
    }) }, '×'))) : [h('li', {}, h('span', { class: 'tenue' }, 'Toca "⚡ Guardar para responder al instante" bajo una respuesta de la IA.'))]));
}

function pintarCambiosAura(lista) {
  poner($('#aura-cambios'), ...(lista.length ? lista.map((c) => h('li', {},
    h('span', {}, c.archivo, h('small', {}, `${c.creado_en.slice(0, 16)}${c.propuesta_id ? ` · propuesta #${c.propuesta_id}` : ''}${c.deshecho ? ' · deshecho' : ''}`)),
    c.deshecho ? null : h('button', { class: 'boton chico secundario', type: 'button', onclick: intentar(async () => {
      if (!confirm(`¿Deshacer el cambio en ${c.archivo}? Vuelve como estaba antes.`)) return;
      const r = await api(`/aura/cambios/${c.id}/deshacer`, { method: 'POST' });
      avisar(r.reiniciar ? 'Cambio deshecho. Reinicia la app (APAGAR e INICIAR-INVENTARIO).' : 'Cambio deshecho. Recarga la página.', 'ok');
      pintarCambiosAura(await api('/aura/cambios'));
    }) }, 'Deshacer'))) : [h('li', {}, h('span', { class: 'tenue' }, 'Aura no ha cambiado ningún archivo.'))]));
}

// Configuración (servicio de IA y clave)
function abrirConfigAura() {
  const c = aura.config;
  if (!c) return;
  poner($('#ca-proveedor'), ...c.proveedores.map((p) => h('option', { value: p.id }, p.nombre)));
  $('#ca-proveedor').value = c.proveedor;
  $('#ca-modelo').value = c.modelo || '';
  $('#ca-url').value = c.url || '';
  $('#ca-clave').value = '';
  $('#ca-clave').placeholder = c.tiene_clave ? `Clave guardada (${c.clave_final}). Pega otra para cambiarla.` : 'Pega aquí la clave';
  $('#ca-activa').checked = c.activa;
  $('#ca-resultado').textContent = '';
  ayudaProveedor();
  $('#dlg-aura').showModal();
}
function ayudaProveedor() {
  const p = aura.config.proveedores.find((x) => x.id === $('#ca-proveedor').value);
  $('#ca-ayuda').textContent = p?.ayuda || '';
  $('#ca-clave').disabled = p && !p.necesita_clave;
  if (p && $('#ca-proveedor').value !== aura.config.proveedor) { $('#ca-modelo').value = p.modelo; $('#ca-url').value = p.url; }
}
$('#ca-proveedor').addEventListener('change', ayudaProveedor);
$('#aura-btn-config').addEventListener('click', intentar(async () => { aura.config = await api('/aura/config'); abrirConfigAura(); }));
$('#ca-cerrar').addEventListener('click', () => $('#dlg-aura').close());
async function guardarConfigAura() {
  aura.config = await api('/aura/config', { method: 'PUT', body: {
    proveedor: $('#ca-proveedor').value, modelo: $('#ca-modelo').value, url: $('#ca-url').value,
    clave: $('#ca-clave').value, activa: $('#ca-activa').checked ? 1 : 0,
  } });
  $('#ca-clave').value = '';
  pintarEstadoAura();
}
$('#form-aura').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  await guardarConfigAura();
  $('#dlg-aura').close();
  avisar('Aura configurada', 'ok');
}));
$('#ca-probar').addEventListener('click', intentar(async () => {
  $('#ca-resultado').textContent = 'Probando…';
  await guardarConfigAura();
  const r = await api('/aura/probar', { method: 'POST' });
  poner($('#ca-modelos'), ...r.modelos.map((m) => h('option', { value: m })));
  $('#ca-resultado').textContent = r.ok ? `✓ Conectada. Respondió: "${r.respuesta}"${r.modelos.length ? ` · ${r.modelos.length} modelos disponibles (elige en "Modelo")` : ''}` : `✕ ${r.error}`;
  $('#ca-resultado').style.color = r.ok ? 'var(--ok)' : 'var(--error)';
}));

// ---------- Navegación y actualización automática ----------
function irA(vista) {
  estado.vista = vista;
  $$('.pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.v === vista));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === `v-${vista}`));
  if (vista === 'cruce') intentar(cargarCruce)();
  if (vista === 'aura') intentar(() => cargarAura({ todo: true }))();
  if (vista === 'admins') intentar(cargarAdmins)();
}
$$('.pestanas button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.v)));

setInterval(() => {
  const escribiendo = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.querySelector('dialog[open]');
  const marcadas = document.querySelector('#cr-tabla tbody input:checked');
  if (estado.clave && estado.resumen?.inventario.estado === 'en_curso' && !escribiendo && !marcadas && estado.vista !== 'config') {
    cargarResumen().catch(() => {});
    // En la nube los vigilantes revisan cuando el panel lo pide: cada minuto (cada 4 vueltas de 15 s)
    if (++estado.vueltas % 4 === 0) api('/aura/vigilantes/revisar', { method: 'POST', body: { inventario_id: estado.invId } }).then((v) => { aura.vig = v; pintarVigilantes(); }).catch(() => {});
    else if (!aura.pensando) cargarAura().catch(() => {});
  }
}, 15000);

// ---------- Administradores (solo la cuenta principal) ----------
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
async function cargarAdmins() {
  const lista = await api('/administradores');
  poner($('#ad-lista'), ...(lista.length ? lista.map((a) => {
    const vencido = a.vence_en && new Date(a.vence_en) < new Date();
    return h('tr', {},
      h('td', {}, a.nombre),
      h('td', {}, vencido ? h('span', { class: 'chip error' }, 'VENCIDO') : fecha(a.vence_en)),
      h('td', {}, a.celular ? h('span', { class: 'chip ok' }, 'Amarrado') : h('span', { class: 'chip gris' }, 'Sin usar')),
      h('td', {}, a.ultimo_uso ? new Date(a.ultimo_uso).toLocaleString('es-CO') : '—'),
      h('td', {}, h('button', { class: 'boton chico texto', type: 'button', onclick: intentar(async () => {
        if (!confirm(`¿Quitar a ${a.nombre}? Su código deja de servir de inmediato.`)) return;
        await api(`/administradores/${a.id}`, { method: 'DELETE' });
        await cargarAdmins();
      }) }, 'Quitar')));
  }) : [h('tr', {}, h('td', { colspan: 5, class: 'tenue' }, 'Todavía no hay administradores.'))]));
}
$('#form-admin').addEventListener('submit', intentar(async (e) => {
  e.preventDefault();
  const r = await api('/administradores', { method: 'POST', body: { nombre: $('#ad-nombre').value, dias: Number($('#ad-dias').value) || 30 } });
  const texto = `Hola ${r.nombre}, quedaste como administrador del Inventario de estibas ATS R10.\n1. Abre: ${NUBE.PAGINA}\n2. Escribe tu código: ${r.codigo}\nSirve en un solo celular (el primero donde lo escribas) y vence el ${fecha(r.vence_en)}. No lo compartas.`;
  poner($('#ad-nuevo'),
    h('strong', {}, `Código de ${r.nombre} (se muestra solo esta vez):`),
    h('span', { class: 'codigo' }, r.codigo),
    h('small', { class: 'tenue' }, `Vence el ${fecha(r.vence_en)}. Sirve en un solo celular.`),
    h('div', { class: 'botones mt' }, h('a', { class: 'boton chico ok', href: `https://wa.me/?text=${encodeURIComponent(texto)}`, target: '_blank', rel: 'noopener' }, 'Enviar por WhatsApp')));
  $('#ad-nuevo').hidden = false;
  $('#form-admin').reset();
  await cargarAdmins();
}));

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
NUBE.acceso().then((a) => {
  if (!a) return salir();
  estado.acceso = a;
  return iniciarPanel();
}).catch((e) => salir(e.status === 401 ? e.message : `${e.message}. Revisa la señal y vuelve a entrar.`, { olvidar: e.status === 401 }));
