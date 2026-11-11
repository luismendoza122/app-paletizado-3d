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
  const S = 0.001;
  const ancho = contenedor.clientWidth || 340;
  const alto = Math.max(260, Math.min(420, ancho * 0.9));
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(ancho, alto);
  contenedor.appendChild(renderer.domElement);
  const escena = new THREE.Scene();
  escena.background = new THREE.Color('#f4f6f8');
  const camara = new THREE.PerspectiveCamera(40, ancho / alto, 0.01, 50);
  const centro = new THREE.Vector3((palet.largo / 2) * S, 0.6, (palet.ancho / 2) * S);
  camara.position.set(centro.x + 2.2, 2.0, centro.z + 2.4);
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
  for (const c of estiba.cajas) {
    if (c.orden > hastaOrden) continue;
    const mat = new THREE.MeshStandardMaterial({ color: c.sobrecargada ? '#d62828' : colorDe(c.codigo, colores) });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(c.dx * S * 0.99, c.dz * S * 0.99, c.dy * S * 0.99);
    m.position.set((c.x + c.dx / 2) * S, hb + (c.z + c.dz / 2) * S, (c.y + c.dy / 2) * S);
    escena.add(m);
    const b = new THREE.LineSegments(bordes, lineaMat);
    b.scale.copy(m.scale); b.position.copy(m.position);
    escena.add(b);
  }
  const controls = Orbit ? new Orbit(camara, renderer.domElement) : null;
  if (controls) { controls.target.copy(centro); controls.update(); }
  else camara.lookAt(centro);
  actual = { renderer, controls, frame: 0 };
  const animar = () => { actual.frame = requestAnimationFrame(animar); controls?.update(); renderer.render(escena, camara); };
  animar();
  return true;
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
