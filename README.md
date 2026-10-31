# Video Studio

Сайт-обёртка над четырьмя генераторами: MiniMax H3, Kling 2.1, AI Photo, TikTok/Shorts.
Playwright сам открывает нужный сервис, подставляет промт/фото/настройки, ждёт генерацию
и скачивает результат в `videos/`.

## Запуск

```bash
cd video-studio
npm install
npm run install-browser
npm start            # или npm run headed — браузер видимый
```

Открыть http://localhost:3000

## Первый запуск (вход в аккаунты)

Сервисы входят один раз — куки сохраняются в `.sessions/`:

1. `set HEADED=1 && npm start`
2. Запусти любую генерацию — откроется окно браузера
3. Залогинься (или зарегистрируйся) на нужном сайте, вернись в консоль, нажми **Enter**
4. Повтори для остальных сервисов — дальше всё без участия

Сколько нужно аккаунтов:
- **h3-max.me** — 40 кредитов на регистрацию (хватает на 5s@768P или 8s@480P)
- **polyfaced.com** — 20 кредитов
- **slice.video** — 200 кредитов, trial-видео до 15s

## Режимы

| Режим | Сайт | Длительность | Фото |
|---|---|---|---|
| MiniMax H3 | h3-max.me | 5–8 сек | да (image-to-video) |
| Kling 2.1 | polyfaced.com | 1–5 сек | нет |
| Фото | polyfaced.com | — | референс опционально, модель GPT Image 2 / Nano Banana |
| TikTok/Shorts | slice.video | 15 сек (trial) | нет, + визуал/голос/стиль |

## Структура

```
server.js            — express: POST /api/generate, GET /api/jobs
jobs.js              — очередь (последовательно, один браузер за раз)
automation/browser.js— запуск playwright, хелперы поиска/скачивания, сессии
providers/h3max.js   — MiniMax H3
providers/polyfaced.js — Kling 2.1 + AI Photo
providers/slice.js   — TikTok/Shorts
public/index.html    — интерфейс
videos/              — готовые ролики
```

## Маскировка

`automation/stealth.js` подключается к каждому запуску браузера:

- снимает `navigator.webdriver`, маркеры Chrome DevTools/CDP и webdriver-флаги blink
- подменяет UA, языки, плагины, hardwareConcurrency — выглядит как обычный Chrome под Windows
- клики — движение мыши по дуге с дрожанием и паузами 80–240мс
- печать — реальная скорость 35–95мс на клавишу вместо мгновенного `fill`
- рандомные паузы 300–900мс перед стартом страницы
- Accept-Language и timezone зафиксированы единообразно на всех переходах

Сессия одна и та же (куки в `.sessions/`), поведение повторяет живого человека — антибот-скриптам на стороне сервисов не за что зацепиться.

## Деплой на Render

Путь проекта: `C:\Users\Asus\OneDrive\Документы\Default Project\video-studio`

**Важно:** на Render нет headed-браузера, поэтому логин в сервисы делается локально и куки закатываются в репозиторий один раз.

1. **Логин локально** (один раз, если ещё не сделан):

   ```powershell
   cd "C:\Users\Asus\OneDrive\Документы\Default Project\video-studio"
   npm install
   npm run install-browser
   set HEADED=1 && npm start
   ```

   открылось окно → залогинься на нужном сайте → Enter в консоли. повторить для h3-max / polyfaced / slice. `.sessions/` заполнится куками.

2. **Пуш в GitHub** (репозиторий **приватный** — там лежат куки):

   ```powershell
   cd "C:\Users\Asus\OneDrive\Документы\Default Project\video-studio"
   git init
   git add .
   git commit -m "video studio"
   git remote add origin https://github.com/<ты>/video-studio.git
   git push -u origin main
   ```

   `.gitignore` прячет `node_modules/`, `uploads/`, `videos/`, но `.sessions/` намеренно остаётся — без него Render будет просить логин, которого дать не сможешь.

3. **Render:**
   - New → Blueprint → выбрать репозиторий → Render сам подхватит `render.yaml`
   - build: `npm install && npx playwright install --with-deps chromium` (уже в конфиге)
   - старт: `npm start`, порт берётся из `process.env.PORT` — уже поддержано
   - выдаётся URL вида `https://video-studio.onrender.com`

4. **После деплоя:** открыть URL → 4 режима → генерация. Видео складываются в `videos/` (эфемерные, качай сразу после генерации).

нюансы:
- free-план засыпает после простоя — проснётся через ~30с после запроса, но генерация, идущая в момент засыпания, оборвётся; для длинных роликов бери Starter
- после добавления зависимостей/сессий — просто `git push`, Render пересоберёт
- если сервис разлогинил аккаунт — залогинься локально и запушь `.sessions/` заново

## Про селекторы

Селекторы для h3-max.me сняты с живой страницы (`data-testid`), для polyfaced и slice —
эвристические (текстовые лейблы). Если шаг не находится — смотри лог в интерфейсе,
нужный кусок лежит в `providers/*.js` в начале файла.

Отладка вручную:

```bash
set HEADED=1 & set DEBUG=1 & npm start
```
