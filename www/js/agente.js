// Agente Paletizado: revisa los datos tomados, propone mejoras y movimientos, y responde preguntas.
// Funciona sin internet, con las reglas del proyecto (no es un chat de IA en línea).
import { ZONAS, estadoDe } from './datos/layout.js';
import { proponerReubicacion } from './motor/reubicacion.js';

const RANGO = { BASE: 0, MEDIO: 1, TOPE: 2 };
const sinTildes = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function pasillosDe(filas) {
  return [...new Set(filas.filter((f) => f.ESTADO !== 'DIVIDIDA').map((f) => f.PASILLO))];
}

function avance(filas) {
  const vivas = filas.filter((f) => f.ESTADO !== 'DIVIDIDA');
  const c = { total: vivas.length, 'SIN REVISAR': 0, VACIA: 0, INCOMPLETA: 0, COMPLETA: 0 };
  vivas.forEach((f) => { c[estadoDe(f)]++; });
  c.revisadas = c.total - c['SIN REVISAR'];
  return c;
}

// Análisis de un pasillo en el orden de la ruta: qué tan bien está el orden BASE → MEDIO → TOPE.
export function analizarPasillo(posiciones, pasillo) {
  const lista = posiciones.filter((p) => p.fila.PASILLO === pasillo && p.clase && !p.faltan.length)
    .sort((a, b) => Number(a.fila.SECUENCIA_RUTA) - Number(b.fila.SECUENCIA_RUTA));
  const n = lista.length;
  let malas = 0, pares = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { pares++; if (RANGO[lista[i].clase] > RANGO[lista[j].clase]) malas++; }
  const tercio = Math.max(1, Math.ceil(n / 3));
  const inicio = lista.slice(0, tercio), fin = lista.slice(n - tercio);
  return {
    pasillo, n, lista,
    orden: pares ? Math.round((1 - malas / pares) * 100) : 100, // 100 % = orden perfecto
    delicadosAlInicio: inicio.filter((p) => p.art.delicado),
    pesadosAlFinal: fin.filter((p) => p.clase === 'BASE'),
    livianosAlInicio: inicio.filter((p) => p.clase === 'TOPE'),
  };
}

// Lista de mejoras priorizada para todo el CEDI (o una zona).
export function mejoras(ctx, zona = '') {
  const res = [];
  const filas = ctx.filas.filter((f) => !zona || f.SECCION === zona);
  const incompletas = filas.filter((f) => estadoDe(f) === 'INCOMPLETA');
  if (incompletas.length) res.push({ prioridad: 1, texto: `Completar ${incompletas.length} posiciones con datos a medias (ej. ${incompletas.slice(0, 3).map((f) => f.CODIGO).join(', ')}). Sin datos completos no entran al cálculo.` });
  const sospechosas = ctx.posiciones.filter((p) => (!zona || p.fila.SECCION === zona) && p.art.largo > 0 && (p.art.largo < 60 || p.art.ancho < 60 || p.art.alto < 60));
  if (sospechosas.length) res.push({ prioridad: 1, texto: `Revisar medidas que parecen estar en centímetros: ${sospechosas.slice(0, 5).map((p) => `${p.fila.CODIGO} ${p.art.nombre}`).join('; ')}.` });
  for (const pas of pasillosDe(filas)) {
    const a = analizarPasillo(ctx.posiciones, pas);
    if (a.n < 3) continue;
    if (a.delicadosAlInicio.length) res.push({ prioridad: 2, texto: `Pasillo ${pas}: hay ${a.delicadosAlInicio.length} delicados al inicio de la ruta (${a.delicadosAlInicio.slice(0, 3).map((p) => `${p.art.nombre} en ${p.fila.CODIGO}`).join(', ')}). Quedarían abajo en el palet: pasarlos al final del pasillo.` });
    if (a.pesadosAlFinal.length) res.push({ prioridad: 2, texto: `Pasillo ${pas}: ${a.pesadosAlFinal.length} artículos pesados (BASE) están al final (${a.pesadosAlFinal.slice(0, 3).map((p) => `${p.art.nombre} en ${p.fila.CODIGO}`).join(', ')}). Quedarían encima: pasarlos a los primeros módulos.` });
    if (a.orden < 80) res.push({ prioridad: 3, texto: `Pasillo ${pas}: el orden de la ruta está al ${a.orden} % de lo ideal (BASE → MEDIO → TOPE). Calcular la reubicación de este pasillo.` });
  }
  const sinRevisar = filas.filter((f) => estadoDe(f) === 'SIN REVISAR').length;
  if (sinRevisar) res.push({ prioridad: 4, texto: `Faltan ${sinRevisar} posiciones por revisar${zona ? ` en ${zona}` : ''}. Las vacías se marcan como vacías para que no cuenten.` });
  return res.sort((x, y) => x.prioridad - y.prioridad);
}

