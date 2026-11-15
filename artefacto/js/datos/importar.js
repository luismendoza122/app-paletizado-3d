// Lee el Excel (.xlsx) descargado de la hoja "Ubicaciones CEDI" o un .csv.
// Devuelve { ubicaciones: [...filas], pedidos: [...filas] } con nombres de columna en MAYÚSCULAS.

function normalizarClave(k) {
  return String(k ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
}

function normalizarFilas(filas) {
  return filas
    .map((f) => {
      const o = {};
      for (const [k, v] of Object.entries(f)) o[normalizarClave(k)] = typeof v === 'string' ? v.replace(/^'/, '').trim() : v;
      return o;
    })
    .filter((o) => Object.values(o).some((v) => v !== '' && v !== null && v !== undefined));
}

// CSV sencillo con comillas, separador , o ;
export function leerCSV(texto) {
  const primera = texto.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let campo = '', fila = [], comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...resto] = filas;
  if (!cab) return [];
  return normalizarFilas(resto.map((r) => Object.fromEntries(cab.map((k, i) => [k, r[i] ?? '']))));
}

function tipoDeFilas(filas) {
  const claves = new Set(Object.keys(filas[0] || {}));
  if (claves.has('SECUENCIA_RUTA') || claves.has('MODULO')) return 'ubicaciones';
  if (claves.has('PEDIDO') && claves.has('CAJAS')) return 'pedidos';
  return null;
}

export async function leerArchivo(archivo) {
  const nombre = archivo.name.toLowerCase();
  const salida = { ubicaciones: null, pedidos: null, avisos: [] };
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
    const filas = leerCSV(await archivo.text());
    const tipo = tipoDeFilas(filas);
    if (!tipo) salida.avisos.push('No reconocí las columnas del CSV (se esperan las de UBICACIONES o PEDIDOS).');
    else salida[tipo] = filas;
    return salida;
  }
  if (!window.XLSX) {
    salida.avisos.push('No se pudo cargar el lector de Excel. Descarga la hoja como CSV e impórtala así.');
    return salida;
  }
  const libro = window.XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
  for (const nombreHoja of libro.SheetNames) {
    const filas = normalizarFilas(window.XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { defval: '', raw: true }));
    if (!filas.length) continue;
    const tipo = tipoDeFilas(filas);
    if (tipo && !salida[tipo]) salida[tipo] = filas;
  }
  if (!salida.ubicaciones && !salida.pedidos) salida.avisos.push('El Excel no tiene hojas UBICACIONES ni PEDIDOS con las columnas esperadas.');
  return salida;
}

export function aCSV(filas, columnas) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columnas.map(([, t]) => esc(t)).join(','), ...filas.map((f) => columnas.map(([k]) => esc(f[k])).join(','))].join('\n');
}
