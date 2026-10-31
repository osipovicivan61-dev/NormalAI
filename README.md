# Video Studio

Сайт-обёртка над четырьмя генераторами: MiniMax H3, Kling 2.1, AI Photo, TikTok/Shorts.
Playwright сам открывает нужный сервис, при отсутствии аккаунта **регистрирует его сам**
через temp-почту, подставляет промт/фото/настройки, ждёт генерацию и скачивает результат.

## Запуск (локально)

```bash
npm install
npm run install-browser
npm start
```

Открыть http://localhost:3000 — всё, консоль больше не нужна.

## Авто-регистрация

Аккаунты создаются сами на первом запуске каждого сервиса, куки падают в `.sessions/`:

| Сервис | Как регистрируется | Кредиты |
|---|---|---|
| h3-max.me | Sign up форма → temp-gmail → письмо «Confirm email» → ссылка подтверждения | 40 |
| polyfaced.com | /sign-up форма → вход сразу, без подтверждения | 20 |
| slice.video | email → 6-значный код из темы письма → дашборд | 200, trial 15s |

Почта — emailnator.com: генерируется адрес (`/inbox#...`), письма читаются автоматически
(код — прямо в теме, ссылка — в body письма внутри iframe). Если сервис сессию выкинет —
регистрация повторится сама.

## Режимы

| Режим | Сайт | Длительность | Фото |
|---|---|---|---|
| MiniMax H3 | h3-max.me | 5–8 сек | да (image-to-video) |
| Kling 2.1 | polyfaced.com | 1–5 сек | нет |
| Фото | polyfaced.com | — | референс опционально, GPT Image 2 / Nano Banana |
| TikTok/Shorts | slice.video | 15 сек (trial) | нет, + визуал/голос/стиль |

## Структура

```
server.js               — express: POST /api/generate, GET /api/jobs
jobs.js                 — очередь (последовательно, один браузер за раз)
automation/browser.js   — запуск playwright, хелперы, сессии, ensureAuth
automation/stealth.js   — антидетект + человеческий тайминг
automation/mailbox.js   — emailnator: адрес, приём писем, коды и ссылки
automation/register.js  — авто-регистрация трёх сервисов
providers/h3max.js      — MiniMax H3
providers/polyfaced.js  — Kling 2.1 + AI Photo
providers/slice.js      — TikTok/Shorts
public/index.html       — интерфейс
render.yaml             — конфиг для Render
videos/                 — готовые ролики
```

## Маскировка

`automation/stealth.js` подключается к каждому запуску браузера:

- снимает `navigator.webdriver`, маркеры Chrome DevTools/CDP, webdriver-флаги blink
- подменяет UA, языки, плугины, hardwareConcurrency — живой Chrome под Windows
- клики — движение мыши по дуге с дрожанием, паузы 80–240мс
- печать — 35–95мс на клавишу вместо мгновенного `fill`
- рандомные паузы 300–900мс перед стартом страницы
- Accept-Language и timezone единые на всех переходах

## Деплой на Render — без консоли

1. **GitHub:** зайди в репозиторий → **Add file → Upload files** → выбери папку
   `video-studio` целиком (или перетащи её) → **Commit**. Веб-загрузка берёт все обычные
   файлы и папки — этого достаточно, ничего дополнительно добавлять не надо.
   Репозиторий лучше приватный.

2. **Render:** render.com → **New +** → **Blueprint** → подключи репозиторий →
   Render сам прочитает `render.yaml` → **Apply**.

3. Через пару минут выдаёт ссылку `https://video-studio-xxxx.onrender.com` — открыть и
   пользоваться. На первом запуске сервисы зарегистрируются сами.

build идёт по конфигу: `npm install && npx playwright install --with-deps chromium`,
старт `npm start`, порт из `process.env.PORT`.

нюансы:
- free-план засыпает после простоя (~30с на пробуждение), генерация в момент засыпания
  оборвётся — для длинных роликов бери Starter
- видео на сервере эфемерные — качай сразу после готовности
- после любого обновления файлов — просто перезалить/запушить, Render пересоберёт

## Про селекторы

Все формы сняты с живых страниц: h3-max — по `data-testid`, slice и polyfaced —
по реальным input name/placeholder. Логи каждого шага видны в карточке задачи.
Если шаг не найдётся — нужный кусок лежит в `automation/register.js` или `providers/*.js`.

Отладка с окном браузера:

```bash
set HEADED=1 & set DEBUG=1 & npm start
```
