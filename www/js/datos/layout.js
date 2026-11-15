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

// Estado de una posición: SIN REVISAR · VACIA · INCOMPLETA · COMPLETA (DIVIDIDA solo en datos viejos: se une al cargar)
export function estadoDe(f) {
  if (f.ESTADO === 'DIVIDIDA') return 'DIVIDIDA';
  if (f.ESTADO === 'VACIA') return 'VACIA';
  const tieneAlgo = CAMPOS_ARTICULO.some((k) => String(f[k] ?? '').trim() !== '');
  if (!tieneAlgo) return 'SIN REVISAR';
  const obligatorios = ['ARTICULO', 'CODIGO_ARTICULO', 'LARGO_A_MM', 'ANCHO_B_MM', 'ALTO_H_MM', 'PESO_KG', 'EMPAQUE', 'LIQUIDO', 'DELICADO'];
  return obligatorios.every((k) => String(f[k] ?? '').trim() !== '') ? 'COMPLETA' : 'INCOMPLETA';
}

// Mezcla filas importadas (de la hoja) sobre el mapa: por CODIGO. Las que no existan (posiciones agregadas) se agregan.
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
  return quitarDivisiones(ordenar(filas)).filas;
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

// x1 y x2 son fijas; las agregadas (x3, y1…z3) se pueden borrar.
export const esAgregada = (f) => !!f.POSICION && !POSICIONES_BASE.includes(f.POSICION);

// ¿Cuenta en el avance? No cuentan las madres divididas ni las agregadas sin llenar o vacías.
export const cuenta = (f) => f.ESTADO !== 'DIVIDIDA' && !(esAgregada(f) && ['SIN REVISAR', 'VACIA'].includes(estadoDe(f)));

// Borra una posición agregada. Devuelve { filas, borradas }.
export function borrarPosicion(filas, codigo) {
  const f = filas.find((x) => x.CODIGO === codigo);
  if (!f || !esAgregada(f) || f.SUBPOSICION) return { filas, borradas: [] };
  const codigos = new Set([codigo, `${codigo}A`, `${codigo}B`]);
  return { filas: filas.filter((x) => !codigos.has(x.CODIGO)), borradas: filas.filter((x) => codigos.has(x.CODIGO)) };
}

export function ordenar(filas) {
  const ordenZona = new Map(ZONAS.map((z, i) => [z.zona, i]));
  return filas.sort((a, b) => (ordenZona.get(a.SECCION) ?? 99) - (ordenZona.get(b.SECCION) ?? 99) || Number(a.SECUENCIA_RUTA) - Number(b.SECUENCIA_RUTA) || String(a.CODIGO).localeCompare(String(b.CODIGO)));
}

// Las posiciones ya NO se dividen en A y B (solo x1, x2 y las agregadas x3, y1…z3).
// Si un celular o un Excel trae divisiones de antes, se vuelven a unir:
// la madre recibe los datos de la A (o de la B si la A está vacía); si las dos tenían artículo,
// el de la B pasa a la primera posición libre del módulo (x3, y1…) para no perder datos.
const UBICACION_FIJA = ['CODIGO', 'SECCION', 'PASILLO', 'MODULO', 'POSICION', 'SUBPOSICION', 'SECUENCIA_RUTA'];
function pasarDatos(de, a) {
  for (const [k, v] of Object.entries(de)) if (!UBICACION_FIJA.includes(k) && !k.startsWith('_') && v !== '' && v !== undefined) a[k] = v;
  a._pendiente = true;
}
export function quitarDivisiones(filas) {
  const hijas = filas.filter((f) => /[AB]$/.test(f.CODIGO) && RE_UBICACION.test(f.CODIGO));
  if (!hijas.length && !filas.some((f) => f.ESTADO === 'DIVIDIDA')) return { filas, quitadas: [], movidas: [] };
  let resultado = filas.filter((f) => !hijas.includes(f));
  const quitadas = [];
  const movidas = [];
  const grupos = new Map();
  for (const h of hijas) {
    const madre = h.CODIGO.slice(0, -1);
    if (!grupos.has(madre)) grupos.set(madre, []);
    grupos.get(madre).push(h);
  }
  for (const [codMadre, hs] of grupos) {
    hs.sort((x, y) => x.CODIGO.localeCompare(y.CODIGO));
    const [, pasillo, modulo, posicion] = codMadre.match(RE_UBICACION);
    let madre = resultado.find((f) => f.CODIGO === codMadre);
    if (!madre) {
      const h = hs[0];
      madre = { CODIGO: codMadre, SECCION: h.SECCION, PASILLO: pasillo, MODULO: modulo, POSICION: posicion, SUBPOSICION: '', SECUENCIA_RUTA: r2(Number(h.SECUENCIA_RUTA) - 0.05), BLOQUEADA: h.BLOQUEADA || 'NO' };
      resultado.push(madre);
    }
    const conDatos = hs.filter((h) => ['COMPLETA', 'INCOMPLETA'].includes(estadoDe({ ...h, ESTADO: '' })));
    if (conDatos[0]) {
      pasarDatos(conDatos[0], madre);
      madre.ESTADO = estadoDe({ ...madre, ESTADO: '' });
    } else {
      madre.ESTADO = hs.length && hs.every((h) => h.ESTADO === 'VACIA') ? 'VACIA' : 'SIN REVISAR';
      if (madre._version || madre.ESTADO === 'VACIA') madre._pendiente = true;
    }
    madre.SUBPOSICION = '';
    for (const extra of conDatos.slice(1)) {
      const libre = posicionesDisponibles(resultado, pasillo, modulo)[0];
      if (!libre) continue;
      const r = agregarPosiciones(resultado, pasillo, modulo, [libre]);
      resultado = r.filas;
      const nueva = resultado.find((f) => f.CODIGO === r.nuevas[0]);
      pasarDatos(extra, nueva);
      nueva.ESTADO = estadoDe({ ...nueva, ESTADO: '' });
      movidas.push({ de: extra.CODIGO, a: nueva.CODIGO });
    }
    quitadas.push(...hs);
  }
  // Madres que quedaron marcadas como divididas sin hijas
  for (const f of resultado) if (f.ESTADO === 'DIVIDIDA') { f.ESTADO = estadoDe({ ...f, ESTADO: '' }); if (f._version) f._pendiente = true; }
  return { filas: ordenar(resultado), quitadas, movidas };
}

// Catálogo de artículos ya tomados (para autocompletar cuando el mismo artículo está en otra posición).
export function catalogo(filas) {
  const m = new Map();
  for (const f of filas) {
    const cod = String(f.CODIGO_ARTICULO ?? '').trim();
    if (!cod || cod.toUpperCase() === 'NO APLICA' || estadoDe(f) !== 'COMPLETA') continue;
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
