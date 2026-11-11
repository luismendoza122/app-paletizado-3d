// Guarda los datos en el celular (localStorage). Si el navegador no deja, se trabaja en memoria.
const PREFIJO = 'paletizado3d:';
const memoria = new Map();

export function guardar(clave, valor) {
  const texto = JSON.stringify(valor);
  try { localStorage.setItem(PREFIJO + clave, texto); } catch { memoria.set(clave, texto); }
}

export function leer(clave, porDefecto = null) {
  let texto = null;
  try { texto = localStorage.getItem(PREFIJO + clave); } catch { /* sin acceso */ }
  if (texto === null) texto = memoria.get(clave) ?? null;
  if (texto === null) return porDefecto;
  try { return JSON.parse(texto); } catch { return porDefecto; }
}

export function borrarTodo() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIJO)).forEach((k) => localStorage.removeItem(k));
  } catch { /* sin acceso */ }
  memoria.clear();
}
