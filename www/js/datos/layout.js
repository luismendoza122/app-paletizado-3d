// Mapa de ubicaciones del CEDI ATS R10 Valledupar (confirmado por Luis).
// Cada pasillo: módulos 001–056 sin múltiplos de 3, cada uno con posiciones x1 y x2 (se pueden agregar x3, y1–y3, z1–z3).
// Ruta: cada pasillo del 001 al 056, de lado a lado; la secuencia empieza en 1 en cada zona.

export const ZONAS = [
  { zona: 'Seco no alimentos', pasillos: ['05', '06', '07', '08', '09', '10', '11'] },
  { zona: 'Seco alimentos', pasillos: ['12', '13', '14', '15', '16', '17', '18', '19'] },
  { zona: 'Lácteos', pasillos: ['LA52', 'LA53', 'LA54'] },
  { zona: 'Temperado', pasillos: ['TE62', 'TE63'] },
  { zona: 'Fruver', pasillos: ['FV42'] },
  { zona: 'Congelado', pasillos: ['CO31', 'CO32'] },
];

export const MODULOS = Array.from({ length: 56 }, (_, i) => i + 1).filter((n) => n % 3 !== 0).map((n) => String(n).padStart(3, '0'));

// Posiciones que puede tener un módulo. x1 y x2 vienen siempre; las demás se agregan cuando el módulo las tiene.
// Orden de la ruta dentro del módulo: x1, x2, x3, y1, y2, y3, z1, z2, z3.
export const POSICIONES = ['x1', 'x2', 'x3', 'y1', 'y2', 'y3', 'z1', 'z2', 'z3'];
export const POSICIONES_BASE = ['x1', 'x2'];
const DESPLAZAMIENTO = { x1: 0, x2: 1, x3: 1.2, y1: 1.3, y2: 1.4, y3: 1.5, z1: 1.6, z2: 1.7, z3: 1.8 };
const RE_UBICACION = /^(.+)-(\d{3})([xyz][1-3])([AB])?$/;
const r2 = (x) => Math.round(x * 100) / 100;

export const CAMPOS_ARTICULO = ['ARTICULO', 'CODIGO_ARTICULO', 'LARGO_A_MM', 'ANCHO_B_MM', 'ALTO_H_MM', 'PESO_KG', 'EMPAQUE', 'LIQUIDO', 'DELICADO', 'MAX_CAJAS_ENCIMA'];
export const COLUMNAS = ['CODIGO', 'SECCION', 'PASILLO', 'MODULO', 'POSICION', 'SUBPOSICION', 'SECUENCIA_RUTA', 'ARTICULO', 'CODIGO_ARTICULO',
  'LARGO_A_MM', 'ANCHO_B_MM', 'ALTO_H_MM', 'PESO_KG', 'EMPAQUE', 'LIQUIDO', 'DELICADO', 'MAX_CAJAS_ENCIMA', 'NIVEL', 'HUECO_ANCHO_MM',
  'HUECO_FONDO_MM', 'HUECO_ALTO_MM', 'PESO_MAX_KG', 'TIPO', 'BLOQUEADA', 'ESTADO', 'OBSERVACIONES', 'ACTUALIZADO'];

// Genera las 1.748 posiciones vacías.
export function generarLayout() {
  const filas = [];
  for (const { zona, pasillos } of ZONAS) {
    let sec = 0;
    for (const p of pasillos) {
      for (const m of MODULOS) {
        for (const x of ['x1', 'x2']) {
          sec++;
          filas.push({ CODIGO: `${p}-${m}${x}`, SECCION: zona, PASILLO: p, MODULO: m, POSICION: x, SUBPOSICION: '', SECUENCIA_RUTA: sec, BLOQUEADA: 'NO', ESTADO: 'SIN REVISAR' });
        }
      }
    }
  }
  return filas;
}

