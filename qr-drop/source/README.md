# QR Drop

Serverless P2P передача файлов через QR-код. Без своего backend: только статический сайт, WebRTC DataChannel и публичные STUN/TURN.

## Как это работает

1. **ПК (Host):** откройте сайт → «Создать сессию» → появится QR.
2. **Телефон:** отсканируйте QR → откроется `/join.html` → покажется answer QR.
3. **ПК:** отсканируйте answer QR камерой **или** вставьте текст answer в поле.
4. После соединения обе стороны могут выбирать и отправлять файлы.

Файлы передаются напрямую P2P (или через публичный TURN OpenRelay при жёстком NAT).

## Локальная разработка

```bash
npm install
npm run dev
```

Откройте `http://localhost:5173` на ПК. Для теста join-страницы используйте URL из QR или `http://localhost:5173/join.html#o=...`.

> Камера на телефоне требует HTTPS (или localhost). Для теста с телефона используйте `npm run preview` + туннель (ngrok, cloudflared) или деплой на Pages.

## Сборка

```bash
npm run build
```

Артефакты в папке `dist/`.

## Деплой на GitHub Pages (namenameemail.github.io)

Проект живёт в подпапке `/qr-drop/`:

```bash
cd source
npm install
npm run build
```

Сборка кладёт статику в `../` (корень `qr-drop/`). Сайт: `https://namenameemail.github.io/qr-drop/`

## Деплой на Cloudflare Pages

1. Загрузите репозиторий на GitHub/GitLab.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → Connect to Git.
3. Настройки сборки:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node.js version:** 20+
4. Deploy. Сайт будет доступен по `https://<project>.pages.dev`.

Альтернатива — GitHub Pages: включите Actions workflow или загрузите содержимое `dist/` в branch `gh-pages`.

### Ручной деплой через Wrangler (опционально)

```bash
npm install -g wrangler
npm run build
npx wrangler pages deploy dist --project-name=qr-p2p-drop
```

## Стек

- Vite + TypeScript
- WebRTC (`RTCPeerConnection`, `RTCDataChannel`)
- QR: `qrcode`, `html5-qrcode`
- SDP сжатие: `lz-string`
- STUN: Google · TURN: [OpenRelay Metered](https://www.metered.ca/tools/openrelay/)

## Ограничения

- При симметричном NAT соединение может не установиться — попробуйте одну Wi‑Fi сеть.
- Файлы >500 МБ показывают предупреждение (ограничение памяти на телефоне).
- ПК без веб-камеры: используйте вставку answer текстом с телефона.
