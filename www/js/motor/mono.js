// Palet de un solo artículo (cajas iguales): mejor capa 2D y número de capas.
// Capa: programación dinámica de cortes de guillotina sobre puntos raster (Morabito y Morales).

// Valores a·l + b·w ≤ D, ordenados.
function raster(D, l, w) {
  const set = new Set();
  for (let a = 0; a * l <= D; a++) for (let b = 0; a * l + b * w <= D; b++) set.add(a * l + b * w);
  return [...set].sort((x, y) => x - y);
}

// Mayor punto raster ≤ v (búsqueda binaria).
function piso(lista, v) {
  let lo = 0, hi = lista.length - 1, r = 0;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (lista[m] <= v) { r = lista[m]; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

// Devuelve { n, rects:[{x,y,dx,dy}] } con la mayor cantidad de rectángulos l×w (girables) en L×W.
export function mejorCapa(L, W, l, w, limiteMs = 1500) {
  if (l <= 0 || w <= 0) return { n: 0, rects: [] };
  const rL = raster(L, Math.min(l, w), Math.max(l, w));
  const rW = raster(W, Math.min(l, w), Math.max(l, w));
  const cota = Math.floor((L * W) / (l * w));
  const memo = new Map();
  const inicio = Date.now();

  function unBloque(X, Y) {
    const a = Math.floor(X / l) * Math.floor(Y / w);
    const b = Math.floor(X / w) * Math.floor(Y / l);
    return a >= b ? { n: a, plan: { t: 'b', dx: l, dy: w } } : { n: b, plan: { t: 'b', dx: w, dy: l } };
  }

  function mejor(X, Y) {
    X = piso(rL, X); Y = piso(rW, Y);
    const k = X * 100000 + Y;
    const m = memo.get(k);
    if (m) return m;
    let best = unBloque(X, Y);
    const tope = Math.floor((X * Y) / (l * w));
    if (best.n < tope && Date.now() - inicio < limiteMs) {
      for (const x of rL) {
        if (x <= 0) continue;
        if (x > X / 2) break;
        const s = mejor(x, Y).n + mejor(X - x, Y).n;
        if (s > best.n) { best = { n: s, plan: { t: 'v', x, X, Y } }; if (s >= tope) break; }
      }
      if (best.n < tope) {
        for (const y of rW) {
          if (y <= 0) continue;
          if (y > Y / 2) break;
          const s = mejor(X, y).n + mejor(X, Y - y).n;
          if (s > best.n) { best = { n: s, plan: { t: 'h', y, X, Y } }; if (s >= tope) break; }
        }
      }
    }
    memo.set(k, best);
    return best;
  }

  function armar(X, Y, ox, oy, rects) {
    const sol = mejor(X, Y);
    const p = sol.plan;
    if (p.t === 'b') {
      const nx = Math.floor(piso(rL, X) / p.dx), ny = Math.floor(piso(rW, Y) / p.dy);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) rects.push({ x: ox + i * p.dx, y: oy + j * p.dy, dx: p.dx, dy: p.dy });
    } else if (p.t === 'v') {
      armar(p.x, Y, ox, oy, rects);
      armar(X - p.x, Y, ox + p.x, oy, rects);
    } else {
      armar(X, p.y, ox, oy, rects);
      armar(X, Y - p.y, ox, oy + p.y, rects);
    }
  }

  const sol = mejor(L, W);
  const rects = [];
  armar(L, W, 0, 0, rects);
  return { n: sol.n, rects, cota, optimo: sol.n >= cota };
}

// Orientaciones posibles: [huella1, huella2, altura].
function orientaciones(a) {
  const { largo: A, ancho: B, alto: H } = a;
  if (a.esteLadoArriba || a.liquido) return [[A, B, H]];
  return [[A, B, H], [A, H, B], [B, H, A]];
}

// Palet monorreferencia. palet: { largo, ancho, altoBase, tara, cargaMax, alturaMaxTotal, voladizoMax }
export function paletMono(a, palet, opciones = {}) {
  const { patron = 'auto', cantidad = null } = opciones;
  const faltan = [];
  if (!a.largo || !a.ancho || !a.alto) faltan.push('medidas');
  if (!a.peso) faltan.push('peso');
  if (!palet.alturaMaxTotal) faltan.push('altura máxima del palet');
  if (faltan.length) return { datosFaltantes: faltan, colocaciones: [] };

  const L = palet.largo + 2 * (palet.voladizoMax || 0);
  const W = palet.ancho + 2 * (palet.voladizoMax || 0);
  const util = palet.alturaMaxTotal - palet.altoBase;
  let mejorRes = null;
  for (const [l, w, h] of orientaciones(a)) {
    const capa = mejorCapa(L, W, l, w);
    if (capa.n === 0 || h > util) continue;
    const capasAltura = Math.floor(util / h);
    const capasCompresion = a.maxCajasEncima ? a.maxCajasEncima + 1 : Infinity;
    const cajasPorPeso = palet.cargaMax ? Math.floor(palet.cargaMax / a.peso) : Infinity;
    const capas = Math.min(capasAltura, capasCompresion, Math.ceil(cajasPorPeso / capa.n));
    let total = Math.min(capas * capa.n, cajasPorPeso);
    if (cantidad) total = Math.min(total, cantidad);
    let limitante = 'altura';
    if (cantidad && total === cantidad) limitante = 'cantidad';
    else if (total === cajasPorPeso && cajasPorPeso < capasAltura * capa.n) limitante = 'peso';
    else if (capasCompresion < capasAltura) limitante = 'compresion';
    const res = { l, w, h, capa, capas: Math.ceil(total / capa.n), total, limitante };
    if (!mejorRes || res.total > mejorRes.total || (res.total === mejorRes.total && res.capas * res.h < mejorRes.capas * mejorRes.h)) mejorRes = res;
  }
  if (!mejorRes) return { datosFaltantes: [], colocaciones: [], advertencias: ['La caja no cabe en el palet con estas medidas'] };

  const { capa, h, total } = mejorRes;
  const off = palet.voladizoMax || 0;
  const entrelazar = patron === 'entrelazado' || (patron === 'auto' && mejorRes.limitante !== 'compresion');
  const colocaciones = [];
  let puestas = 0;
  for (let c = 0; puestas < total; c++) {
    const espejo = entrelazar && c % 2 === 1;
    for (const r of capa.rects) {
      if (puestas >= total) break;
      const x = espejo ? L - r.x - r.dx : r.x;
      const y = espejo ? W - r.y - r.dy : r.y;
      colocaciones.push({ codigo: a.codigo, x: x - off, y: y - off, z: c * h, dx: r.dx, dy: r.dy, dz: h, capa: c + 1, orden: puestas + 1 });
      puestas++;
    }
  }
  const advertencias = [];
  if (total % capa.n !== 0) advertencias.push('Capa superior incompleta');
  return {
    datosFaltantes: [],
    cajasPorCapa: capa.n,
    capas: mejorRes.capas,
    totalCajas: total,
    alturaTotal: palet.altoBase + mejorRes.capas * h,
    pesoTotal: Math.round((total * a.peso + (palet.tara || 0)) * 10) / 10,
    usoArea: (capa.n * mejorRes.l * mejorRes.w) / (palet.largo * palet.ancho),
    limitante: mejorRes.limitante,
    optimoCapa: capa.optimo,
    colocaciones,
    advertencias,
  };
}
