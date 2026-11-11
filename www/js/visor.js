// Dibuja una estiba: en 3D con Three.js si está disponible y, siempre, la vista desde arriba por capa (2D).

const PALETA = ['#2f6fdd', '#e07b2a', '#2a9d5c', '#c94270', '#7b5bd6', '#c9a227', '#1f9bb5', '#8a6a4f', '#d6533b', '#5f7f2a'];
export function colorDe(codigo, mapa) {
  if (!mapa.has(codigo)) mapa.set(codigo, PALETA[mapa.size % PALETA.length]);
  return mapa.get(codigo);
}

let THREE = null;
let Orbit = null;
let intentado = false;
async function cargarThree() {
  if (intentado) return !!THREE;
  intentado = true;
  try {
    THREE = await import('three');
    ({ OrbitControls: Orbit } = await import('three/addons/controls/OrbitControls.js'));
  } catch { THREE = null; }
  return !!THREE;
}

let actual = null; // { renderer, controls, frame }
function limpiar() {
  if (!actual) return;
  cancelAnimationFrame(actual.frame);
  actual.controls?.dispose();
  actual.renderer.dispose();
  actual.renderer.domElement.remove();
  actual = null;
}

// estiba: { cajas:[{x,y,z,dx,dy,dz,codigo,orden}] }, palet: { largo, ancho, altoBase }
export async function dibujar3D(contenedor, estiba, palet, colores, hastaOrden = Infinity) {
  limpiar();
  contenedor.innerHTML = '';
  const ok = await cargarThree();
  if (!ok) {
    contenedor.innerHTML = '<p class="nota">Vista 3D no disponible en este equipo. Abajo está la vista por capas.</p>';
    return false;
  }
  const ancho = contenedor.clientWidth || 340;
  const alto = Math.max(260, Math.min(420, ancho * 0.9));
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(ancho, alto);
  contenedor.appendChild(renderer.domElement);
  const { escena, centro } = armarEscena(estiba, palet, colores, hastaOrden);
  const camara = new THREE.PerspectiveCamera(40, ancho / alto, 0.01, 50);
  camara.position.set(centro.x + 2.2, 2.0, centro.z + 2.4);
  const controls = Orbit ? new Orbit(camara, renderer.domElement) : null;
  if (controls) { controls.target.copy(centro); controls.update(); }
  else camara.lookAt(centro);
  actual = { renderer, controls, frame: 0 };
  const animar = () => { actual.frame = requestAnimationFrame(animar); controls?.update(); renderer.render(escena, camara); };
  animar();
  return true;
}

// Escena 3D de una estiba: madera + cajas. Devuelve las mallas en orden de armado (para el video).
function armarEscena(estiba, palet, colores, hastaOrden = Infinity) {
  const S = 0.001;
  const escena = new THREE.Scene();
  escena.background = new THREE.Color('#f4f6f8');
  const centro = new THREE.Vector3((palet.largo / 2) * S, 0.6, (palet.ancho / 2) * S);
  escena.add(new THREE.HemisphereLight('#ffffff', '#8899aa', 2.2));
  const luz = new THREE.DirectionalLight('#ffffff', 1.4);
  luz.position.set(3, 5, 2);
  escena.add(luz);

  // Estiba de madera (tablas superiores y tacos)
  const madera = new THREE.MeshStandardMaterial({ color: '#b98a55' });
  const hb = palet.altoBase * S;
  const tabla = new THREE.Mesh(new THREE.BoxGeometry(palet.largo * S, hb * 0.25, palet.ancho * S), madera);
  tabla.position.set(centro.x, hb * 0.875, centro.z);
  escena.add(tabla);
  for (const fx of [0.08, 0.5, 0.92]) for (const fz of [0.08, 0.5, 0.92]) {
    const taco = new THREE.Mesh(new THREE.BoxGeometry(0.12, hb * 0.75, 0.12), madera);
    taco.position.set(palet.largo * S * fx, hb * 0.375, palet.ancho * S * fz);
    escena.add(taco);
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const bordes = new THREE.EdgesGeometry(geo);
  const lineaMat = new THREE.LineBasicMaterial({ color: '#1b2430' });
  const piezas = [];
  for (const c of [...estiba.cajas].sort((a, b) => a.orden - b.orden)) {
    if (c.orden > hastaOrden) continue;
    const mat = new THREE.MeshStandardMaterial({ color: c.sobrecargada ? '#d62828' : colorDe(c.codigo, colores) });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(c.dx * S * 0.99, c.dz * S * 0.99, c.dy * S * 0.99);
    m.position.set((c.x + c.dx / 2) * S, hb + (c.z + c.dz / 2) * S, (c.y + c.dy / 2) * S);
    escena.add(m);
    const b = new THREE.LineSegments(bordes, lineaMat);
    b.scale.copy(m.scale); b.position.copy(m.position);
    escena.add(b);
    piezas.push({ caja: c, malla: m, borde: b, y: m.position.y });
  }
  return { escena, centro, piezas };
}

// Formatos de video que acepta el equipo (MP4 primero: WhatsApp lo abre sin problema).
export function formatoVideo() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return null;
}

