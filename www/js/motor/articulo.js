// Convierte una fila de la hoja UBICACIONES en un artículo que entiende el motor.
// Medidas en milímetros enteros y peso en kg.

const SI = (v) => String(v ?? '').trim().toUpperCase().startsWith('S');

export function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Devuelve { articulo, faltan } donde faltan es la lista de datos que no están.
export function articuloDesdeFila(f) {
  const largo = numero(f.LARGO_A_MM);
  const ancho = numero(f.ANCHO_B_MM);
  const alto = numero(f.ALTO_H_MM);
  const peso = numero(f.PESO_KG);
  const faltan = [];
  if (!String(f.ARTICULO ?? '').trim()) faltan.push('artículo');
  if (!String(f.CODIGO_ARTICULO ?? '').trim()) faltan.push('código');
  if (!largo) faltan.push('largo A');
  if (!ancho) faltan.push('ancho B');
  if (!alto) faltan.push('alto H');
  if (!peso) faltan.push('peso');
  if (!String(f.EMPAQUE ?? '').trim()) faltan.push('empaque');
  if (!String(f.LIQUIDO ?? '').trim()) faltan.push('líquido');
  if (!String(f.DELICADO ?? '').trim()) faltan.push('delicado');

  const empaque = String(f.EMPAQUE ?? 'CAJA').trim().toUpperCase() === 'BULTO' ? 'BULTO' : 'CAJA';
  const liquido = SI(f.LIQUIDO);
  const delicado = SI(f.DELICADO);
  const articulo = {
    codigo: String(f.CODIGO_ARTICULO ?? '').trim(),
    nombre: String(f.ARTICULO ?? '').trim(),
    largo: Math.round(largo || 0),
    ancho: Math.round(ancho || 0),
    alto: Math.round(alto || 0),
    peso: peso || 0,
    empaque,
    liquido,
    delicado,
    fragil: delicado,
    // Líquidos siempre de pie. Las cajas también por defecto (flechas); el bulto se puede acostar.
    esteLadoArriba: empaque !== 'BULTO',
    maxCajasEncima: numero(f.MAX_CAJAS_ENCIMA),
    zona: String(f.SECCION ?? '').trim(),
  };
  return { articulo, faltan };
}

export function volumenM3(a) {
  return (a.largo * a.ancho * a.alto) / 1e9;
}
