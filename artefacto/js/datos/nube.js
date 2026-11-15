// Conexión con la información compartida (Supabase de la Central de Luis).
// Todo pasa por la función "paletizado". La llave pública es de solo identificación del proyecto;
// la función decide qué puede hacer cada quien (enlace de tarea o sesión de Luis).
import { guardar, leer } from './almacen.js';

export const NUBE = {
  url: 'https://nfrqrboqxcpgsagnmwqq.supabase.co',
  llave: 'sb_publishable_73XleY68KOLPlGw_DrlQsA__IQzwPB8',
};
const FUNCION = `${NUBE.url}/functions/v1/paletizado`;

export function idDispositivo() {
  let id = leer('dispositivo', null);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
    guardar('dispositivo', id);
  }
  return id;
}

export function plataforma() {
  return window.Capacitor?.getPlatform?.() === 'android' ? 'android' : 'web';
}

export function enLinea() { return navigator.onLine !== false; }

export async function llamar(accion, datos = {}, sesion = null) {
  const r = await fetch(FUNCION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: NUBE.llave, ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}) },
    body: JSON.stringify({ accion, dispositivo: idDispositivo(), ...datos }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(cuerpo.error || `Error ${r.status}`);
    e.codigo = r.status;
    throw e;
  }
  return cuerpo;
}

// Inicio de sesión de Luis con su cuenta de la Central (correo y contraseña de Supabase).
export async function iniciarSesion(correo, clave) {
  const r = await fetch(`${NUBE.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: NUBE.llave },
    body: JSON.stringify({ email: correo, password: clave }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || 'No se pudo iniciar sesión');
  const sesion = { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + (d.expires_in || 3600) * 1000 };
  guardar('sesion', sesion);
  return sesion;
}

export async function sesionVigente() {
  const s = leer('sesion', null);
  if (!s) return null;
  if (Date.now() < s.vence - 60000) return s.token;
  try {
    const r = await fetch(`${NUBE.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: NUBE.llave }, body: JSON.stringify({ refresh_token: s.refresh }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error();
    const nueva = { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + (d.expires_in || 3600) * 1000 };
    guardar('sesion', nueva);
    return nueva.token;
  } catch {
    return null;
  }
}

export function cerrarSesion() { guardar('sesion', null); }

// Enlace de una tarea (abre la página pública en cualquier celular)
export const PAGINA = 'https://luismendoza122.github.io/app-paletizado-3d/';
export function enlaceTarea(token) { return `${PAGINA}#tarea-${token}`; }
export function tokenDeLaDireccion() {
  const h = decodeURIComponent(location.hash || '');
  const m = h.match(/^#tarea-([A-Za-z0-9_-]{16,64})$/);
  if (m) return m[1];
  const q = new URLSearchParams(location.search).get('tarea');
  return q && /^[A-Za-z0-9_-]{16,64}$/.test(q) ? q : null;
}
export function mensajeWhatsApp(tarea) {
  const texto = `Hola ${tarea.asignado_a}, tienes una tarea de toma de datos en Paletizado 3D: ${tarea.titulo} (pasillos ${tarea.pasillos.join(', ')}).\n`
    + `Abre este enlace en tu celular. Funciona sin internet; al terminar toca "Terminar y enviar". El enlace sirve una sola vez.\n${enlaceTarea(tarea.token)}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