// Graba un video de cómo se arma la estiba, caja por caja, con el nombre del artículo.
// opciones: { titulo, alAvanzar(fraccion) }. Devuelve { blob, extension, segundos }.
export async function grabarVideo(estiba, palet, colores, { titulo = '', alAvanzar = () => {} } = {}) {
  if (!(await cargarThree())) throw new Error('La vista 3D no está disponible en este equipo.');
  const tipo = formatoVideo();
  if (!tipo) throw new Error('Este equipo no permite grabar video desde la app.');
  const W = 720, H = 960, HV = 780;            // video vertical para el celular; 3D arriba, letrero abajo
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, HV, false);
  const { escena, centro, piezas } = armarEscena(estiba, palet, colores);
  const camara = new THREE.PerspectiveCamera(40, W / HV, 0.01, 50);
  const alturaM = Math.max(0.8, (palet.altoBase + (estiba.alturaTotal || 1200)) / 1000);
  centro.y = alturaM / 2;
  const radio = 1.9 + alturaM * 0.45;
  piezas.forEach((p) => { p.malla.visible = false; p.borde.visible = false; });

  const lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = H;
  const g = lienzo.getContext('2d');
  const flujo = lienzo.captureStream(30);
  const grabadora = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: 2_500_000 });
  const trozos = [];
  grabadora.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
  const fin = new Promise((ok) => { grabadora.onstop = ok; });

  const n = piezas.length;
  const porCaja = Math.min(0.6, Math.max(0.12, 30 / Math.max(n, 1)));   // segundos por caja (máx. ~30 s armando)
  const caida = Math.min(0.35, porCaja * 0.9);
  const tArmado = n * porCaja + 0.5;
  const total = 1 + tArmado + 3;                                        // 1 s inicio, armado, 3 s vuelta final
  const pesoTotal = estiba.pesoTotal ?? piezas.reduce((t, p) => t + (p.caja.art?.peso || 0), 0);

  const letrero = (visibles, actual) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, HV, W, H - HV);
    g.fillStyle = '#1b2430'; g.font = 'bold 30px sans-serif';
    g.fillText(`${titulo || 'Conformación de palet'}`.slice(0, 40), 24, HV + 44);
    g.font = '26px sans-serif'; g.fillStyle = '#444';
    g.fillText(`Caja ${visibles} de ${n} · ${Math.round(pesoTotal)} kg · ${Math.round(estiba.alturaTotal || 0)} mm`, 24, HV + 86);
    if (actual) {
      const c = actual.caja;
      g.fillStyle = colorDe(c.codigo, colores); g.fillRect(24, HV + 108, 28, 28);
      g.fillStyle = '#1b2430'; g.font = 'bold 24px sans-serif';
      g.fillText(`${c.nombre || c.art?.nombre || c.codigo}`.slice(0, 42), 62, HV + 131);
      g.font = '20px sans-serif'; g.fillStyle = '#666';
      g.fillText(`Cód. ${c.codigo}${c.ubicacion ? ` · ubicación ${c.ubicacion}` : ''}${c.art?.peso ? ` · ${c.art.peso} kg` : ''}`.slice(0, 60), 62, HV + 160);
    }
    g.fillStyle = '#999'; g.font = '16px sans-serif';
    g.fillText('Paletizado 3D · CEDI ATS R10 Valledupar', 24, H - 14);
  };

  grabadora.start(500);
  const inicio = performance.now();
  await new Promise((listo) => {
    const paso = () => {
      const t = (performance.now() - inicio) / 1000;
      const ta = t - 1;                                                  // tiempo dentro del armado
      let visibles = 0, actual = null;
      for (let i = 0; i < n; i++) {
        const p = piezas[i];
        const t0 = i * porCaja;
        if (ta < t0) { p.malla.visible = p.borde.visible = false; continue; }
        visibles++; actual = p;
        p.malla.visible = p.borde.visible = true;
        const k = Math.min(1, (ta - t0) / caida);
        const y = p.y + (1 - k * (2 - k)) * 0.5;                         // cae desde 50 cm y se asienta
        p.malla.position.y = y; p.borde.position.y = y;
      }
      const ang = 0.6 + (t / total) * Math.PI * 1.2;
      camara.position.set(centro.x + Math.cos(ang) * radio, centro.y + alturaM * 0.55 + 0.35, centro.z + Math.sin(ang) * radio);
      camara.lookAt(centro);
      renderer.render(escena, camara);
      g.drawImage(renderer.domElement, 0, 0, W, HV);
      letrero(visibles, actual);
      alAvanzar(Math.min(1, t / total));
      if (t < total) requestAnimationFrame(paso); else listo();
    };
    requestAnimationFrame(paso);
  });
  grabadora.stop();
  await fin;
  flujo.getTracks().forEach((x) => x.stop());
  renderer.dispose();
  const blob = new Blob(trozos, { type: tipo.split(';')[0] });
  return { blob, extension: tipo.startsWith('video/mp4') ? 'mp4' : 'webm', segundos: Math.round(total) };
}