export function diagnostico(ctx) {
  const av = avance(ctx.filas);
  const zonas = ZONAS.map(({ zona }) => ({ zona, ...avance(ctx.filas.filter((f) => f.SECCION === zona)) }));
  const listas = ctx.posiciones.filter((p) => !p.faltan.length && p.clase);
  let siguiente;
  if (av.COMPLETA < 10) siguiente = 'Tomar datos de un pasillo completo como piloto (pestaña "Tomar datos").';
  else if (!ctx.pedidos.length) siguiente = 'Cargar 10 a 20 pedidos reales de tiendas en la hoja PEDIDOS para probar.';
  else if (!ctx.propuesta) siguiente = 'Calcular la reubicación (pestaña "Reubicar") y luego probar los pedidos.';
  else siguiente = 'Probar todos los pedidos con la propuesta y llevar el plan de movimientos al supervisor.';
  return { av, zonas, listas: listas.length, mejoras: mejoras(ctx).slice(0, 8), siguiente };
}

function buscarPasillo(texto, filas) {
  const t = sinTildes(texto);
  const cod = t.match(/\b(la5[2-4]|te6[23]|fv42|co3[12])\b/);
  if (cod) return cod[1].toUpperCase();
  const num = t.match(/pasillo\s*(\d{1,2})\b/);
  if (num) {
    const p = num[1].padStart(2, '0');
    if (pasillosDe(filas).includes(p)) return p;
  }
  return null;
}

function buscarZona(texto) {
  const t = sinTildes(texto);
  if (t.includes('no alimento')) return 'Seco no alimentos';
  if (t.includes('alimento')) return 'Seco alimentos';
  for (const { zona } of ZONAS) if (t.includes(sinTildes(zona))) return zona;
  return '';
}

function buscarArticulo(texto, posiciones) {
  const t = sinTildes(texto);
  const porCodigo = posiciones.find((p) => p.art.codigo && t.includes(sinTildes(p.art.codigo)) && p.art.codigo.length >= 3);
  if (porCodigo) return porCodigo.art.codigo;
  let mejor = null, puntos = 0;
  const palabras = t.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  for (const p of posiciones) {
    const nombre = sinTildes(p.art.nombre);
    const s = palabras.filter((w) => nombre.includes(w)).length;
    if (s > puntos) { puntos = s; mejor = p.art.codigo; }
  }
  return puntos ? mejor : null;
}

// Busca en el aprendizaje diario las entradas que más se parecen a la pregunta.
export function buscarConocimiento(pregunta, conocimiento) {
  const palabras = sinTildes(pregunta).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !['como', 'para', 'esto', 'esta', 'cual', 'cuales', 'donde', 'sobre', 'tiene', 'hacer'].includes(w));
  if (!palabras.length) return [];
  const puntuadas = conocimiento.map((k) => {
    const texto = sinTildes(`${k.tema} ${k.titulo} ${k.contenido}`);
    return { k, p: palabras.filter((w) => texto.includes(w)).length };
  }).filter((x) => x.p >= Math.min(2, palabras.length)).sort((a, b) => b.p - a.p);
  return puntuadas.slice(0, 2).map((x) => x.k);
}

