const CACHE_NAME = 'sculptor-pwa-v1';
const INSTALL_CACHE = 'sculptor-install-meta';
const INSTALL_KEY = 'install-date';
const ACCESS_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ===== INSTALL: сохраняем дату первой установки =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(INSTALL_CACHE).then(async (cache) => {
      const existing = await cache.match(INSTALL_KEY);
      if (!existing) {
        // Первая установка — фиксируем timestamp
        await cache.put(INSTALL_KEY, new Response(Date.now().toString(), {
          headers: { 'Content-Type': 'text/plain' }
        }));
      }
    })
  );
  self.skipWaiting();
});

// ===== ACTIVATE: чистим старые кеши (кроме install-meta) =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== INSTALL_CACHE)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// ===== FETCH: проверяем срок, отдаём контент или страницу блокировки =====
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // НЕ кешируй видео с BotHelp и внешние ресурсы
  if (url.hostname.includes('bothelp') || !url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(
    (async () => {
      // Читаем дату установки из кеша
      const installCache = await caches.open(INSTALL_CACHE);
      const installResponse = await installCache.match(INSTALL_KEY);

      if (installResponse) {
        const installTimestamp = parseInt(await installResponse.text(), 10);
        const expiryTimestamp = installTimestamp + ACCESS_DAYS * MS_PER_DAY;

        // Проверка: прошло ли 90 дней с момента установки
        if (Date.now() >= expiryTimestamp) {
          const installDate = new Date(installTimestamp).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
          });
          const expiryDate = new Date(expiryTimestamp).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
          });

          return new Response(
            `<!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>Скульптор — завершён</title>
              <style>
                body {
                  margin: 0;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  background: linear-gradient(135deg, #b4f24c 0%, #3bd45b 100%);
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  color: #fff;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                  max-width: 500px;
                }
                h1 {
                  font-size: 2.5rem;
                  margin: 0 0 1rem;
                  color: #1a1a1a;
                  animation: fadeIn 1s ease-out;
                }
                p {
                  font-size: 1.2rem;
                  color: rgba(0,0,0,0.75);
                  line-height: 1.6;
                  animation: fadeIn 1.5s ease-out;
                }
                .emoji {
                  font-size: 4rem;
                  margin-bottom: 1rem;
                  animation: bounce 2s infinite;
                }
                .meta {
                  font-size: 0.85rem;
                  margin-top: 2rem;
                  opacity: 0.6;
                }
                @keyframes fadeIn {
                  from { opacity: 0; transform: translateY(20px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                @keyframes bounce {
                  0%, 100% { transform: translateY(0); }
                  50% { transform: translateY(-20px); }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="emoji">🎉</div>
                <h1>Поздравляем!</h1>
                <p>Вы успешно завершили программу «Скульптор»!</p>
                <p class="meta">
                  Установлено: ${installDate}<br>
                  Доступ закрыт: ${expiryDate}
                </p>
              </div>
            </body>
            </html>`,
            {
              status: 403,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        }
      }

      // До истечения срока — работай нормально
      try {
        const response = await fetch(event.request);
        if (response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, responseClone);
        }
        return response;
      } catch (error) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw error;
      }
    })()
  );
});
