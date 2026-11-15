// El inventario se mudó a https://luismendoza122.github.io/inventario-estibas/
// Este service worker viejo se borra solo y borra su copia guardada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('inventario-nube')).map((x) => caches.delete(x))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll()).then((cs) => cs.forEach((c) => c.navigate(c.url)))
));
