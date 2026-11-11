// App Paletizado 3D – CEDI ATS R10 Valledupar
// Pantallas: Inicio · Ubicaciones · Reubicar · Pedidos · Calcular palet · Ajustes
import { articuloDesdeFila } from './motor/articulo.js';
import { calcularIndices } from './motor/indice.js';
import { paletMono } from './motor/mono.js';
import { proponerReubicacion } from './motor/reubicacion.js';
import { simularPedido } from './motor/simulacion.js';
import { leerArchivo, aCSV } from './datos/importar.js';
import { guardar, leer, borrarTodo } from './datos/almacen.js';
import { dibujar3D, dibujarCapa, nivelesDe, colorDe } from './visor.js';
import { generarLayout, mezclar, estadoDe, subdividir, catalogo, revisarDatos, COLUMNAS, ZONAS } from './datos/layout.js';
import { diagnostico, responder } from './agente.js';

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
  guardar('ubicaciones', estado.filas.filter((f) => f.ESTADO !== 'SIN REVISAR' || f.SUBPOSICION));
}

function contexto() {
  return { filas: estado.filas, posiciones: estado.posiciones, propuesta: estado.propuesta, pedidos: estado.pedidos, palet: estado.palet, paletConfirmado: estado.paletConfirmado };
}

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

