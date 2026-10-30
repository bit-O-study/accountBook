self.addEventListener('push', event => {
  // Never render financial details or navigate to a server-provided external URL.
  let data = {}; try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification('가계부 알림', {
    body: Number.isSafeInteger(data.count) && data.count > 0 && data.count <= 1000000
      ? `확인할 새 알림이 ${data.count}건 있어요. 가계부에서 확인해 주세요.`
      : '확인할 새 알림이 있어요. 가계부에서 확인해 주세요.',
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 100) : 'accountbook',
    data: { href: '/notifications' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL('/notifications', self.location.origin).href));
});
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
