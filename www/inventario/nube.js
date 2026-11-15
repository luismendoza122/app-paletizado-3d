// Conexión con la nube del inventario de estibas (función "inventario" de Supabase de la Central de Luis).
// La llave pública solo identifica el proyecto; la función decide qué puede hacer cada quien:
// enlace del operador (token), administrador (código personal, un solo celular, vence) o la cuenta principal.
'use strict';

const NUBE = (() => {
  const URL_SB = 'https://nfrqrboqxcpgsagnmwqq.supabase.co';
  const LLAVE = 'sb_publishable_73XleY68KOLPlGw_DrlQsA__IQzwPB8';
  // Para probar en el PC sin internet: ?nube=http://localhost:3100
  const propia = new URLSearchParams(location.search).get('nube');
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const FUNCION = propia && local ? propia.replace(/\/$/, '') : `${URL_SB}/functions/v1/inventario`;
  // Página pública donde abren los enlaces de los operadores
  // (dentro de la APK los enlaces van a la página web; en el navegador, a esta misma carpeta)
  const nativa = Boolean(window.Capacitor?.isNativePlatform?.());
  const PAGINA = nativa ? 'https://luismendoza122.github.io/app-paletizado-3d/inventario/' : `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;

  const leer = (k, d = null) => { try { const v = localStorage.getItem(`inv-${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const guardar = (k, v) => { try { if (v == null) localStorage.removeItem(`inv-${k}`); else localStorage.setItem(`inv-${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

  // Identificador del celular (el enlace y el código de administrador quedan amarrados al primero que los usa)
  function dispositivo() {
    let id = leer('dispositivo') || (() => { try { return JSON.parse(localStorage.getItem('dispositivo')); } catch { return null; } })();
    if (!id || !/^[a-zA-Z0-9-]{8,64}$/.test(id)) id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    guardar('dispositivo', id);
    return id;
  }

  // Petición a la función. acceso: { codigo } de administrador o { token } de la cuenta principal
  async function pedir(ruta, { method = 'GET', body, acceso } = {}) {
    const h = { 'Content-Type': 'application/json', apikey: LLAVE, 'x-dispositivo': dispositivo(), 'x-region': 'us-east-1' };
    if (acceso?.token) h.Authorization = `Bearer ${acceso.token}`;
    if (acceso?.codigo) h['x-admin'] = acceso.codigo;
    let r;
    try {
      r = await fetch(`${FUNCION}${ruta}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      const e = new Error('Sin conexión con la nube');
      e.red = true;
      throw e;
    }
    const datos = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, datos };
  }

  // Cuenta principal (correo y contraseña de la Central). No aparece en ninguna lista.
  async function iniciarSesion(correo, clave) {
    const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: LLAVE }, body: JSON.stringify({ email: correo, password: clave }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.msg || 'Correo o contraseña incorrectos');
    guardar('sesion', { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + (d.expires_in || 3600) * 1000 });
  }
  async function tokenVigente() {
    const s = leer('sesion');
    if (!s) return null;
    if (Date.now() < s.vence - 60000) return s.token;
    try {
      const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: LLAVE }, body: JSON.stringify({ refresh_token: s.refresh }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error();
      guardar('sesion', { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + (d.expires_in || 3600) * 1000 });
      return d.access_token;
    } catch {
      guardar('sesion', null);
      return null;
    }
  }
  async function acceso() {
    const t = await tokenVigente();
    if (t) return { token: t };
    const c = leer('admin');
    return c ? { codigo: c } : null;
  }
  const guardarCodigo = (c) => guardar('admin', String(c || '').toUpperCase().trim() || null);
  const salir = () => { guardar('admin', null); guardar('sesion', null); };

  // Archivo que llega en base64 (Excel, dashboard) → Blob para descargar
  function aBlob(archivo) {
    const bin = atob(archivo.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: archivo.tipo });
  }

  // Guarda o comparte un archivo: en la APK con los permisos del celular; en el navegador como descarga
  async function descargar(archivo, nombre = archivo.nombre) {
    const cap = window.Capacitor;
    if (cap?.isNativePlatform?.()) {
      const Filesystem = cap.registerPlugin('Filesystem');
      const Share = cap.registerPlugin('Share');
      const limpio = String(nombre).replace(/[^\w\- .áéíóúñÁÉÍÓÚÑ]/g, '').trim() || 'archivo';
      const r = await Filesystem.writeFile({ path: limpio, data: archivo.base64, directory: 'CACHE' });
      await Share.share({ title: limpio, url: r.uri, dialogTitle: 'Guardar o enviar' }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(aBlob(archivo));
    a.download = nombre;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  const enlaceOperador = (token) => `${PAGINA}contar.html?t=${encodeURIComponent(token)}${propia && local ? `&nube=${encodeURIComponent(propia)}` : ''}`;
  return { FUNCION, PAGINA, leer, guardar, dispositivo, pedir, iniciarSesion, acceso, guardarCodigo, salir, aBlob, descargar, enlaceOperador };
})();
