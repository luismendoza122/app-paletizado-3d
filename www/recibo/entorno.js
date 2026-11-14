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
    if (estado.luis) ls.set('conectado', 'luis');
    else if (estado.equipo) ls.set('conectado', 'codigo');
    return estado;
  }
  // ¿Este equipo entraba con un código (invitación o código general) y Luis se lo quitó?
  function accesoPerdido() {
    // (también los equipos conectados antes de esta versión, que no tienen la marca 'conectado')
    const codigo = ls.get('equipo', '');
    return !!codigo && ls.get('borradoPara', '') !== codigo && ls.get('conectado', null) !== 'luis' && !ls.get('sesion', null) && !!estado &&
      !estado.luis && !estado.equipo && !estado.error && !estado.offline;
  }
  // Borra del equipo todo lo que vino de la nube del equipo: planillas, fotos, catálogo y ajustes.
  // Queda solo el nombre del auditor de este equipo.
  async function borrarDatosEquipo() {
    ls.set('copia', {}); ls.set('desde', null); ls.set('conectado', null); ls.set('borradoPara', ls.get('equipo', ''));
    for (const k of ['rc_cur', 'rc_cfg', 'rc_cfgDirty', 'rc_listas', 'rc_listasDirty', 'rc_art', 'rc_artDirty', 'rc_artDel', 'rc_driveAuto']) {
      try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ }
    }
    await new Promise((listo) => {
      try {
        const r = indexedDB.open('recibo-v1');
        r.onsuccess = () => {
          const db = r.result;
          const tiendas = ['planillas', 'fotos'].filter((t) => db.objectStoreNames.contains(t));
          if (!tiendas.length) { db.close(); listo(); return; }
          const t = db.transaction(tiendas, 'readwrite');
          tiendas.forEach((n) => t.objectStore(n).clear());
          t.oncomplete = t.onerror = t.onabort = () => { db.close(); listo(); };
        };
        r.onerror = r.onblocked = () => listo();
      } catch { listo(); }
    });
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
      try { if (document.visibilityState !== 'hidden') await traerCambios(); } catch (e) {
        // Luis quitó a esta persona o cambió el código: se borra la copia del equipo y la página vuelve a modo local
        if (e && e.code === 'sin_acceso' && !ls.get('sesion', null)) { await borrarDatosEquipo(); location.reload(); return; }
        errores.forEach((f) => f(e));
      }
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

  // ---------- Google Drive (puente publicado como aplicación web de Google Apps Script) ----------
  // La dirección del puente se guarda en la nube del equipo (config/puente → { url }), así se cambia sin tocar la página.
  function urlPuente() {
    const c = cache.get('config/puente');
    const u = c && !c.borrado && c.datos && c.datos.url;
    return typeof u === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u) ? u : '';
  }
  const DRIVE_PUENTE = {
    async callTool(_servidor, tool, input) {
      const url = urlPuente();
      if (!url) throw { code: 'server_not_connected', message: 'Sin puente de Drive' };
      const cuerpo = JSON.stringify({ tool, input, equipo: ls.get('equipo', ''), token: (await tokenVigente()) || '' });
      let r;
      // text/plain: el navegador no hace consulta previa y Google la acepta
      try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo, redirect: 'follow' }); }
      catch { throw { code: 'server_unavailable', message: 'Sin conexión con Google Drive' }; }
      if (!r.ok) throw { code: r.status === 429 ? 'rate_limited' : 'upstream_error', message: 'Google respondió ' + r.status };
      const d = await r.json().catch(() => null);
      if (!d) throw { code: 'upstream_error', message: 'Respuesta inválida de Google Drive' };
      if (d.error) throw { code: d.error.code || 'tool_error', message: d.error.message || '' };
      return { payload: d.payload || {} };
    },
  };

  // ---------- lo que la página pide ----------
  window.entorno = {
    async use(nombre) {
      if (nombre === 'downloads') return DESCARGAS;
      if (nombre === 'mcp') {
        const e = estado || await revisarEstado();
        if (!(e.luis || e.equipo)) return null;
        await primeraCarga;
        return urlPuente() ? DRIVE_PUENTE : null;
      }
      if (nombre !== 'db') return null;
      const e = await revisarEstado();
      if (accesoPerdido()) { await borrarDatosEquipo(); location.reload(); return new Promise(() => {}); }
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
        '<h3 style="margin:14px 0 4px;font-size:15px">Personas del equipo</h3>' +
        '<p class="note">Cada persona recibe su propio enlace. Si alguien ya no debe entrar, tócale <b>Quitar</b> y solo esa persona queda por fuera.</p>' +
        '<div class="bar"><label class="fld grow"><span>Nombre de la persona</span><input id="nbNombre" autocomplete="off" placeholder="Ej.: Edwin Carrillo"></label>' +
        '<button class="btn primary" id="nbInvitar">Invitar</button></div>' +
        '<p class="note" id="nbInvMsg" role="status"></p>' +
        '<div id="nbPersonas" class="nbPersonas"><p class="note">Cargando personas…</p></div>' +
        '<h3 style="margin:14px 0 4px;font-size:15px">Código general</h3>' +
        '<p class="note">' + (e.hayCodigo ? 'Hay un código general activo: entra <b>cualquiera</b> que lo tenga y no se puede quitar a una sola persona. Cuando todos tengan su invitación personal, tócale «Quitar código general».' : 'No hay código general: solo entran las personas de la lista.') + '</p>' +
        '<div class="actions"><button class="btn" id="nbCrear">' + (e.hayCodigo ? 'Cambiar código general' : 'Crear código general') + '</button>' +
        (e.hayCodigo ? '<button class="btn" id="nbQuitar">Quitar código general</button>' : '') +
        '<button class="btn" id="nbSalir">Cerrar sesión</button></div>';
    } else if (e.equipo) {
      const nuevo = ls.get('recienUnido', false); ls.set('recienUnido', false);
      html += (nuevo ? '<p class="note" style="color:var(--ok, #2a9d5c)"><b>¡Listo! Quedaste conectado a la nube del equipo.</b> Escribe tu nombre y SAP en «Auditor de este equipo», más abajo, para que tus planillas salgan a tu nombre.</p>' : '') +
        (e.persona ? '<p class="note">Conectado como <b>' + esc(e.persona) + '</b>. Lo que registres lo ve todo el equipo.</p>' : '<p class="note">Este equipo está conectado con el <b>código de equipo</b>. Lo que registres lo ve todo el equipo.</p>') +
        '<div class="actions"><button class="btn" id="nbOlvidar">Desconectar este equipo</button></div>';
    } else {
      html += '<p class="note">Este equipo trabaja <b>solo aquí</b>. Para compartir planillas entre equipos, escribe el código de equipo que te dio Luis, o inicia sesión si eres Luis.</p>' +
        (conCodigo && !e.error ? '<p class="note" style="color:var(--bad)">Este equipo ya no tiene acceso: Luis quitó tu invitación o cambió el código. Pídele una invitación nueva.</p>' : '') +
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
    // Muestra la invitación lista para WhatsApp en el lugar indicado
    function mostrarInvitacion(dondeId, codigo, nombre) {
      const enlace = location.origin + location.pathname + '#equipo=' + codigo;
      const texto = 'Hola' + (nombre ? ' ' + nombre : '') + ', te invito al Seguimiento de Recibo del CEDI. Abre este enlace en tu celular o PC y quedas conectado a las planillas del equipo' + (nombre ? '. Es personal: no lo reenvíes' : ' (no lo compartas fuera del equipo)') + ':\n' + enlace +
        '\nSi te pide código de equipo: ' + codigo + '\nDespués ve a Ajustes y escribe tu nombre en «Auditor de este equipo».';
      const msg = document.getElementById(dondeId);
      msg.innerHTML = (nombre ? 'Invitación de <b>' + esc(nombre) + '</b> lista' : '<b>Código general: ' + esc(codigo) + '</b>') + ' · se muestra una sola vez. Envíala ahora.' +
        '<div class="actions"><a class="btn primary" data-wa target="_blank" rel="noopener">Enviar por WhatsApp</a>' +
        '<button class="btn" data-copiar type="button">Copiar invitación</button></div>';
      msg.querySelector('[data-wa]').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
      msg.querySelector('[data-copiar]').addEventListener('click', async (ev) => {
        try { await navigator.clipboard.writeText(texto); ev.target.textContent = 'Copiada ✓'; }
        catch { window.prompt('Copia la invitación:', texto); }
      });
    }
    const fecha = (t) => { if (!t) return 'todavía no ha entrado'; const d = new Date(t); return 'entró ' + d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); };
    async function pintarPersonas() {
      const caja = document.getElementById('nbPersonas');
      if (!caja) return;
      try {
        const { personas } = await llamar('personas');
        if (!personas.length) { caja.innerHTML = '<p class="note">Todavía no has invitado a nadie con invitación personal.</p>'; return; }
        caja.innerHTML = personas.map((x) => '<div class="nbPersona" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line, #ddd)">' +
          '<div style="flex:1;min-width:0"><b>' + esc(x.nombre) + '</b><div class="note" style="margin:0">' + esc(fecha(x.ultimo_uso)) + '</div></div>' +
          '<button class="btn sm" type="button" data-quitar="' + esc(x.id) + '" data-nombre="' + esc(x.nombre) + '">Quitar</button></div>').join('');
        caja.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
          if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Quitar? Toca otra vez'; setTimeout(() => { if (b.isConnected) { b.dataset.seguro = ''; b.textContent = 'Quitar'; } }, 4000); return; }
          b.disabled = true; b.textContent = 'Quitando…';
          try { await llamar('quitar_persona', { id: b.dataset.quitar }); aviso(b.dataset.nombre + ' ya no tiene acceso.'); await pintarPersonas(); }
          catch (err) { b.disabled = false; b.textContent = 'Quitar'; aviso(err.message); }
        }));
      } catch (err) { caja.innerHTML = '<p class="note">No se pudo cargar la lista: ' + esc(err.message) + '</p>'; }
    }
    if (e.luis) pintarPersonas();
    on('nbInvitar', async () => {
      const inp = document.getElementById('nbNombre');
      const nombre = inp.value.trim();
      if (nombre.length < 2) { document.getElementById('nbInvMsg').textContent = 'Escribe el nombre de la persona.'; return; }
      try {
        const r = await llamar('invitar', { nombre });
        inp.value = '';
        mostrarInvitacion('nbInvMsg', r.codigo, r.nombre);
        await pintarPersonas();
      } catch (err) { document.getElementById('nbInvMsg').textContent = err.message; }
    });
    on('nbCrear', async () => {
      try {
        const r = await llamar('crear_codigo');
        estado = await revisarEstado();
        mostrarInvitacion('nbMsg', r.codigo, '');
      } catch (err) { aviso(err.message); }
    });
    on('nbQuitar', async () => { try { await llamar('quitar_codigo'); estado = await revisarEstado(); await pintarTarjeta(); aviso('Código general quitado: ahora solo entran las personas de la lista.'); } catch (err) { aviso(err.message); } });
    on('nbSalir', () => { ls.set('sesion', null); location.reload(); });
    on('nbOlvidar', () => { ls.set('equipo', ''); ls.set('conectado', null); location.reload(); });
  }
  window.entorno.pintarNube = pintarTarjeta;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => pintarTarjeta().catch(() => {}));
  else pintarTarjeta().catch(() => {});
})();
