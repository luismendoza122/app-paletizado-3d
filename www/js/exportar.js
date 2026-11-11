// Exportar a Excel (para editar en el PC y volver a cargar), diagnóstico en texto y guardar archivos
// en el navegador o en la APK (en la APK se abre "Compartir": Drive, WhatsApp, correo, Descargas…).
import { COLUMNAS, estadoDe } from './datos/layout.js';

const hoy = () => new Date().toISOString().slice(0, 10);

// Hojas del libro de Excel. Devuelve { nombreHoja: [filas] } (sin depender de la biblioteca de Excel).
export function hojasExcel(ctx) {
  const hojas = {};
  // UBICACIONES: todas las posiciones, con las mismas columnas que se importan (se puede editar y volver a cargar).
  hojas.UBICACIONES = ctx.filas.map((f) => Object.fromEntries(COLUMNAS.map((c) => [c, c === 'ESTADO'
    ? (f.ESTADO === 'DIVIDIDA' ? 'DIVIDIDA' : estadoDe(f)) : (f[c] ?? '')])));
  // ARTICULOS: un renglón por posición con artículo y su clase de arrume.
  hojas.ARTICULOS = (ctx.posiciones || []).map((p) => ({
    UBICACION: p.fila.CODIGO, ZONA: p.fila.SECCION, PASILLO: p.fila.PASILLO, SECUENCIA_RUTA: Number(p.fila.SECUENCIA_RUTA) || '',
    CODIGO_ARTICULO: p.art.codigo, ARTICULO: p.art.nombre,
    LARGO_A_MM: p.art.largo || '', ANCHO_B_MM: p.art.ancho || '', ALTO_H_MM: p.art.alto || '', PESO_KG: p.art.peso || '',
    EMPAQUE: p.art.empaque, LIQUIDO: p.art.liquido ? 'SI' : 'NO', DELICADO: p.art.delicado ? 'SI' : 'NO',
    INDICE_ARRUME: p.ia == null ? '' : Math.round(p.ia * 1000) / 1000, CLASE: p.clase || '',
    FALTAN_DATOS: (p.faltan || []).join(', '), LINEAS_EN_PEDIDOS: p.lineas || 0,
  }));
  if (ctx.propuesta?.movimientos?.length) {
    hojas.REUBICACION = ctx.propuesta.movimientos.map((m, i) => ({
      ORDEN: i + 1, CODIGO_ARTICULO: m.codigoArticulo, ARTICULO: m.articulo, CLASE: m.clase,
      UBICACION_ACTUAL: m.desde, UBICACION_NUEVA: m.hacia, PASILLO: m.pasillo, HECHO: '',
    }));
  }
  if (ctx.pedidos?.length) hojas.PEDIDOS = ctx.pedidos.map((l) => ({ ...l }));
  if (ctx.pruebaPedidos?.length) hojas.PRUEBA_PEDIDOS = ctx.pruebaPedidos.map((l) => ({ ...l }));
  if (ctx.diag) hojas.DIAGNOSTICO = filasDiagnostico(ctx.diag);
  return hojas;
}

export function filasDiagnostico(d) {
  const filas = [];
  const add = (SECCION, INDICADOR, VALOR) => filas.push({ SECCION, INDICADOR, VALOR });
  add('General', 'Fecha', hoy());
  add('Avance', 'Posiciones totales', d.av.total);
  add('Avance', 'Revisadas', d.av.revisadas);
  add('Avance', 'Completas', d.av.COMPLETA);
  add('Avance', 'Con datos a medias', d.av.INCOMPLETA);
  add('Avance', 'Vacías (no cuentan)', d.av.VACIA);
  add('Avance', 'Sin revisar', d.av['SIN REVISAR']);
  add('Avance', 'Artículos listos para calcular', d.listas);
  for (const z of d.zonas || []) add(`Zona ${z.zona}`, 'Revisadas / total', `${z.revisadas} / ${z.total} (completas ${z.COMPLETA})`);
  (d.mejoras || []).forEach((m, i) => add('Mejoras', `${i + 1}`, m.texto));
  add('Siguiente paso', '', d.siguiente);
  return filas;
}

// Diagnóstico en texto, para copiar o mandar por WhatsApp.
export function textoDiagnostico(d) {
  const pct = d.av.total ? Math.round((d.av.revisadas / d.av.total) * 100) : 0;
  const l = [
    `*Diagnóstico Paletizado 3D – CEDI ATS R10* (${hoy()})`,
    `Avance: ${d.av.revisadas} de ${d.av.total} posiciones revisadas (${pct} %).`,
    `Completas ${d.av.COMPLETA} · a medias ${d.av.INCOMPLETA} · vacías ${d.av.VACIA} · sin revisar ${d.av['SIN REVISAR']}.`,
    `Artículos listos para calcular: ${d.listas}.`,
  ];
  const zonas = (d.zonas || []).filter((z) => z.revisadas);
  if (zonas.length) l.push('', '*Por zona*', ...zonas.map((z) => `- ${z.zona}: ${z.revisadas}/${z.total} (completas ${z.COMPLETA})`));
  if (d.mejoras?.length) l.push('', '*Mejoras sugeridas*', ...d.mejoras.map((m, i) => `${i + 1}. ${m.texto}`));
  l.push('', `*Siguiente paso:* ${d.siguiente}`);
  return l.join('\n');
}

// Arma el .xlsx con la biblioteca SheetJS (window.XLSX). Devuelve un Blob.
export function libroExcel(hojas) {
  const X = window.XLSX;
  if (!X) throw new Error('No se cargó la biblioteca de Excel. Revisa la conexión y vuelve a abrir la app.');
  const libro = X.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const hoja = filas.length ? X.utils.json_to_sheet(filas) : X.utils.aoa_to_sheet([['Sin datos']]);
    if (filas.length) {
      const cols = Object.keys(filas[0]);
      hoja['!cols'] = cols.map((c) => ({ wch: Math.min(45, Math.max(c.length + 2, ...filas.slice(0, 200).map((f) => String(f[c] ?? '').length + 1))) }));
      hoja['!autofilter'] = { ref: hoja['!ref'] };
    }
    X.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  }
  const datos = X.write(libro, { bookType: 'xlsx', type: 'array', compression: true });
  return new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const nombreArchivo = (base, ext) => `${base}-${hoy()}.${ext}`;

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => mal(r.error);
    r.readAsDataURL(blob);
  });
}

// Guarda un archivo. En la APK lo deja en el celular y abre "Compartir"; en el navegador lo descarga.
export async function guardarArchivo(nombre, blob) {
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.() && cap.registerPlugin) {
    const Filesystem = cap.registerPlugin('Filesystem');
    const Share = cap.registerPlugin('Share');
    const { uri } = await Filesystem.writeFile({ path: nombre, data: await aBase64(blob), directory: 'CACHE' });
    try { await Share.share({ title: nombre, files: [uri], dialogTitle: 'Guardar o enviar' }); }
    catch (e) { if (!/cancel/i.test(String(e?.message || e))) throw e; }
    return 'compartido';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'descargado';
}