// Estado de una posición: SIN REVISAR · VACIA · INCOMPLETA · COMPLETA · DIVIDIDA
export function estadoDe(f) {
  if (f.ESTADO === 'DIVIDIDA') return 'DIVIDIDA';
  if (f.ESTADO === 'VACIA') return 'VACIA';
  const tieneAlgo = CAMPOS_ARTICULO.some((k) => String(f[k] ?? '').trim() !== '');
  if (!tieneAlgo) return 'SIN REVISAR';
  const obligatorios = ['ARTICULO', 'CODIGO_ARTICULO', 'LARGO_A_MM', 'ANCHO_B_MM', 'ALTO_H_MM', 'PESO_KG', 'EMPAQUE', 'LIQUIDO', 'DELICADO'];
  return obligatorios.every((k) => String(f[k] ?? '').trim() !== '') ? 'COMPLETA' : 'INCOMPLETA';
}

// Mezcla filas importadas (de la hoja) sobre el mapa: por CODIGO. Las que no existan (subdivisiones) se agregan.
export function mezclar(base, importadas) {
  const porCodigo = new Map(base.map((f) => [f.CODIGO, { ...f }]));
  for (const f of importadas) {
    if (!f.CODIGO) continue;
    const previa = porCodigo.get(f.CODIGO) || {};
    const limpia = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    porCodigo.set(f.CODIGO, { ...previa, ...limpia });
  }
  const filas = [...porCodigo.values()];
  completarUbicaciones(filas, porCodigo);
  for (const f of filas) if (f.ESTADO !== 'DIVIDIDA' && f.ESTADO !== 'VACIA') f.ESTADO = estadoDe(f);
  return ordenar(filas);
}

// Ruta de una posición a partir de su código (para posiciones agregadas o que llegan de Excel sin esos datos).
function completarUbicaciones(filas, porCodigo) {
  for (const f of filas) {
    if (f.PASILLO && f.MODULO && f.POSICION && f.SECUENCIA_RUTA !== undefined && f.SECUENCIA_RUTA !== '') continue;
    const m = String(f.CODIGO).match(RE_UBICACION);
    if (!m) continue;
    const [, pasillo, modulo, posicion, sub = ''] = m;
    const base = porCodigo.get(`${pasillo}-${modulo}x1`);
    const zona = ZONAS.find((z) => z.pasillos.includes(pasillo));
    if (!base || !zona) continue;
    let sec = Number(base.SECUENCIA_RUTA) + DESPLAZAMIENTO[posicion];
    if (sub) sec += sub === 'A' ? 0.05 : 0.06;
    Object.assign(f, { SECCION: f.SECCION || zona.zona, PASILLO: pasillo, MODULO: modulo, POSICION: posicion, SUBPOSICION: sub, SECUENCIA_RUTA: r2(sec), BLOQUEADA: f.BLOQUEADA || 'NO' });
  }
}

// Posiciones que aún se le pueden agregar a un módulo (ej. 05-001 → x3, y1, …, z3).
export function posicionesDisponibles(filas, pasillo, modulo) {
  const hay = new Set(filas.filter((f) => f.PASILLO === pasillo && f.MODULO === modulo).map((f) => f.POSICION));
  return POSICIONES.filter((p) => !hay.has(p));
}

// Agrega posiciones a un módulo. Devuelve { filas, nuevas: [códigos] }.
export function agregarPosiciones(filas, pasillo, modulo, posiciones) {
  const base = filas.find((f) => f.PASILLO === pasillo && f.MODULO === modulo && f.POSICION === 'x1' && !f.SUBPOSICION);
  if (!base) return { filas, nuevas: [] };
  const libres = new Set(posicionesDisponibles(filas, pasillo, modulo));
  const nuevas = posiciones.filter((p) => libres.has(p)).map((p) => ({
    CODIGO: `${pasillo}-${modulo}${p}`, SECCION: base.SECCION, PASILLO: pasillo, MODULO: modulo, POSICION: p, SUBPOSICION: '',
    SECUENCIA_RUTA: r2(Number(base.SECUENCIA_RUTA) + DESPLAZAMIENTO[p]), BLOQUEADA: 'NO', ESTADO: 'SIN REVISAR',
  }));
  return { filas: ordenar([...filas, ...nuevas]), nuevas: nuevas.map((f) => f.CODIGO) };
}