// Devuelve una lista de párrafos (texto plano) como respuesta.
export function responder(pregunta, ctx) {
  const t = sinTildes(pregunta);
  const pasillo = buscarPasillo(pregunta, ctx.filas);
  const zona = buscarZona(pregunta);

  if (/hola|buen(os|as)|ayuda|que (puedes|sabes)|como funciona/.test(t) && t.length < 40) {
    return ['Soy el agente de paletizado del CEDI. Puedo decirte:',
      '• Cuánto falta por tomar (todo el CEDI, una zona o un pasillo).',
      '• Qué mejoras hacer y qué movimientos van primero.',
      '• Dónde debe ir un artículo y por qué.',
      '• Cómo tomar las medidas y qué significa BASE, MEDIO y TOPE.',
      'Ejemplos: "¿cómo voy en el pasillo 12?", "¿qué movimientos hago primero en alimentos?", "¿dónde va el aceite?"'];
  }

  if (/aprendi|aprendizaje|que sabes de|hoy aprend|novedad/.test(t)) {
    const k = ctx.conocimiento || [];
    if (!k.length) return ['Todavía no tengo aprendizaje guardado en este celular. Cuando haya internet lo bajo solo (cada día aprendo de gestión logística, WPMS/WMS, SAP y análisis de datos).'];
    return ['Lo último que aprendí:', ...k.slice(0, 3).map((x) => `• ${x.fecha} · ${x.tema}: ${x.titulo}. ${x.contenido.slice(0, 220)}${x.contenido.length > 220 ? '…' : ''}`)];
  }

  if (/medir|medida|como tomo|tomar dato|cm|centimetro|pesar/.test(t)) {
    return ['Cómo tomar los datos de una posición:',
      '1. Artículo y código tal como salen en la etiqueta o en el WPMS.',
      '2. Medidas de la caja en milímetros: A = largo (el lado más largo de la base), B = ancho, H = alto. Mide 3 cajas y anota la mayor (las cajas se abomban).',
      '3. Peso de una caja o bulto en kg (báscula).',
      '4. Empaque: CAJA o BULTO (saco). Líquido: SÍ si tiene botellas, galones o bolsas con líquido. Delicado: SÍ si se aplasta o se rompe (huevos, galletas, papas, vidrio delicado).',
      '5. Si la posición está vacía, márcala como vacía: no cuenta.',
      'Si el mismo artículo está en otra posición, al escribir su código la app llena el resto sola.'];
  }

  if (/base|medio|tope|clase|indice|que significa/.test(t)) {
    return ['Cada artículo recibe un índice de 0 a 1 según su peso (45 %), lo que aguanta encima (30 %), su densidad (15 %) y su altura (10 %). Bulto y líquido suben; delicado siempre baja.',
      '• BASE: pesado y resistente. Va al inicio del pasillo para que quede abajo en el palet.',
      '• MEDIO: va en el centro del pasillo.',
      '• TOPE: liviano o delicado. Va al final del pasillo para que quede arriba.',
      'Así cualquier tarea que empiece en un pasillo arranca con base firme, aunque la tarea sea de 5 o de 200 cajas.'];
  }

  if (/donde va|donde ubic|ubicar|donde pongo|donde deberia/.test(t)) {
    const cod = buscarArticulo(pregunta, ctx.posiciones);
    if (!cod) return ['No encontré ese artículo entre los datos tomados. Escribe su código o parte del nombre como está en la toma de datos.'];
    const ps = ctx.posiciones.filter((p) => p.art.codigo === cod);
    const p = ps[0];
    const r = [`${p.art.nombre} (${cod}): clase ${p.clase || 'sin calcular'}${p.ia !== null ? `, índice ${p.ia}` : ''}. ${p.art.liquido ? 'Es líquido. ' : ''}${p.art.delicado ? 'Es delicado. ' : ''}${p.art.empaque === 'BULTO' ? 'Es bulto. ' : ''}`,
      `Está hoy en: ${ps.map((x) => x.fila.CODIGO).join(', ')}.`];
    const mov = ctx.propuesta?.movimientos.filter((m) => m.codigoArticulo === cod) || [];
    if (mov.length) r.push(`La propuesta lo mueve: ${mov.map((m) => `${m.desde} → ${m.hacia}`).join(', ')}.`);
    else if (ctx.propuesta) r.push('En la propuesta actual se queda donde está.');
    else r.push(p.clase === 'BASE' ? 'Debe ir en los primeros módulos de su pasillo.' : p.clase === 'TOPE' ? 'Debe ir en los últimos módulos de su pasillo.' : 'Debe ir en la parte central de su pasillo.');
    return r;
  }

  if (/movimiento|mover|reubic|plan/.test(t)) {
    const usables = ctx.posiciones.filter((p) => !p.faltan.length && p.clase && (!zona || p.fila.SECCION === zona) && (!pasillo || p.fila.PASILLO === pasillo));
    if (usables.length < 2) return ['Todavía no hay suficientes posiciones con datos completos para proponer movimientos.'];
    const pr = proponerReubicacion(usables);
    if (!pr.movimientos.length) return ['Con los datos que hay, el orden ya está bien: no hace falta mover nada.'];
    // Primero los que más ayudan: BASE que hoy están al final y TOPE que hoy están al inicio.
    const sec = new Map(ctx.filas.map((f) => [f.CODIGO, Number(f.SECUENCIA_RUTA)]));
    const ganancia = (m) => Math.abs(sec.get(m.desde) - sec.get(m.hacia)) * (m.clase === 'MEDIO' ? 0.5 : 1);
    const top = [...pr.movimientos].sort((a, b) => ganancia(b) - ganancia(a)).slice(0, 8);
    return [`${pr.movimientos.length} movimientos propuestos${pasillo ? ` en el pasillo ${pasillo}` : zona ? ` en ${zona}` : ''}${pr.ciclos ? ` (${pr.ciclos} cadenas cerradas: hace falta una ubicación temporal libre)` : ''}. Los que más mejoran el armado:`,
      ...top.map((m, i) => `${i + 1}. ${m.articulo} (${m.clase}): ${m.desde} → ${m.hacia}`),
      'El plan completo está en la pestaña "Reubicar". La aprobación es del supervisor y el cambio en el WPMS lo hace el CEDI.'];
  }

  if (/mejora|mejorar|problema|revis|que hago|recomienda/.test(t)) {
    const m = mejoras(ctx, zona);
    if (pasillo) {
      const a = analizarPasillo(ctx.posiciones, pasillo);
      return [`Pasillo ${pasillo}: ${a.n} posiciones con datos completos; orden de la ruta al ${a.orden} % de lo ideal.`,
        a.delicadosAlInicio.length ? `Delicados al inicio: ${a.delicadosAlInicio.map((p) => `${p.art.nombre} (${p.fila.CODIGO})`).join(', ')}.` : 'No hay delicados al inicio.',
        a.pesadosAlFinal.length ? `Pesados al final: ${a.pesadosAlFinal.map((p) => `${p.art.nombre} (${p.fila.CODIGO})`).join(', ')}.` : 'No hay pesados al final.',
        'Pregúntame "¿qué movimientos hago en el pasillo ' + pasillo + '?" para ver el plan.'];
    }
    return m.length ? ['Mejoras, de la más urgente a la menos:', ...m.slice(0, 10).map((x, i) => `${i + 1}. ${x.texto}`)] : ['No encuentro mejoras pendientes con los datos actuales.'];
  }

  if (/falta|avance|como voy|progreso|cuanto|pendiente|vacia/.test(t)) {
    const filas = ctx.filas.filter((f) => (!pasillo || f.PASILLO === pasillo) && (!zona || f.SECCION === zona));
    const a = avance(filas);
    const donde = pasillo ? `el pasillo ${pasillo}` : zona || 'todo el CEDI';
    const prox = filas.filter((f) => estadoDe(f) === 'SIN REVISAR').slice(0, 5).map((f) => f.CODIGO);
    return [`En ${donde}: ${a.revisadas} de ${a.total} posiciones revisadas (${pct(a.revisadas, a.total)} %).`,
      `Completas: ${a.COMPLETA} · Incompletas: ${a.INCOMPLETA} · Vacías: ${a.VACIA} · Sin revisar: ${a['SIN REVISAR']}.`,
      prox.length ? `Siguientes en la ruta: ${prox.join(', ')}.` : 'No quedan posiciones sin revisar aquí.'];
  }

  if (/pedido|tienda|probar|prueba/.test(t)) {
    const n = new Set(ctx.pedidos.map((p) => p.PEDIDO)).size;
    return n ? [`Hay ${n} pedidos cargados. En la pestaña "Pedidos" puedes armar cada uno con la ubicación actual y con la propuesta y comparar cajas mal puestas, sobrepeso y delicados aplastados.`]
      : ['No hay pedidos cargados. Llena la hoja PEDIDOS (pedido, tienda, fecha, código, artículo, cajas, estibas de la tarea) y cárgala en Inicio.'];
  }

  if (/palet|estiba|altura|peso max|carga/.test(t)) {
    const p = ctx.palet;
    return [`Estiba configurada: ${p.largo} × ${p.ancho} mm, base ${p.altoBase} mm, altura máxima total ${p.alturaMaxTotal} mm, carga máxima ${p.cargaMax} kg.`,
      ctx.paletConfirmado ? 'Estos valores ya fueron confirmados en Ajustes.' : 'Ojo: son valores de ejemplo hasta que los confirmes con el CEDI en Ajustes.'];
  }

  const saber = buscarConocimiento(pregunta, ctx.conocimiento || []);
  if (saber.length) return [...saber.flatMap((k) => [`${k.tema} — ${k.titulo} (${k.fecha}):`, k.contenido]), 'Esto viene del aprendizaje diario del agente.'];

  return ['No entendí bien la pregunta. Prueba con: "¿cómo voy?", "¿qué mejoras hay en el pasillo 12?", "¿qué movimientos hago primero?", "¿dónde va el arroz?" o "¿cómo tomo las medidas?".'];
}