function descargar(nombre, texto, tipo = 'text/csv') {
  const blob = new Blob(['﻿' + texto], { type: `${tipo};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
    const total = estado.filas.filter((f) => f.ESTADO !== 'DIVIDIDA').length;
    const revisadas = estado.filas.filter((f) => f.ESTADO !== 'DIVIDIDA' && estadoDe(f) !== 'SIN REVISAR').length;
    const ocupadas = estado.posiciones.length;
    const completas = estado.posiciones.filter((p) => !p.faltan.length).length;
    const pedidosUnicos = new Set(estado.pedidos.map((p) => p.PEDIDO)).size;
    const porZona = zonas().map((z) => {
      const pz = estado.posiciones.filter((p) => p.fila.SECCION === z);
      return `<tr><td>${esc(z)}</td><td class="num">${fmt(estado.filas.filter((f) => f.SECCION === z && f.ESTADO !== 'DIVIDIDA').length)}</td><td class="num">${fmt(pz.length)}</td><td class="num">${fmt(pz.filter((p) => !p.faltan.length).length)}</td></tr>`;
    }).join('');
    return `
      ${estado.paletConfirmado ? '' : '<div class="aviso">Las medidas del palet (altura y peso máximos) son <b>de ejemplo</b>. Confírmalas con el CEDI en <b>Ajustes</b>.</div>'}
      <section class="tarjeta">
        <h2>1. Datos</h2>
        <p class="nota">Los datos de cada posición se toman en la pestaña <b>Tomar datos</b>. También puedes cargar la hoja "Ubicaciones CEDI" (.xlsx o CSV): se mezcla con lo ya tomado, posición por posición. Los pedidos de prueba se cargan igual.</p>
        <a class="boton" href="#" data-ir="tomar">Tomar datos</a> <a class="boton sec" href="#" data-ir="agente">Preguntar al agente</a>
        <input type="file" id="archivo" accept=".xlsx,.csv,.txt">
        <div id="resultadoImport"></div>
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
    const zona = estado.tomaZona || ZONAS[0].zona;
    const pasillos = ZONAS.find((z) => z.zona === zona)?.pasillos || [];
    const pas = pasillos.includes(estado.tomaPasillo) ? estado.tomaPasillo : pasillos[0];
    const filtro = estado.tomaFiltro || 'todas';
    const delPasillo = estado.filas.filter((f) => f.PASILLO === pas && f.ESTADO !== 'DIVIDIDA');
    const revisadas = delPasillo.filter((f) => estadoDe(f) !== 'SIN REVISAR').length;
    const lista = delPasillo.filter((f) => filtro === 'todas' || (filtro === 'pendientes' ? ['SIN REVISAR', 'INCOMPLETA'].includes(estadoDe(f)) : estadoDe(f) === 'COMPLETA'));
    const etiqueta = { 'SIN REVISAR': 'sin', VACIA: 'vac', INCOMPLETA: 'inc', COMPLETA: 'ok' };
    const filas = lista.map((f) => {
      const e = estadoDe(f);
      return `<button class="pos ${etiqueta[e]}" data-cod="${esc(f.CODIGO)}"><b>${esc(f.CODIGO)}</b><span>${e === 'VACIA' ? 'Vacía' : e === 'SIN REVISAR' ? 'Sin revisar' : esc(f.ARTICULO || f.CODIGO_ARTICULO || '')}${e === 'INCOMPLETA' ? ' · <i>faltan datos</i>' : ''}</span></button>`;
    }).join('');
    return `<section class="tarjeta">
      <h2>Tomar datos por posición</h2>
      <p class="nota">Recorre el pasillo en el orden de la ruta. Toca cada posición y registra el artículo que hay. Las vacías márcalas como vacías: no cuentan.</p>
      <div class="fila">
        <label>Zona<select id="tZona">${ZONAS.map((z) => `<option ${z.zona === zona ? 'selected' : ''}>${esc(z.zona)}</option>`).join('')}</select></label>
        <label>Pasillo<select id="tPasillo">${pasillos.map((x) => `<option ${x === pas ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label>Mostrar<select id="tFiltro"><option value="todas" ${filtro === 'todas' ? 'selected' : ''}>Todas</option><option value="pendientes" ${filtro === 'pendientes' ? 'selected' : ''}>Pendientes</option><option value="completas" ${filtro === 'completas' ? 'selected' : ''}>Completas</option></select></label>
      </div>
      <div class="barra-avance"><div style="width:${delPasillo.length ? Math.round((revisadas / delPasillo.length) * 100) : 0}%"></div></div>
      <p class="nota">Pasillo ${esc(pas)}: ${revisadas} de ${delPasillo.length} revisadas.</p>
      <div class="lista-pos">${filas || '<p class="nota">Nada que mostrar con este filtro.</p>'}</div>
    </section>
    <section class="tarjeta">
      <h2>Pasar los datos a la hoja</h2>
      <p class="nota">Copia todo lo tomado y pégalo en la hoja UBICACIONES (o guárdalo como respaldo).</p>
      <button class="boton sec" id="copiarToma">Copiar datos tomados</button><button class="boton sec" id="descargarToma">Descargar CSV</button>
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
      ${d.mejoras.length ? `<h3>Mejoras sugeridas</h3><ol class="mejoras">${d.mejoras.map((m) => `<li>${esc(m.texto)}</li>`).join('')}</ol>` : ''}
    </section>
    <section class="tarjeta">
      <h2>Pregúntale al agente</h2>
      <div class="rapidas">${['¿Cómo voy?', '¿Qué mejoras hay?', '¿Qué movimientos hago primero?', '¿Cómo tomo las medidas?', '¿Qué significa BASE, MEDIO y TOPE?']
        .map((q) => `<button class="boton sec" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="chat" id="chat">${chat || '<p class="nota">Ejemplos: "¿cómo voy en el pasillo 12?", "¿dónde va el aceite?", "¿qué movimientos hago en alimentos?"</p>'}</div>
      <form id="formChat" class="fila"><label>Tu pregunta<input id="pregunta" autocomplete="off" placeholder="Escribe aquí…"></label><button class="boton">Preguntar</button></form>
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
        <button class="boton" id="exportarPlan">Descargar plan (CSV)</button><button class="boton sec" id="copiarPlan">Copiar plan</button>
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

async function mostrarEstiba(cont, estiba) {
  const niveles = nivelesDe(estiba);
  cont.innerHTML = `
    <p class="nota">Estiba ${estiba.numero}: ${estiba.totalCajas} cajas · ${fmt(estiba.pesoTotal, 1)} kg · ${fmt(estiba.alturaTotal)} mm · ocupación ${fmt(estiba.usoVolumen * 100)} %${estiba.cgFuera ? ' · <b class="peor">centro de gravedad corrido</b>' : ''}</p>
    <div class="visor" id="visor3d"></div>
    <label>Armar hasta la caja <span id="nCaja">${estiba.totalCajas}</span><input type="range" id="rango" min="1" max="${estiba.totalCajas}" value="${estiba.totalCajas}"></label>
    <h3>Capas vistas desde arriba (número = orden de armado)</h3>
    <div class="capas">${niveles.map((n, i) => `<div><small>Capa ${i + 1} (desde ${n.desde} mm)</small><canvas class="capa" data-i="${i}"></canvas></div>`).join('')}</div>
    <div class="leyenda" id="leyenda"></div>`;
  await dibujar3D($('#visor3d', cont), estiba, estado.palet, estado.colores);
  cont.querySelectorAll('canvas.capa').forEach((c) => dibujarCapa(c, estiba, estado.palet, niveles[Number(c.dataset.i)], estado.colores));
  const vistos = new Map();
  estiba.cajas.forEach((c) => { if (!vistos.has(c.codigo)) vistos.set(c.codigo, c.nombre); });
  $('#leyenda', cont).innerHTML = [...vistos].map(([cod, nom]) => `<span><i style="background:${colorDe(cod, estado.colores)}"></i>${esc(nom)}</span>`).join('') + '<span><i style="background:#d62828"></i>Con sobrepeso</span>';
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
    if (lista[idx]) await mostrarEstiba($('#vistaEstiba'), lista[idx]);
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
  $('#resultadoPedido').innerHTML = `<h3>${pedidos.length} pedidos</h3>${tablaComparacion(suma(ra), rp.length ? suma(rp) : null)}<button class="boton sec" id="exportarPrueba">Descargar resultado (CSV)</button><button class="boton sec" id="copiarPrueba">Copiar resultado</button>`;
  const csv = () => aCSV(filas, Object.keys(filas[0] || {}).map((k) => [k, k]));
  $('#exportarPrueba').addEventListener('click', () => descargar('prueba-pedidos.csv', csv()));
  $('#copiarPrueba').addEventListener('click', () => copiar(csv()));
}


// ---------- Formulario de una posición ----------
function abrirFormulario(codigo) {
  const f = estado.filas.find((x) => x.CODIGO === codigo);
  if (!f) return;
  const cat = catalogo(estado.filas);
  const v = (k) => esc(f[k] ?? '');
  const opc = (k, valores) => valores.map((x) => `<button type="button" class="opcion ${String(f[k] ?? '').toUpperCase() === x ? 'sel' : ''}" data-campo="${k}" data-valor="${x}">${x === 'SI' ? 'SÍ' : x}</button>`).join('');
  const fondo = document.createElement('div');
  fondo.className = 'dialogo';
  fondo.innerHTML = `<form class="caja formulario" id="formPos">
    <h2>${esc(f.CODIGO)} <small>${esc(f.SECCION)} · ruta ${esc(f.SECUENCIA_RUTA)}</small></h2>
    <datalist id="listaArt">${[...cat.values()].map((a) => `<option value="${esc(a.CODIGO_ARTICULO)}">${esc(a.ARTICULO)}</option>`).join('')}</datalist>
    <label>Código del artículo<input name="CODIGO_ARTICULO" list="listaArt" inputmode="numeric" value="${v('CODIGO_ARTICULO')}" autocomplete="off"></label>
    <label>Artículo<input name="ARTICULO" value="${v('ARTICULO')}" autocomplete="off"></label>
    <div class="fila">
      <label>Largo A (mm)<input name="LARGO_A_MM" type="number" inputmode="numeric" value="${v('LARGO_A_MM')}"></label>
      <label>Ancho B (mm)<input name="ANCHO_B_MM" type="number" inputmode="numeric" value="${v('ANCHO_B_MM')}"></label>
      <label>Alto H (mm)<input name="ALTO_H_MM" type="number" inputmode="numeric" value="${v('ALTO_H_MM')}"></label>
      <label>Peso (kg)<input name="PESO_KG" type="number" inputmode="decimal" step="0.1" value="${v('PESO_KG')}"></label>
    </div>
    <div class="grupo"><span>Empaque</span>${opc('EMPAQUE', ['CAJA', 'BULTO'])}</div>
    <div class="grupo"><span>Líquido</span>${opc('LIQUIDO', ['NO', 'SI'])}</div>
    <div class="grupo"><span>Delicado</span>${opc('DELICADO', ['NO', 'SI'])}</div>
    <details><summary>Más datos (opcional)</summary>
      <div class="fila">
        <label>Cajas que aguanta encima<input name="MAX_CAJAS_ENCIMA" type="number" inputmode="numeric" value="${v('MAX_CAJAS_ENCIMA')}"></label>
        <label>Nivel<input name="NIVEL" value="${v('NIVEL')}"></label>
        <label>Hueco ancho (mm)<input name="HUECO_ANCHO_MM" type="number" inputmode="numeric" value="${v('HUECO_ANCHO_MM')}"></label>
        <label>Hueco fondo (mm)<input name="HUECO_FONDO_MM" type="number" inputmode="numeric" value="${v('HUECO_FONDO_MM')}"></label>
        <label>Hueco alto (mm)<input name="HUECO_ALTO_MM" type="number" inputmode="numeric" value="${v('HUECO_ALTO_MM')}"></label>
        <label>Peso máx. del nivel (kg)<input name="PESO_MAX_KG" type="number" inputmode="decimal" value="${v('PESO_MAX_KG')}"></label>
      </div>
      <div class="grupo"><span>Bloqueada (no se mueve)</span>${opc('BLOQUEADA', ['NO', 'SI'])}</div>
      <label>Observaciones<input name="OBSERVACIONES" value="${v('OBSERVACIONES')}"></label>
    </details>
    <div id="avisosPos"></div>
    <div class="acciones">
      <button class="boton" type="submit" id="guardarPos">Guardar y siguiente</button>
      <button class="boton sec" type="button" id="vaciaPos">Marcar vacía</button>
      ${f.SUBPOSICION ? '' : '<button class="boton sec" type="button" id="dividirPos">Dividir en A y B</button>'}
      <button class="boton sec" type="button" id="cerrarPos">Cerrar</button>
    </div>
  </form>`;
  document.body.appendChild(fondo);
  const form = fondo.querySelector('form');
  const elegidos = {};
  ['EMPAQUE', 'LIQUIDO', 'DELICADO', 'BLOQUEADA'].forEach((k) => { elegidos[k] = String(f[k] ?? '').toUpperCase() || (k === 'BLOQUEADA' ? 'NO' : ''); });
  form.querySelectorAll('.opcion').forEach((b) => b.addEventListener('click', () => {
    elegidos[b.dataset.campo] = b.dataset.valor;
    form.querySelectorAll(`.opcion[data-campo="${b.dataset.campo}"]`).forEach((x) => x.classList.toggle('sel', x === b));
  }));
  // Autocompletar si el código ya se tomó en otra posición
  form.CODIGO_ARTICULO.addEventListener('change', () => {
    const a = cat.get(form.CODIGO_ARTICULO.value.trim());
    if (!a) return;
    for (const [k, val] of Object.entries(a)) {
      if (form[k] && form[k].tagName === 'INPUT') form[k].value = val;
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
    guardarFilas(); recalcular(); cerrar(); mostrar('tomar');
    const sig = siguiente();
    if (sig) abrirFormulario(sig.CODIGO); else notificar('Pasillo terminado');
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = Object.fromEntries([...new FormData(form).entries()].map(([k, val]) => [k, String(val).trim()]));
    Object.assign(datos, elegidos);
    const avisos = revisarDatos(datos);
    if (avisos.length && !avisado) {
      avisado = true;
      $('#avisosPos', fondo).innerHTML = `<div class="aviso">${avisos.map(esc).join('<br>')}<br><b>Corrige o toca Guardar otra vez.</b></div>`;
      return;
    }
    if (Number(datos.ANCHO_B_MM) > Number(datos.LARGO_A_MM) && Number(datos.LARGO_A_MM) > 0) [datos.LARGO_A_MM, datos.ANCHO_B_MM] = [datos.ANCHO_B_MM, datos.LARGO_A_MM];
    Object.assign(f, datos, { ACTUALIZADO: new Date().toISOString() });
    f.ESTADO = estadoDe({ ...f, ESTADO: '' });
    terminar();
  });
  $('#vaciaPos', fondo).addEventListener('click', () => {
    for (const k of ['ARTICULO', 'CODIGO_ARTICULO', 'LARGO_A_MM', 'ANCHO_B_MM', 'ALTO_H_MM', 'PESO_KG', 'EMPAQUE', 'LIQUIDO', 'DELICADO', 'MAX_CAJAS_ENCIMA']) delete f[k];
    f.ESTADO = 'VACIA'; f.ACTUALIZADO = new Date().toISOString();
    terminar();
  });
  $('#dividirPos', fondo)?.addEventListener('click', () => {
    estado.filas = subdividir(estado.filas, f.CODIGO);
    guardarFilas(); recalcular(); cerrar(); mostrar('tomar');
    abrirFormulario(`${f.CODIGO}A`);
  });
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
  window.scrollTo(0, 0);
}

function conectar(tab) {
  document.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); mostrar(a.dataset.ir); }));
  if (tab === 'inicio') {
    $('#archivo').addEventListener('change', async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      const salida = $('#resultadoImport');
      salida.innerHTML = '<p class="nota">Leyendo…</p>';
      try {
        const r = await leerArchivo(archivo);
        const partes = [];
        if (r.ubicaciones) { estado.filas = mezclar(estado.filas, r.ubicaciones); guardarFilas(); partes.push(`${r.ubicaciones.length} ubicaciones`); }
        if (r.pedidos) { estado.pedidos = r.pedidos; guardar('pedidos', r.pedidos); partes.push(`${r.pedidos.length} líneas de pedidos`); }
        recalcular();
        mostrar('inicio');
        $('#resultadoImport').innerHTML = (partes.length ? `<div class="aviso ok">Cargado: ${partes.join(' y ')}.</div>` : '') + r.avisos.map((a) => `<div class="aviso error">${esc(a)}</div>`).join('');
      } catch (err) {
        salida.innerHTML = `<div class="aviso error">No se pudo leer el archivo: ${esc(err.message)}</div>`;
      }
    });
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
    $('#descargarToma').addEventListener('click', () => descargar('ubicaciones-tomadas.csv', csvToma()));
  }
  if (tab === 'agente') {
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => preguntar(b.dataset.q)));
    $('#formChat').addEventListener('submit', (e) => { e.preventDefault(); preguntar($('#pregunta').value); });
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
      await mostrarEstiba($('#vistaCalc'), { numero: 1, cajas: r.colocaciones.map((c) => ({ ...c, nombre: art.nombre })), totalCajas: r.totalCajas, pesoTotal: r.pesoTotal, alturaTotal: r.alturaTotal, usoVolumen: (r.totalCajas * art.largo * art.ancho * art.alto) / (estado.palet.largo * estado.palet.ancho * (estado.palet.alturaMaxTotal - estado.palet.altoBase)) });
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
