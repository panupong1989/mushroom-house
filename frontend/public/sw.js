// Service worker ขั้นต่ำสำหรับ PWA — network-first เฉพาะ same-origin GET (shell/หน้า/chunk)
// online = สดเสมอ, offline = เสิร์ฟจาก cache ล่าสุด; ปล่อย Supabase/ข้ามโดเมน + WS + non-GET ผ่านตรงๆ
const CACHE = 'mush-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // ไม่ยุ่ง Supabase/ข้ามโดเมน

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
  );
});
