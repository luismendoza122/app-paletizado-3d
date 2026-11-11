// Permite usar la página sin internet (después de abrirla una vez con conexión).
const CACHE = 'paletizado-0.4.0';
const BASICOS = ['./', './index.html', './css/estilos.css', './js/app.js', './js/agente.js', './js/exportar.js', './js/visor.js',
  './js/datos/almacen.js', './js/datos/importar.js', './js/datos/layout.js', './js/datos/nube.js',
  './js/motor/articulo.js', './js/motor/indice.js', './js/motor/mono.js', './js/motor/reubicacion.js', './js/motor/secuencia.js', './js/motor/simulacion.js',
  './vendor/three/three.module.js', './vendor/three/three.core.js', './vendor/three/addons/controls/OrbitControls.js', './vendor/xlsx.full.min.js',
  './manifest.webmanifest', './icons/icono.svg', './icons/icono-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(BASICOS.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la nube no pasa por aquí
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
