// Raasta service worker: after the first visit the app, every building's data and its photos open without internet.
// - App shell and site.json: network first (stay fresh), cached copy when offline.
// - Hashed JS/CSS, photos, plan images, fonts: cache first (they never change under the same name).
// - /api/* (Claude, live crowd counter) is never cached; the app has its own offline fallbacks for those.
const CACHE = 'raasta-v1';
const SITES = ['hospital'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await c.addAll(['/', '/index.html']);
      // Every building's data plus all its photos and plan images, so a whole site works offline.
      for (const id of SITES) {
        try {
          const res = await fetch(`/sites/${id}/site.json`);
          if (!res.ok) continue;
          await c.put(`/sites/${id}/site.json`, res.clone());
          const s = await res.json();
          const files = [...Object.values(s.photos || {}), ...Object.values(s.planImg || {}).map((p) => p.src)];
          await Promise.allSettled([...new Set(files)].map((f) => c.add(`/sites/${id}/${f}`)));
        } catch {
          /* offline during install: cache what we can later */
        }
      }
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const put = async (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) (await caches.open(CACHE)).put(req, res.clone());
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request,
    u = new URL(req.url);
  if (req.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  const fonts = u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com';
  if (u.origin !== location.origin && !fonts) return;
  const fresh = req.mode === 'navigate' || u.pathname.endsWith('.json') || u.pathname.endsWith('.html');
  e.respondWith(
    fresh
      ? fetch(req)
          .then((r) => put(req, r))
          .catch(async () => (await caches.match(req)) || (await caches.match('/index.html')))
      : caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))),
  );
});
