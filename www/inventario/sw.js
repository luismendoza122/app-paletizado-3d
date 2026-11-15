// Service worker del inventario (versión en la nube): la planilla del operador abre aunque se caiga la señal.
// Sube VERSION cada vez que cambies archivos de esta carpeta.
const VERSION = 'inventario-nube-v1';
const ARCHIVOS = ['./', './index.html', './admin.js', './admin.css', './contar.html', './contar.js', './contar.css', './styles.css', './nube.js', './icons/icono.svg', './icons/icono-192.png', './manifest.webmanifest'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => Promise.all(ARCHIVOS.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('inventario-nube') && x !== VERSION).map((x) => caches.delete(x)))).then(() => self.clients.claim())
));

// Primero la red; sin red, la copia guardada (la nube no pasa por aquí)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })
    .then((r) => r || caches.match(url.pathname.endsWith('contar.html') ? './contar.html' : './index.html'))));
});
