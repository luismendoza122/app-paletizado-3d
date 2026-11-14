// Entorno de THEMENDO para Seguimiento de Recibo.
// Da a la página una nube compartida (Supabase de la Central de Luis, función "recibo"),
// descargas de archivos y la tarjeta "Nube del equipo" en Ajustes.
// Entra Luis con su cuenta de la Central, o cualquier equipo con el código de equipo que Luis crea.
(function () {
  'use strict';
  const NUBE = {
    url: 'https://nfrqrboqxcpgsagnmwqq.supabase.co',
    llave: 'sb_publishable_73XleY68KOLPlGw_DrlQsA__IQzwPB8',
  };
  const FUNCION = NUBE.url + '/functions/v1/recibo';
  const CADA_MS = 6000; // cada cuánto se buscan cambios de otros equipos

  const ls = {
    get(k, d) { try { const v = localStorage.getItem('rc_nube_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('rc_nube_' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };
  // Enlace de invitación: .../recibo/#equipo=XXXXX-XXXXX deja este equipo conectado sin escribir nada.
  // El código va después de # para que nunca viaje a ningún servidor; se borra de la dirección enseguida.
  (function invitacion() {
    const m = decodeURIComponent(location.hash || '').match(/^#equipo=([A-Za-z0-9-]{8,20})$/);
    if (!m) return;
    ls.set('equipo', m[1].toUpperCase());
    ls.set('recienUnido', true);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { location.hash = ''; }
  })();

  function idDispositivo() {
    let id = ls.get('dispositivo', null);
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); ls.set('dispositivo', id); }
    return id;
  }

  // ---------- sesión de Luis y código de equipo ----------
  async function tokenVigente() {
    const s = ls.get('sesion', null);
    if (!s) return null;
    if (Date.now() < s.vence - 60000) return s.token;
    try {
      const r = await fetch(NUBE.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: NUBE.llave }, body: JSON.stringify({ refresh_token: s.refresh }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error();
      ls.set('sesion', { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + (d.expires_in || 3600) * 1000 });
      return d.access_token;
    } catch { return null; }
  }
  async function cabeceras() {
    const h = { 'Content-Type': 'application/json', apikey: NUBE.llave };
    const t = await tokenVigente();
    if (t) h.Authorization = 'Bearer ' + t;
    const c = ls.get('equipo', '');
    if (c) h['x-equipo'] = c;
    return h;
  }
  async function llamar(accion, datos = {}) {
    const r = await fetch(FUNCION, { method: 'POST', headers: await cabeceras(), body: JSON.stringify({ accion, dispositivo: idDispositivo(), ...datos }) });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(cuerpo.error || ('Error ' + r.status)); e.code = r.status === 401 ? 'sin_acceso' : r.status === 413 ? 'demasiado_grande' : 'error_' + r.status; throw e; }
    return cuerpo;
  }
  async function iniciarSesion(correo, clave) {
    const r = await fetch(NUBE.url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: NUBE.llave }, body: JSON.stringify({ email: correo, password: clave }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.msg || 'No se pudo iniciar sesión');
    ls.set('sesion', { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + (d.expires_in || 3600) * 1000 });
  }

  let estado = null; // { luis, equipo, hayCodigo }
  async function revisarEstado() {
    if (navigator.onLine === false) { estado = estado || { luis: !!ls.get('sesion', null), equipo: !!ls.get('equipo', ''), offline: true }; return estado; }
    try { estado = await llamar('estado'); } catch { estado = { luis: false, equipo: false, error: true }; }
    return estado;
  }

  // ---------- base de datos compartida (colecciones y documentos) ----------
  const cache = new Map();        // 'col/id' -> { datos, version, borrado, completo }
  const oyentesCol = new Map();   // col -> Set(fn)
  const oyentesDoc = new Map();   // 'col/id' -> Set(fn)
  let desde = ls.get('desde', null);
  let primeraCarga = null;

  // Copia en el equipo para abrir rápido aunque no haya señal (las fotos no se guardan aquí)
  (function cargarCopia() {
    for (const [k, v] of Object.entries(ls.get('copia', {}))) cache.set(k, v);
  })();
  let guardarCopiaT = null;
  function guardarCopia() {
    clearTimeout(guardarCopiaT);
    guardarCopiaT = setTimeout(() => {
      const o = {};
      for (const [k, v] of cache) if (!k.startsWith('fotos/')) o[k] = v;
      ls.set('copia', o); ls.set('desde', desde);
    }, 500);
  }

  const copia = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const instant = (id, datos) => ({ id, exists: datos !== null, data: () => copia(datos) });

  function emitir(col, id, tipo, datos) {
    const fs = oyentesCol.get(col);
    if (fs) {
      const snap = { metadata: { fromCache: false }, docChanges: () => [{ type: tipo, doc: instant(id, datos) }], docs: [] };
      fs.forEach((f) => { try { f(snap); } catch (e) { console.error(e); } });
    }
    const fd = oyentesDoc.get(col + '/' + id);
    if (fd) fd.forEach((f) => { try { f(instant(id, tipo === 'removed' ? null : datos)); } catch (e) { console.error(e); } });
  }

  function aplicar(d) {
    const k = d.coleccion + '/' + d.id;
    const previo = cache.get(k);
    if (previo && previo.version >= d.version) return;
    if (d.borrado) {
      cache.set(k, { datos: null, version: d.version, borrado: true });
      if (previo && !previo.borrado) emitir(d.coleccion, d.id, 'removed', previo.datos);
      return;
    }
    const completo = d.coleccion !== 'fotos';
    cache.set(k, { datos: d.datos, version: d.version, borrado: false, completo });
    if (completo) emitir(d.coleccion, d.id, previo && !previo.borrado ? 'modified' : 'added', d.datos);
  }

  let consultando = false;
  async function traerCambios() {
    if (consultando || navigator.onLine === false) return;
    consultando = true;
    try {
      // 3 s de margen por si dos equipos guardan casi al mismo tiempo (los repetidos se ignoran por versión)
      const pedir = desde ? new Date(Date.parse(desde) - 3000).toISOString() : null;
      const r = await llamar('cambios', { desde: pedir });
      (r.docs || []).forEach(aplicar);
      if (r.docs && r.docs.length >= 2000) desde = r.docs[r.docs.length - 1].actualizado_en;
      else desde = r.ahora;
      guardarCopia();
    } finally { consultando = false; }
  }

  let reloj = null;
  function arrancarSondeo() {
    if (reloj) return;
    const ciclo = async () => {
      try { if (document.visibilityState !== 'hidden') await traerCambios(); } catch (e) { errores.forEach((f) => f(e)); }
      reloj = setTimeout(ciclo, CADA_MS);
    };
    reloj = setTimeout(ciclo, CADA_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') traerCambios().catch(() => {}); });
    window.addEventListener('online', () => traerCambios().catch(() => {}));
  }
  const errores = new Set();

  function docRef(col, id) {
    const k = col + '/' + id;
    return {
      id,
      async get() {
        const c = cache.get(k);
        if (c && (c.completo || c.borrado)) return instant(id, c.borrado ? null : c.datos);
        const r = await llamar('obtener', { coleccion: col, id });
        if (!r.existe) return instant(id, null);
        cache.set(k, { datos: r.datos, version: r.version, borrado: false, completo: true });
        return instant(id, r.datos);
      },
      async set(datos) {
        const limpio = copia(datos);
        const r = await llamar('guardar', { coleccion: col, id, datos: limpio });
        const previo = cache.get(k);
        cache.set(k, { datos: limpio, version: r.version, borrado: false, completo: true });
        if (col !== 'fotos') { emitir(col, id, previo && !previo.borrado ? 'modified' : 'added', limpio); guardarCopia(); }
      },
      async delete() {
        const r = await llamar('borrar', { coleccion: col, id });
        const previo = cache.get(k);
        cache.set(k, { datos: null, version: r.version, borrado: true });
        if (previo && !previo.borrado && col !== 'fotos') { emitir(col, id, 'removed', previo.datos); guardarCopia(); }
      },
      onSnapshot(fn, err) {
        if (!oyentesDoc.has(k)) oyentesDoc.set(k, new Set());
        oyentesDoc.get(k).add(fn);
        if (err) errores.add(err);
        Promise.resolve(primeraCarga).then(() => { const c = cache.get(k); fn(instant(id, c && !c.borrado ? c.datos : null)); }, () => {});
        return () => oyentesDoc.get(k).delete(fn);
      },
    };
  }

  const DB = {
    doc(ruta) { const [col, id] = String(ruta).split('/'); return docRef(col, id); },
    collection(col) {
      return {
        doc: (id) => docRef(col, id),
        onSnapshot(fn, err) {
          if (!oyentesCol.has(col)) oyentesCol.set(col, new Set());
          oyentesCol.get(col).add(fn);
          if (err) errores.add(err);
          Promise.resolve(primeraCarga).then(() => {
            const cambios = [];
            for (const [k, v] of cache) {
              if (!k.startsWith(col + '/') || v.borrado || !v.completo) continue;
              cambios.push({ type: 'added', doc: instant(k.slice(col.length + 1), v.datos) });
            }
            fn({ metadata: { fromCache: false }, docChanges: () => cambios, docs: [] });
          }, (e) => err && err(e));
          return () => oyentesCol.get(col).delete(fn);
        },
      };
    },
  };

  // ---------- descargas ----------
  const DESCARGAS = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u; a.download = filename || 'archivo'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      return { ok: true };
    },
  };

  // ---------- lo que la página pide ----------
  window.entorno = {
    async use(nombre) {
      if (nombre === 'downloads') return DESCARGAS;
      if (nombre !== 'db') return null; // sin lectura automática de fotos ni Google Drive en esta versión
      const e = await revisarEstado();
      if (!(e.luis || e.equipo)) return null;
      if (!e.offline) primeraCarga = traerCambios().catch(() => {});
      else primeraCarga = Promise.resolve();
      await primeraCarga;
      arrancarSondeo();
      return DB;
    },
    estado: () => estado,
  };

  // ---------- tarjeta "Nube del equipo" en Ajustes ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function aviso(t) { const el = document.getElementById('nbMsg'); if (el) el.textContent = t; }

  async function pintarTarjeta() {
    const v = document.getElementById('v-ajustes');
    if (!v) return;
    let card = document.getElementById('nubeCard');
    if (!card) {
      card = document.createElement('section');
      card.className = 'card'; card.id = 'nubeCard';
      v.insertBefore(card, v.firstChild);
    }
    const e = estado || await revisarEstado();
    const conSesion = !!ls.get('sesion', null);
    const conCodigo = !!ls.get('equipo', '');
    let html = '<h2>Nube del equipo</h2>';
    if (e.luis) {
      html += '<p class="note">Conectado como <b>Luis</b>. Todo se comparte entre tus equipos.</p>' +
        '<div class="actions"><button class="btn primary" id="nbCrear">' + (e.hayCodigo ? 'Cambiar código de equipo' : 'Crear código de equipo') + '</button>' +
        (e.hayCodigo ? '<button class="btn" id="nbQuitar">Quitar código</button>' : '') +
        '<button class="btn" id="nbSalir">Cerrar sesión</button></div>' +
        '<p class="note">El código de equipo deja entrar a los auditores sin tu contraseña. Si lo cambias, los equipos que tenían el anterior dejan de sincronizar hasta que escriban el nuevo.</p>';
    } else if (e.equipo) {
      const nuevo = ls.get('recienUnido', false); ls.set('recienUnido', false);
      html += (nuevo ? '<p class="note" style="color:var(--ok, #2a9d5c)"><b>¡Listo! Quedaste conectado a la nube del equipo.</b> Escribe tu nombre y SAP en «Auditor de este equipo», más abajo, para que tus planillas salgan a tu nombre.</p>' : '') +
        '<p class="note">Este equipo está conectado con el <b>código de equipo</b>. Lo que registres lo ve todo el equipo.</p>' +
        '<div class="actions"><button class="btn" id="nbOlvidar">Desconectar este equipo</button></div>';
    } else {
      html += '<p class="note">Este equipo trabaja <b>solo aquí</b>. Para compartir planillas entre equipos, escribe el código de equipo que te dio Luis, o inicia sesión si eres Luis.</p>' +
        (conCodigo ? '<p class="note" style="color:var(--bad)">El código guardado ya no es válido. Pide el nuevo.</p>' : '') +
        '<div class="bar"><label class="fld grow"><span>Código de equipo</span><input id="nbCodigo" autocomplete="off" autocapitalize="characters" placeholder="XXXXX-XXXXX"></label>' +
        '<button class="btn primary" id="nbUsarCodigo">Conectar</button></div>' +
        '<details><summary>Soy Luis: iniciar sesión</summary><div class="g2">' +
        '<label class="fld"><span>Correo de la Central</span><input id="nbCorreo" type="email" autocomplete="username"></label>' +
        '<label class="fld"><span>Contraseña</span><input id="nbClave" type="password" autocomplete="current-password"></label></div>' +
        '<div class="actions"><button class="btn primary" id="nbEntrar">Iniciar sesión</button></div></details>' +
        (conSesion ? '<p class="note">La sesión guardada venció; vuelve a iniciar sesión.</p>' : '');
    }
    if (e.offline) html += '<p class="note">Sin señal: se usa lo último que se guardó.</p>';
    html += '<p class="note" id="nbMsg" role="status"></p>';
    card.innerHTML = html;

    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('nbUsarCodigo', async () => {
      const c = document.getElementById('nbCodigo').value.trim().toUpperCase();
      if (c.replace(/[^A-Z0-9]/g, '').length < 8) { aviso('Escribe el código completo (10 letras y números).'); return; }
      ls.set('equipo', c); aviso('Comprobando…');
      const r = await revisarEstado();
      if (r.equipo) { aviso('Listo. Cargando la información compartida…'); setTimeout(() => location.reload(), 600); }
      else { ls.set('equipo', ''); aviso('Ese código no es válido.'); }
    });
    on('nbEntrar', async () => {
      aviso('Entrando…');
      try {
        await iniciarSesion(document.getElementById('nbCorreo').value.trim(), document.getElementById('nbClave').value);
        const r = await revisarEstado();
        if (r.luis) { aviso('Listo. Cargando la información compartida…'); setTimeout(() => location.reload(), 600); }
        else aviso('Esa cuenta no es la de Luis.');
      } catch (err) { aviso(err.message); }
    });
    on('nbCrear', async () => {
      try {
        const r = await llamar('crear_codigo');
        estado = await revisarEstado();
        const enlace = location.origin + location.pathname + '#equipo=' + r.codigo;
        const texto = 'Hola, te invito al Seguimiento de Recibo del CEDI. Abre este enlace en tu celular o PC y quedas conectado a las planillas del equipo (no lo compartas fuera del equipo):\n' + enlace +
          '\nSi te pide código de equipo: ' + r.codigo + '\nDespués ve a Ajustes y escribe tu nombre en «Auditor de este equipo».';
        const msg = document.getElementById('nbMsg');
        msg.innerHTML = '<b>Código de equipo: ' + esc(r.codigo) + '</b> · se muestra una sola vez. Envíaselo solo a los conferencistas.' +
          '<div class="actions"><a class="btn primary" id="nbWa" target="_blank" rel="noopener">Invitar por WhatsApp</a>' +
          '<button class="btn" id="nbCopiar" type="button">Copiar invitación</button></div>';
        document.getElementById('nbWa').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
        document.getElementById('nbCopiar').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(texto); document.getElementById('nbCopiar').textContent = 'Copiada ✓'; }
          catch { window.prompt('Copia la invitación:', texto); }
        });
      } catch (err) { aviso(err.message); }
    });
    on('nbQuitar', async () => { try { await llamar('quitar_codigo'); estado = await revisarEstado(); await pintarTarjeta(); aviso('Código quitado.'); } catch (err) { aviso(err.message); } });
    on('nbSalir', () => { ls.set('sesion', null); location.reload(); });
    on('nbOlvidar', () => { ls.set('equipo', ''); location.reload(); });
  }
  window.entorno.pintarNube = pintarTarjeta;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => pintarTarjeta().catch(() => {}));
  else pintarTarjeta().catch(() => {});
})();
