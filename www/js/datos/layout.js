// Mapa de ubicaciones del CEDI ATS R10 Valledupar (confirmado por Luis).
// Cada pasillo: módulos 001–056 sin múltiplos de 3, cada uno con posiciones x1 y x2.
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
  for (const f of filas) if (f.ESTADO !== 'DIVIDIDA' && f.ESTADO !== 'VACIA') f.ESTADO = estadoDe(f);
  return ordenar(filas);
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
    SUBPOSICION: l, SECUENCIA_RUTA: Math.round((sec + (k + 1) * 0.1) * 10) / 10, BLOQUEADA: madre.BLOQUEADA || 'NO', ESTADO: 'SIN REVISAR',
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

// Avisos de datos raros antes de guardar.
export function revisarDatos(d) {
  const avisos = [];
  const n = (k) => Number(String(d[k] ?? '').replace(',', '.'));
  for (const [k, t] of [['LARGO_A_MM', 'Largo A'], ['ANCHO_B_MM', 'Ancho B'], ['ALTO_H_MM', 'Alto H']]) {
    const v = n(k);
    if (d[k] !== '' && d[k] !== undefined && v > 0 && v < 60) avisos.push(`${t} = ${v} mm parece estar en centímetros (¿${v * 10} mm?)`);
    if (v > 2000) avisos.push(`${t} = ${v} mm es muy grande para una caja`);
  }
  const p = n('PESO_KG');
  if (d.PESO_KG !== '' && d.PESO_KG !== undefined && (p <= 0 || p > 80)) avisos.push(`Peso ${p} kg fuera de lo normal para una caja o bulto`);
  if (n('ANCHO_B_MM') > n('LARGO_A_MM') && n('LARGO_A_MM') > 0) avisos.push('El ancho B es mayor que el largo A: se intercambian al guardar');
  return avisos;
}