// Vista desde arriba de una capa (cajas cuya base está en z = nivel). Números = orden de armado.
// nivel: { desde, hasta } en mm; se dibujan las cajas cuya base cae en ese rango.
export function dibujarCapa(canvas, estiba, palet, nivel, colores) {
  const ctx = canvas.getContext('2d');
  const ancho = canvas.clientWidth || 320;
  const escala = ancho / palet.largo;
  canvas.width = ancho * 2; canvas.height = palet.ancho * escala * 2;
  canvas.style.height = `${palet.ancho * escala}px`;
  ctx.scale(2, 2);
  ctx.fillStyle = '#e9d8bf'; ctx.fillRect(0, 0, palet.largo * escala, palet.ancho * escala);
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const c of estiba.cajas.filter((k) => k.z >= nivel.desde && k.z < nivel.hasta)) {
    const x = c.x * escala, y = c.y * escala, w = c.dx * escala, h = c.dy * escala;
    ctx.fillStyle = c.sobrecargada ? '#d62828' : colorDe(c.codigo, colores);
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = '#1b2430'; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#fff'; ctx.fillText(String(c.orden), x + w / 2, y + h / 2);
  }
}

// Agrupa las alturas parecidas en una sola capa para no mostrar decenas de vistas.
export function nivelesDe(estiba, tolerancia = 120) {
  const zs = [...new Set(estiba.cajas.map((c) => c.z))].sort((a, b) => a - b);
  const niveles = [];
  for (const z of zs) {
    const ultimo = niveles[niveles.length - 1];
    if (ultimo && z - ultimo.desde < tolerancia) ultimo.hasta = z + 1;
    else niveles.push({ desde: z, hasta: z + 1 });
  }
  return niveles;
}