export function ordenar(filas) {
  const ordenZona = new Map(ZONAS.map((z, i) => [z.zona, i]));
  return filas.sort((a, b) => (ordenZona.get(a.SECCION) ?? 99) - (ordenZona.get(b.SECCION) ?? 99) || Number(a.SECUENCIA_RUTA) - Number(b.SECUENCIA_RUTA) || String(a.CODIGO).localeCompare(String(b.CODIGO)));
}

// Divide una posición en A y B. La madre queda DIVIDIDA (no recibe artículo).
export function subdividir(filas, codigo) {
  const i = filas.findIndex((f) => f.CODIGO === codigo);
  if (i < 0 || filas[i].SUBPOSICION) return filas;
  const madre = filas[i];
  const sec = Number(madre.SECUENCIA_RUTA);
  const hijas = ['A', 'B'].map((l, k) => ({
    CODIGO: `${codigo}${l}`, SECCION: madre.SECCION, PASILLO: madre.PASILLO, MODULO: madre.MODULO, POSICION: madre.POSICION,
    SUBPOSICION: l, SECUENCIA_RUTA: r2(sec + (k === 0 ? 0.05 : 0.06)), BLOQUEADA: madre.BLOQUEADA || 'NO', ESTADO: 'SIN REVISAR',
  }));
  // Si la madre ya tenía artículo, pasa a la A.
  for (const k of CAMPOS_ARTICULO) if (madre[k] !== undefined && madre[k] !== '') { hijas[0][k] = madre[k]; delete madre[k]; }
  hijas[0].ESTADO = estadoDe(hijas[0]);
  madre.ESTADO = 'DIVIDIDA';
  const nuevas = [...filas];
  nuevas.splice(i + 1, 0, ...hijas);
  return nuevas;
}

// Catálogo de artículos ya tomados (para autocompletar cuando el mismo artículo está en otra posición).
export function catalogo(filas) {
  const m = new Map();
  for (const f of filas) {
    const cod = String(f.CODIGO_ARTICULO ?? '').trim();
    if (!cod || estadoDe(f) !== 'COMPLETA') continue;
    m.set(cod, Object.fromEntries(CAMPOS_ARTICULO.map((k) => [k, f[k] ?? ''])));
  }
  return m;
}

// Unidades de medida: todo se guarda en milímetros.
export const FACTOR_UNIDAD = { mm: 1, cm: 10, m: 1000 };
export function aMilimetros(valor, unidad = 'mm') {
  const x = Number(String(valor ?? '').trim().replace(',', '.'));
  if (String(valor ?? '').trim() === '' || !Number.isFinite(x) || x <= 0) return '';
  return String(Math.round(x * (FACTOR_UNIDAD[unidad] || 1)));
}
export function desdeMilimetros(mm, unidad = 'mm') {
  const x = Number(mm);
  if (!x) return '';
  return String(Math.round((x / (FACTOR_UNIDAD[unidad] || 1)) * 1000) / 1000);
}

// Avisos de datos raros antes de guardar.
export function revisarDatos(d) {
  const avisos = [];
  const n = (k) => Number(String(d[k] ?? '').replace(',', '.'));
  for (const [k, t] of [['LARGO_A_MM', 'Largo A'], ['ANCHO_B_MM', 'Ancho B'], ['ALTO_H_MM', 'Alto H']]) {
    const v = n(k);
    if (d[k] !== '' && d[k] !== undefined && v > 0 && v < 60) avisos.push(`${t} = ${v} mm (${v / 10} cm) es muy pequeño: revisa la unidad (mm, cm o m)`);
    if (v > 2000) avisos.push(`${t} = ${v} mm (${v / 1000} m) es muy grande para una caja: revisa la unidad`);
  }
  const p = n('PESO_KG');
  if (d.PESO_KG !== '' && d.PESO_KG !== undefined && (p <= 0 || p > 80)) avisos.push(`Peso ${p} kg fuera de lo normal para una caja o bulto`);
  if (n('ANCHO_B_MM') > n('LARGO_A_MM') && n('LARGO_A_MM') > 0) avisos.push('El ancho B es mayor que el largo A: se intercambian al guardar');
  return avisos;
}
