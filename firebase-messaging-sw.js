/* Background push. Separate from sw.js on purpose: the page registers this one
   under its own scope (./fcm-scope/), so the two workers never collide — sw.js
   stays the do-nothing worker that only makes the site installable.

   No Firebase SDK here. The page's getToken only needs this registration's
   pushManager; the SDK's job in a worker was drawing the notification, and it
   skips that whenever it thinks a window is visible. A home-screen app frozen
   in the background on an iPhone still reports itself visible, so every push
   landed silent — and iOS revokes the subscription of a site that receives a
   few pushes without showing anything. The phone stopped getting alerts, and
   on the next launch the page found no subscription and painted the switch
   off. So every push draws its notification here, unconditionally. */
self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data.json(); } catch {}
  const n = msg.notification || {};
  e.waitUntil(self.registration.showNotification(n.title || 'Foosball Cup', {
    body: n.body || '',
    icon: n.icon || '../icons/icon-192.png',
    data: { link: (msg.fcmOptions && msg.fcmOptions.link) || '../' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = new URL(e.notification.data.link, self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : clients.openWindow(link);
  }));
});
