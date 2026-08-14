// Handles push messages while the app is closed. Kept deliberately small —
// a service worker that caches app files would reintroduce the stale-version
// problems we spent a long time untangling, so this one only does push.

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = { title: 'Tracker', body: '' };
  try { if (event.data) data = event.data.json(); } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tracker', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'daily-reminder',        // replaces rather than stacks
      renotify: false,
      requireInteraction: false,
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus();     // reuse an open window
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
