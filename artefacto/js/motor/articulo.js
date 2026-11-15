// Convierte una fila de la hoja UBICACIONES en un artículo que entiende el motor.
// Medidas en milímetros enteros y peso en kg.

const SI = (v) => String(v ?? '').trim().toUpperCase().startsWith('S');
// Valor para los datos que no aplican a un artículo (se escribe en el formulario o en Excel).
export const NO_APLICA = 'NO APLICA';
export const noAplica = (v) => String(v ?? '').trim().toUpperCase().replace(/[\/.]/g, '') === 'NO APLICA' || String(v ?? '').trim().toUpperCase() === 'N/A';

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
  // Medidas o peso "no aplica": la posición queda completa, pero sin medidas no entra al cálculo del palet.
  for (const [k, v, t] of [['LARGO_A_MM', largo, 'largo A'], ['ANCHO_B_MM', ancho, 'ancho B'], ['ALTO_H_MM', alto, 'alto H'], ['PESO_KG', peso, 'peso']]) {
    if (noAplica(f[k])) faltan.push(`${t} (no aplica)`);
    else if (!v) faltan.push(t);
  }
  if (!String(f.EMPAQUE ?? '').trim()) faltan.push('empaque');
  if (!String(f.LIQUIDO ?? '').trim()) faltan.push('líquido');
  if (!String(f.DELICADO ?? '').trim()) faltan.push('delicado');

  const empaque = String(f.EMPAQUE ?? 'CAJA').trim().toUpperCase() === 'BULTO' ? 'BULTO' : 'CAJA';   // "no aplica" → caja
  const liquido = SI(f.LIQUIDO);
  const delicado = SI(f.DELICADO);
  const articulo = {
    codigo: noAplica(f.CODIGO_ARTICULO) ? `SIN-CODIGO-${f.CODIGO}` : String(f.CODIGO_ARTICULO ?? '').trim(),
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
