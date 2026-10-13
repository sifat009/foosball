// No caching on purpose: scores come from a live Firebase snapshot, so a
// cached response could show a stale bracket. Every request passes through.
//
// The one exception is opening the app with no network. Android's Chrome
// paints its own offline page then; an iPhone home-screen app paints nothing
// at all, a blank white screen. So a page load that fails gets this instead —
// built in, so it needs nothing from the network, and it holds no scores.
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#16233a"><title>Offline — Ollyo Cup</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #eef2f8; color: #16233a; font: 16px/1.5 -apple-system, system-ui, sans-serif;
    padding: 24px; box-sizing: border-box; text-align: center; }
  h1 { font-size: 1.3rem; margin: 0 0 8px; }
  p { margin: 0 0 22px; color: #5b6a7d; }
  button { font: inherit; font-weight: 700; color: #fff; background: #16233a; border: 0;
    border-radius: 999px; padding: 12px 26px; }
</style></head><body><main>
  <h1>You're offline</h1>
  <p>The Ollyo Cup needs a connection for live scores.<br>It will open by itself once you're back online.</p>
  <button onclick="location.reload()">Try again</button>
</main><script>addEventListener('online', () => location.reload());</script></body></html>`;

// a new version takes over at once rather than waiting for every tab to close,
// or an iPhone already showing white would keep the old worker for days
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return; // everything else passes through untouched
  e.respondWith(fetch(e.request).catch(() =>
    new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
