// Service worker mínimo: existe solo para poder mostrar notificaciones (Chrome
// en Android no deja hacerlo desde la página). No guarda nada en caché.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Tocar la notificación vuelve al portal.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) =>
      ventanas.length ? ventanas[0].focus() : self.clients.openWindow('/')),
  )
})
