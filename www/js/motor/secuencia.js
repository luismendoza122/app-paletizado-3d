// Modo "orden de la ruta": las cajas llegan en el orden en que el operador las recoge
// y se colocan sin reordenar (lo primero queda abajo). Con 2 estibas se arman a la vez.

export const REGLAS_BASE = {
  soporteMinimo: 0.7,      // parte de la base de la caja que debe estar apoyada
  desviacionCGMax: 0.1,    // centro de gravedad a máx. 10 % del centro
  holgura: 0,              // mm entre cajas
  delicadoCajasEncima: 2,  // un delicado sin dato propio aguanta encima hasta 2 veces su peso (ajustable)
};

function solapan(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }

function chocaCon(c, x, y, z, dx, dy, dz) {
  return solapan(x, x + dx, c.x, c.x + c.dx) && solapan(y, y + dy, c.y, c.y + c.dy) && solapan(z, z + dz, c.z, c.z + c.dz);
}

function areaContacto(c, x, y, dx, dy) {
  const ox = Math.min(x + dx, c.x + c.dx) - Math.max(x, c.x);
  const oy = Math.min(y + dy, c.y + c.dy) - Math.max(y, c.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function orientaciones(a) {
  const { largo: A, ancho: B, alto: H } = a;
  const lista = [[A, B, H], [B, A, H]];
  if (!a.esteLadoArriba && !a.liquido) lista.push([A, H, B], [H, A, B], [B, H, A], [H, B, A]);
  return lista;
}

function nuevaEstiba(numero) {
  return { numero, cajas: [], puntos: [[0, 0, 0]], peso: 0, altura: 0 };
}

// Límite de carga encima de una caja colocada (kg). Infinity = sin límite conocido.
function limiteCarga(art, reglas) {
  if (art.maxCajasEncima) return art.maxCajasEncima * art.peso;
  if (art.delicado) return (reglas.delicadoCajasEncima ?? 2) * art.peso;
  return Infinity;
}

// Busca la mejor posición para la caja en una estiba. Devuelve null si no cabe.
function buscarPosicion(est, art, palet, reglas) {
  const L = palet.largo + 2 * (palet.voladizoMax || 0);
  const W = palet.ancho + 2 * (palet.voladizoMax || 0);
  const Hmax = palet.alturaMaxTotal - palet.altoBase;
  if (palet.cargaMax && est.peso + art.peso > palet.cargaMax) return null;
  const g = reglas.holgura || 0;
  let mejor = null;
  for (const [px, py, pz] of est.puntos) {
    for (const [dx0, dy0, dz] of orientaciones(art)) {
      const dx = dx0 + g, dy = dy0 + g;
      if (px + dx > L || py + dy > W || pz + dz > Hmax) continue;
      let choca = false;
      for (const c of est.cajas) if (chocaCon(c, px, py, pz, dx, dy, dz)) { choca = true; break; }
      if (choca) continue;
      // Apoyo
      let apoyo = 0;
      const soportes = [];
      if (pz === 0) apoyo = dx * dy;
      else {
        for (const c of est.cajas) {
          if (c.z + c.dz !== pz) continue;
          const a = areaContacto(c, px, py, dx, dy);
          if (a > 0) { apoyo += a; soportes.push([c, a]); }
        }
      }
      const fr = apoyo / (dx * dy);
      if (fr < reglas.soporteMinimo) continue;
      // Puntaje: lo más bajo primero, luego pegado al fondo y a la izquierda.
      // En el mismo punto, se prefiere el giro que desperdicia menos espacio hasta los bordes.
      const desperdicio = ((L - px) % dx) + ((W - py) % dy);
      const puntaje = pz * 1e8 + py * 1e4 + px + desperdicio / 1e4;
      if (!mejor || puntaje < mejor.puntaje) mejor = { x: px, y: py, z: pz, dx, dy, dz, soportes, apoyo, puntaje };
    }
  }
  return mejor;
}

// Reparte el peso de la caja nueva a las de abajo (proporcional al contacto) y baja en cadena.
function repartirPeso(soportes, apoyo, peso, afectadas) {
  for (const [c, a] of soportes) {
    const parte = peso * (a / apoyo);
    c.carga += parte;
    afectadas.add(c);
    if (c.soportes.length) repartirPeso(c.soportes, c.apoyo, parte, afectadas);
  }
}

function colocar(est, art, pos, info, reglas, contador) {
  const caja = {
    codigo: art.codigo, art, x: pos.x, y: pos.y, z: pos.z, dx: pos.dx, dy: pos.dy, dz: pos.dz,
    carga: 0, soportes: pos.soportes, apoyo: pos.apoyo, orden: est.cajas.length + 1,
    ubicacion: info.ubicacion, ia: info.ia ?? null,
  };
  est.cajas.push(caja);
  est.peso += art.peso;
  est.altura = Math.max(est.altura, pos.z + pos.dz);
  // Puntos extremos nuevos
  est.puntos.push([pos.x + pos.dx, pos.y, pos.z], [pos.x, pos.y + pos.dy, pos.z], [pos.x, pos.y, pos.z + pos.dz]);
  est.puntos = est.puntos.filter(([x, y, z]) => !est.cajas.some((c) => x >= c.x && x < c.x + c.dx && y >= c.y && y < c.y + c.dy && z >= c.z && z < c.z + c.dz));
  // Peso hacia abajo
  const afectadas = new Set();
  if (pos.soportes.length) repartirPeso(pos.soportes, pos.apoyo, art.peso, afectadas);
  for (const c of afectadas) {
    if (c.carga > limiteCarga(c.art, reglas) + 1e-9 && !c.sobrecargada) {
      c.sobrecargada = true;
      contador.sobrecarga.push(`${c.art.nombre || c.codigo} (${c.ubicacion || ''})`);
    }
  }
  // Inversión: caja puesta encima de una con índice claramente menor (más liviana o débil)
  for (const [c] of pos.soportes) {
    if (info.ia !== null && info.ia !== undefined && c.ia !== null && c.ia < info.ia - 0.1) { contador.inversiones++; break; }
  }
  for (const [c] of pos.soportes) if (c.art.delicado && !art.delicado) { contador.sobreDelicado++; break; }
}

// cajas: [{ art, ubicacion, secuencia, ia }] ya en orden de ruta (una entrada por caja).
export function armarEnSecuencia(cajas, palet, reglasEntrada = {}, estibasPedidas = 1) {
  const reglas = { ...REGLAS_BASE, ...reglasEntrada };
  const estibas = [];
  for (let i = 0; i < Math.max(1, estibasPedidas); i++) estibas.push(nuevaEstiba(i + 1));
  const contador = { inversiones: 0, sobrecarga: [], sobreDelicado: 0, rearmes: 0, noCaben: [] };
  for (const info of cajas) {
    const art = info.art;
    if (!art.largo || !art.ancho || !art.alto) { contador.noCaben.push(info.ubicacion); continue; }
    let elegido = null;
    for (const est of estibas) {
      const pos = buscarPosicion(est, art, palet, reglas);
      if (!pos) continue;
      // Con 2 estibas: la que quede más baja después de poner la caja; empate → la de menos peso.
      const alturaFinal = Math.max(est.altura, pos.z + pos.dz);
      const clave = pos.z * 1e6 + alturaFinal * 10 + est.peso / 1000;
      if (!elegido || clave < elegido.clave) elegido = { est, pos, clave };
    }
    if (!elegido) {
      contador.rearmes++;
      const est = nuevaEstiba(estibas.length + 1);
      estibas.push(est);
      const pos = buscarPosicion(est, art, palet, reglas);
      if (!pos) { contador.noCaben.push(info.ubicacion); continue; }
      elegido = { est, pos };
    }
    colocar(elegido.est, art, elegido.pos, info, reglas, contador);
  }
  const resultado = estibas.map((est) => resumenEstiba(est, palet, reglas));
  return {
    estibas: resultado,
    inversiones: contador.inversiones,
    sobrecarga: contador.sobrecarga,
    sobreDelicado: contador.sobreDelicado,
    estibasExtra: contador.rearmes,
    noCaben: contador.noCaben,
    totalCajas: cajas.length,
  };
}

function resumenEstiba(est, palet, reglas) {
  const tara = palet.tara || 0;
  let sx = 0, sy = 0, sz = 0, m = 0, vol = 0;
  for (const c of est.cajas) {
    sx += c.art.peso * (c.x + c.dx / 2); sy += c.art.peso * (c.y + c.dy / 2); sz += c.art.peso * (palet.altoBase + c.z + c.dz / 2);
    m += c.art.peso; vol += c.dx * c.dy * c.dz;
  }
  const M = m + tara;
  const cg = M > 0
    ? { x: (sx + tara * palet.largo / 2) / M, y: (sy + tara * palet.ancho / 2) / M, z: (sz + tara * palet.altoBase / 2) / M }
    : { x: palet.largo / 2, y: palet.ancho / 2, z: 0 };
  const desv = Math.max(Math.abs(cg.x - palet.largo / 2) / palet.largo, Math.abs(cg.y - palet.ancho / 2) / palet.ancho);
  const util = palet.largo * palet.ancho * (palet.alturaMaxTotal - palet.altoBase);
  return {
    numero: est.numero,
    cajas: est.cajas.map(({ codigo, art, x, y, z, dx, dy, dz, orden, ubicacion, sobrecargada }) => ({
      codigo, nombre: art.nombre, x, y, z, dx, dy, dz, orden, ubicacion, peso: art.peso,
      delicado: art.delicado, liquido: art.liquido, bulto: art.empaque === 'BULTO', sobrecargada: !!sobrecargada,
    })),
    totalCajas: est.cajas.length,
    pesoTotal: Math.round(M * 10) / 10,
    alturaTotal: palet.altoBase + est.altura,
    usoVolumen: util > 0 ? vol / util : 0,
    cg,
    desviacionCG: Math.round(desv * 1000) / 1000,
    cgFuera: desv > reglas.desviacionCGMax,
  };
}
