// No caching on purpose: scores come from a live Firebase snapshot, so a
// cached response could show a stale bracket. This SW exists only so Chrome/
// Android treat the site as installable — every request just passes through.
self.addEventListener('fetch', () => {});
