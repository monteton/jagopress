# 📱 PWA Install Banner — Инструкция для проектов

Реализованный подход в проектах **Королевская осанка** и **Марафон питания**.  
Принудительный fullscreen-баннер установки с умной детекцией браузера и платформы.

---

## Что делает баннер

| Платформа | Браузер | Действие |
|---|---|---|
| Android | Chrome | Нативная кнопка «Установить» (beforeinstallprompt) |
| Android | Telegram / Instagram / другой | Кнопка «Открыть в Chrome» (intent://) |
| iOS | Safari | Инструкция: Поделиться → На экран «Домой» → Добавить |
| iOS | Telegram / любой WebView | Кнопка «Открыть в Safari» (x-safari-https://) |
| iOS | Chrome iOS / Firefox iOS | Кнопка «Открыть в Safari» |
| Desktop | Chrome | Инструкция про иконку ⊕ в адресной строке |
| Desktop | Другой | Кнопка «Скопировать ссылку» |

---

## Ключевые открытия (важные тонкости)

### 1. Telegram iOS скрывает себя в User Agent
Telegram на iPhone **НЕ добавляет слово "Telegram" в UA**. Его UA выглядит идентично Safari.

**Как отличить настоящий Safari от WebView:**
- ✅ Настоящий Safari: `... Version/17.2 Mobile/15E148 Safari/604.1` — **есть `Version/`**
- ❌ Telegram iOS WebView: `... Mobile/15E148` — **нет `Version/`**
- ❌ Instagram, WhatsApp и др. iOS WebView — тоже нет `Version/`

```js
const isIOSWebViewByUA = isIOS && /Safari/i.test(ua) && !/Version\//i.test(ua);
const isTelegramProxy = typeof window.TelegramWebviewProxy !== 'undefined';
const isTelegram = /Telegram/i.test(ua) || isTelegramProxy;
const isWebView = isTelegram || isInstagram || isFacebook || isVK || /\bwv\b/.test(ua) || isIOSWebViewByUA;
```

### 2. Для Safari: обязательно проверять наличие `Version/`
```js
// НЕПРАВИЛЬНО — принимает Telegram за Safari:
const isSafari = /Safari/i.test(ua) && !isWebView;

// ПРАВИЛЬНО:
const isSafari = /Safari/i.test(ua) && /Version\//i.test(ua) &&
  !/Chrome|CriOS|FxiOS|OPiOS|mercury|UCBrowser|YaBrowser/i.test(ua) && !isWebView;
```

### 3. Редирект в Safari (iOS): схема `x-safari-https://`
Работает из Telegram iOS, Chrome iOS и других WebView на iPhone:
```js
function openInSafari() {
  const safariUrl = window.location.href
    .replace(/^https:\/\//, 'x-safari-https://')
    .replace(/^http:\/\//, 'x-safari-http://');
  window.location.href = safariUrl;
}
```
> **Запасной вариант** — показать URL в поле `<input readonly>` для ручного копирования.

### 4. Редирект в Chrome (Android): Android Intent URL
```js
function openInChrome() {
  const url = new URL(window.location.href);
  const intentUrl = 'intent://' + url.host + url.pathname + url.search + url.hash +
    '#Intent;scheme=https;package=com.android.chrome;end';
  window.location.href = intentUrl;
}
```

### 5. `beforeinstallprompt` может не прийти сразу
Chrome Android иногда медленно принимает решение. Таймаут ожидания — **500мс**.  
Если событие не пришло на Android — показываем «Открыть в Chrome».

---

## Структура HTML

```html
<!-- Install Banner (Forced Fullscreen) -->
<div class="install-banner" id="installBanner">
  <div class="install-banner-header">
    <img src="icon-192.png" alt="Icon" class="install-banner-icon">
    <div class="install-banner-text">
      <p class="install-banner-title" id="installTitle">Установите приложение</p>
      <p class="install-banner-subtitle" id="installSubtitle">...</p>
    </div>
  </div>
  <button class="install-banner-btn" id="installBtn">Установить</button>
  <div class="install-banner-steps" id="installSteps"></div>
</div>
```

---

## Полный JS-код

```js
// 1. Регистрация Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

// 2. Логика баннера
(function () {
  const banner   = document.getElementById('installBanner');
  const btn      = document.getElementById('installBtn');
  const stepsEl  = document.getElementById('installSteps');
  const titleEl  = document.getElementById('installTitle');
  const subtitleEl = document.getElementById('installSubtitle');

  // Уже установлено — выходим
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;

  const ua = navigator.userAgent || '';
  const isIOS     = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);

  // ⚠️ Telegram iOS не пишет "Telegram" в UA! Используем Version/ для определения
  const isTelegramProxy  = typeof window.TelegramWebviewProxy !== 'undefined';
  const isTelegram       = /Telegram/i.test(ua) || isTelegramProxy;
  const isInstagram      = /Instagram/i.test(ua);
  const isFacebook       = /FBAN|FBAV/i.test(ua);
  const isVK             = /VKAndroidApp|vk_app/i.test(ua);
  const isIOSWebViewByUA = isIOS && /Safari/i.test(ua) && !/Version\//i.test(ua);
  const isWebView        = isTelegram || isInstagram || isFacebook || isVK || /\bwv\b/.test(ua) || isIOSWebViewByUA;

  const isChrome  = /Chrome/i.test(ua) && !/OPR|Opera|Edge|Edg|Samsung|UCBrowser|YaBrowser/i.test(ua) && !isWebView;
  const isSafari  = /Safari/i.test(ua) && /Version\//i.test(ua) &&
                    !/Chrome|CriOS|FxiOS|OPiOS|mercury|UCBrowser|YaBrowser/i.test(ua) && !isWebView;

  let deferredPrompt = null;
  let bannerShown    = false;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner('native');
  });

  // iOS и WebView — показываем баннер сразу
  if      (isWebView)              showBanner('webview');
  else if (isIOS && isSafari)      showBanner('ios-safari');
  else if (isIOS && !isSafari)     showBanner('ios-other');

  // Android/Desktop — ждём beforeinstallprompt 500мс
  if (!bannerShown) {
    setTimeout(() => {
      if (bannerShown) return;
      if (isAndroid && !deferredPrompt) showBanner('android-other');
      else if (!isAndroid && !isIOS && !deferredPrompt) {
        showBanner(isChrome ? 'desktop-chrome' : 'desktop-other');
      }
    }, 500);
  }

  function getBrowserName() {
    if (isTelegram)  return 'Telegram';
    if (isInstagram) return 'Instagram';
    if (isFacebook)  return 'Facebook';
    if (isVK)        return 'ВКонтакте';
    return 'этот браузер';
  }

  function openInChrome() {
    const url = new URL(window.location.href);
    window.location.href = 'intent://' + url.host + url.pathname + url.search + url.hash +
      '#Intent;scheme=https;package=com.android.chrome;end';
  }

  function openInSafari() {
    window.location.href = window.location.href
      .replace(/^https:\/\//, 'x-safari-https://')
      .replace(/^http:\/\//, 'x-safari-http://');
  }

  function showBanner(mode) {
    if (bannerShown) return;
    bannerShown = true;
    banner.classList.add('show');

    const currentUrl = window.location.href;
    const browserName = getBrowserName();

    if (mode === 'native') {
      titleEl.textContent    = 'Установите приложение';
      subtitleEl.textContent = 'Быстрый доступ с экрана «Домой»';
      btn.textContent        = 'Установить';
      btn.style.display      = 'inline-block';
      btn.onclick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') banner.classList.remove('show');
        deferredPrompt = null;
      };

    } else if (mode === 'ios-safari') {
      // Пользователь УЖЕ в Safari — объясняем как добавить на экран домой
      titleEl.textContent    = '⚠️ Нужна установка!';
      subtitleEl.textContent = 'Без этого счётчик дней не запустится';
      btn.style.display      = 'none';
      stepsEl.innerHTML = `
        <div class="ios-guide">
          <div class="ios-steps-list">
            <div class="ios-step">
              <div class="ios-step-num">1</div>
              <span>Нажмите <svg ...>...</svg> <b>Поделиться</b> — кнопка внизу экрана</span>
            </div>
            <div class="ios-step">
              <div class="ios-step-num">2</div>
              <span>Прокрутите список вниз, найдите<br><b>«На экран «Домой»»</b></span>
            </div>
            <div class="ios-step">
              <div class="ios-step-num">3</div>
              <span>Нажмите <b>«Добавить»</b> — готово! 🎉</span>
            </div>
          </div>
          <div class="ios-arrow-wrap">
            <span class="ios-arrow-label">кнопка «Поделиться» внизу</span>
            <span class="ios-bounce-arrow">↓</span>
          </div>
        </div>`;

    } else if (mode === 'ios-other' || (mode === 'webview' && isIOS)) {
      // iOS, но не Safari → перенаправляем в Safari
      titleEl.textContent    = 'Требуется Safari';
      subtitleEl.textContent = 'Из ' + browserName + ' установить нельзя. Нужен Safari.';
      btn.textContent        = '🧭 Открыть в Safari';
      btn.style.display      = 'inline-block';
      stepsEl.innerHTML      =
        '<p>Нажмите кнопку — откроется Safari.<br>' +
        'Если не сработало, скопируйте ссылку и откройте вручную:</p>' +
        '<input readonly class="install-url-box" value="' + currentUrl + '">';
      btn.onclick = () => openInSafari();

    } else if (mode === 'android-other' || (mode === 'webview' && isAndroid)) {
      // Android, но не Chrome → перенаправляем в Chrome
      titleEl.textContent    = 'Откройте в Chrome';
      subtitleEl.textContent = browserName + ' не поддерживает установку';
      btn.textContent        = 'Открыть в Chrome';
      btn.style.display      = 'inline-block';
      stepsEl.innerHTML      = 'В Chrome появится кнопка <b>«Установить»</b>';
      btn.onclick = () => openInChrome();

    } else if (mode === 'desktop-chrome') {
      titleEl.textContent    = 'Установите приложение';
      subtitleEl.textContent = 'Нажмите кнопку установки в адресной строке';
      btn.style.display      = 'none';
      stepsEl.innerHTML      = 'Найдите иконку <b>⊕</b> в правой части адресной строки Chrome';

    } else if (mode === 'desktop-other') {
      // Копирование ссылки для других десктоп-браузеров
      titleEl.textContent = 'Откройте сайт в Chrome';
      btn.textContent     = 'Скопировать ссылку';
      btn.style.display   = 'inline-block';
      btn.onclick = () => {
        navigator.clipboard.writeText(currentUrl)
          .then(() => { btn.textContent = '✓ Скопировано!'; setTimeout(() => btn.textContent = 'Скопировать ссылку', 2500); });
      };
    }
  }
})();
```

---

## CSS-классы (необходимый минимум)

```css
.install-banner {
  position: fixed; inset: 0;
  background: linear-gradient(135deg, #2a2028 0%, #232220 100%);
  color: #fff; padding: 2rem 1.5rem;
  z-index: 99999; display: none;
  flex-direction: column; align-items: center;
  justify-content: center; text-align: center; gap: 1.5rem;
}
.install-banner.show { display: flex; }

.install-banner-btn {
  padding: 1rem 2.5rem;
  background: linear-gradient(90deg, #c681f4, #d38080, #DAE2F8);
  background-size: 200% auto; color: #fff;
  border: none; border-radius: 30px;
  font-size: 1.1rem; font-weight: 800; cursor: pointer;
}

.ios-guide { display: flex; flex-direction: column; align-items: center; gap: 1rem; max-width: 320px; }
.ios-steps-list {
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 16px; padding: 1rem 1.2rem;
  display: flex; flex-direction: column; gap: 0.75rem; text-align: left;
}
.ios-step { display: flex; align-items: center; gap: 0.75rem; font-size: 0.95rem; }
.ios-step-num {
  width: 28px; height: 28px;
  background: linear-gradient(135deg, #c681f4, #d38080);
  border-radius: 50%; display: flex; align-items: center;
  justify-content: center; font-weight: 800; flex-shrink: 0;
}
.ios-bounce-arrow {
  font-size: 2.5rem;
  animation: ios-bounce 1.4s ease-in-out infinite;
}
@keyframes ios-bounce {
  0%, 100% { transform: translateY(0); opacity: 1; }
  50%       { transform: translateY(10px); opacity: 0.7; }
}
.install-url-box {
  width: 100%; max-width: 320px;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
  border-radius: 12px; padding: 0.7rem 1rem;
  color: #c681f4; font-size: 0.85rem; font-family: monospace;
  text-align: center; user-select: all; outline: none;
}
```

---

## Service Worker (sw.js) — важные моменты

1. **Обязательно менять версию кеша** при каждом обновлении `index.html`:
   ```js
   const CACHE_NAME = 'project-pwa-v1'; // v2, v3... при каждом деплое
   ```
   Без этого телефоны будут получать старый закешированный `index.html`.

2. **Всегда деплоить вместе**: `index.html` + `sw.js`.

3. Пример минимального SW со счётчиком 90 дней — см. файл `sw.js` в проекте.

---

## Чеклист для нового проекта

- [ ] Добавить `manifest.json` с иконками 192×192 и 512×512
- [ ] Добавить `apple-touch-icon` и `apple-mobile-web-app-capable` в `<head>`
- [ ] Создать `sw.js` с кешированием (версия `v1`)
- [ ] Добавить HTML-баннер с элементами `installBanner`, `installTitle`, `installSubtitle`, `installBtn`, `installSteps`
- [ ] Вставить JS-логику детекции и показа баннера
- [ ] Добавить CSS-классы баннера
- [ ] При каждом обновлении — инкрементировать версию кеша в `sw.js` и деплоить **оба файла**
