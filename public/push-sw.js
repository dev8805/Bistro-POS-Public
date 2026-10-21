// Push event handler para Web Push del soporte humano.
// Se inyecta al SW generado por VitePWA via workbox.importScripts.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'Bistro', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Mensaje del soporte Bistro';
  const options = {
    body: data.body || '',
    badge: '/512px_transparente.png',
    tag: data.tag || 'bistro-support',
    renotify: true,
    data: { url: data.url || '/' },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winList) => {
      // Si ya hay una ventana de la app abierta, avisamos via postMessage para que
      // React abra el widget directamente, sin recargar la página.
      for (const c of winList) {
        if ('focus' in c) {
          c.postMessage({ type: 'OPEN_SUPPORT_CHAT' });
          return c.focus();
        }
      }
      // No hay ventana abierta — abrimos una nueva con el param que le dice a React
      // que abra el chat al montar.
      if (self.clients.openWindow) return self.clients.openWindow('/?action=open_chat');
    })
  );
});
