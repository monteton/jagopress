// FitFlow PWA Service Worker
// ⚠️ При каждом обновлении index.html — инкрементируй версию: v1 → v2 → v3
const CACHE_NAME = 'fitflow-pwa-v1';

// Количество дней доступа с момента установки
const ACCESS_DAYS = 90;

// ─────────────────────────────────────────────
// INSTALL — сохраняем ключевые файлы в кеш
// ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// ─────────────────────────────────────────────
// ACTIVATE — удаляем старые кеши
// ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// ─────────────────────────────────────────────
// FETCH — network-first + проверка 90 дней
// ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Пропускаем: внешние CDN, видео bothelp, не-http
  if (!url.protocol.startsWith('http')) return;
  if (url.hostname !== self.location.hostname) return;

  event.respondWith(
    (async () => {
      // ── Проверка 90-дневного доступа ─────────────────
      // Дата первой установки хранится в IndexedDB-like через Cache Storage
      const metaCache = await caches.open('fitflow-meta');
      const metaReq   = new Request('fitflow-install-date');
      let installDate = null;

      const metaRes = await metaCache.match(metaReq);
      if (metaRes) {
        const data = await metaRes.json();
        installDate = data.date;
      } else {
        // Первый запуск — сохраняем дату установки
        installDate = Date.now();
        await metaCache.put(
          metaReq,
          new Response(JSON.stringify({ date: installDate }), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }

      const daysPassed = (Date.now() - installDate) / (1000 * 60 * 60 * 24);

      if (daysPassed >= ACCESS_DAYS) {
        // ── Доступ истёк — показываем заглушку ───────
        return new Response(
          `<!DOCTYPE html>
          <html lang="ru">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Программа завершена</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(160deg, #1a1820 0%, #232220 60%, #1c1e1a 100%);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                color: #fff;
                padding: 2rem;
              }
              .card {
                text-align: center;
                max-width: 360px;
                width: 100%;
              }
              .emoji {
                font-size: 4.5rem;
                margin-bottom: 1.5rem;
                animation: bounce 2s ease-in-out infinite;
                display: block;
              }
              h1 {
                font-size: 1.75rem;
                font-weight: 800;
                margin-bottom: 1rem;
                letter-spacing: -0.02em;
              }
              p {
                font-size: 1rem;
                color: rgba(255,255,255,0.65);
                line-height: 1.6;
              }
              .badge {
                display: inline-block;
                margin-top: 2rem;
                padding: 0.5rem 1.25rem;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 30px;
                font-size: 0.85rem;
                color: rgba(255,255,255,0.5);
              }
              @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-14px); }
              }
            </style>
          </head>
          <body>
            <div class="card">
              <span class="emoji">🏆</span>
              <h1>90 дней пройдено!</h1>
              <p>Вы прошли полную программу FitFlow.<br>Поздравляем с результатом!</p>
              <div class="badge">Доступ был открыт 90 дней</div>
            </div>
          </body>
          </html>`,
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }
        );
      }

      // ── Доступ активен — network-first ────────────
      try {
        const response = await fetch(event.request);
        if (response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, clone);
        }
        return response;
      } catch {
        // Офлайн — отдаём из кеша
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Fallback на главную
        return caches.match('./index.html');
      }
    })()
  );
});
