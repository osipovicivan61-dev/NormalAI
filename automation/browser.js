const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const stealth = require('./stealth');

const ROOT = path.join(__dirname, '..');
const SESSION_ROOT = process.env.SESSION_DIR || path.join(ROOT, '.sessions');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const VIDEO_DIR = path.join(ROOT, 'videos');

for (const dir of [SESSION_ROOT, UPLOAD_DIR, VIDEO_DIR]) fs.mkdirSync(dir, { recursive: true });

const HEADLESS = !process.env.HEADED;

// каждый «слот» = отдельный профиль браузера = отдельный аккаунт на сервисе
function slotDir(slot) {
  const dir = path.join(SESSION_ROOT, 'slot-' + (slot || 1));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function launch(slot = 1) {
  const SESSION_DIR = slotDir(slot);
  const READY_MARK = path.join(SESSION_DIR, '.ready');
  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: HEADLESS,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    userAgent: stealth.UA,
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  });
  await ctx.addInitScript(stealth.initScript());
  // доводим сторону до целого числа
  await stealth.sleep(stealth.rnd(300, 900));
  ctx.__slot = slot || 1;
  ctx.__ready = READY_MARK;
  return ctx;
}

function stampReady(ctx) {
  fs.writeFileSync(ctx.__ready, String(Date.now()));
}

function firstRun(ctx) {
  return !fs.existsSync(ctx.__ready);
}

// first visible locator among CSS candidates
async function any(page, selectors, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      try {
        if (await loc.isVisible({ timeout: 300 })) return loc;
      } catch (_) {}
    }
    await page.waitForTimeout(300);
  }
  throw new Error('not found: ' + selectors.join(' | '));
}

async function clickAny(page, selectors, timeout = 15000) {
  const loc = await any(page, selectors, timeout);
  await stealth.humanClick(page, loc);
  return loc;
}

async function fillAny(page, selectors, text, timeout = 15000) {
  const loc = await any(page, selectors, timeout);
  await loc.click();
  await loc.evaluate((el) => el.select && el.select()).catch(() => {});
  await stealth.humanType(loc, text);
  return loc;
}

async function text(page, re, opts = {}) {
  const loc = page.getByText(re, { exact: false }).first();
  await loc.waitFor({ state: 'visible', timeout: opts.timeout || 15000 });
  return loc;
}

async function clickText(page, re, opts = {}) {
  const loc = await text(page, re, opts);
  await loc.click();
  return loc;
}

// если аккаунта нет — регистрирует сам (temp-почта), сессия остаётся в .sessions
async function ensureAuth(page, authSelector, log, register, { invert = false } = {}) {
  const locked = await (async () => {
    const loc = page.locator(authSelector).first();
    const vis = await loc.isVisible({ timeout: 12000 }).catch(() => false);
    if (!vis) return !invert;
    const dis = await loc.isDisabled().catch(() => false);
    return invert ? true : dis;
  })();

  if (!locked) return true;

  log('аккаунта нет — авто-регистрация…');
  await register(page, log);
  await page.waitForTimeout(3000);

  const loc = page.locator(authSelector).first();
  const vis = await loc.isVisible({ timeout: 15000 }).catch(() => false);
  const stillLocked = invert ? vis : !vis;
  if (stillLocked) throw new Error('регистрация прошла, но вход не подтвердился: ' + authSelector);
  stampReady(page.context());
  return true;
}

// захватывает прямую ссылку на результат; реклама и примеры сайта отфильтрованы
function captureMedia(page) {
  return new Promise((resolve) => {
    const onResp = (resp) => {
      const u = resp.url();
      if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u) &&
          !/site-assets|h3-home|example|signup|avatar|font|icon|doubleclick|googlesyndication|adsbygoogle|pagead|\/ads?\//i.test(u)) {
        page.off('response', onResp);
        console.log('[media] ' + u);
        resolve(u);
      }
    };
    page.on('response', onResp);
  });
}

async function downloadMedia(page, url, outFile) {
  const resp = await page.request.get(url, { timeout: 120000 });
  if (!resp.ok()) throw new Error('download failed: HTTP ' + resp.status());
  fs.writeFileSync(outFile, await resp.body());
  return outFile;
}

// ждёт настоящее результат-видео (не демо-ролики сайта), возвращает url
async function waitForVideoElement(page, timeout = 600000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const url = await page.evaluate(() => {
      const re = /site-assets|example|home|inner|product-|everyday|ceramic|demo|preview/i;
      for (const v of document.querySelectorAll('video')) {
        const s = v.currentSrc || v.src || (v.querySelector('source') && v.querySelector('source').src) || '';
        if (s && !re.test(s)) return s;
      }
      return null;
    }).catch(() => null);
    if (url) return url;
    await page.waitForTimeout(3000);
  }
  throw new Error('видео не появилось');
}

module.exports = {
  launch, any, clickAny, fillAny, text, clickText,
  ensureAuth, captureMedia, downloadMedia, waitForVideoElement,
  stampReady, firstRun, VIDEO_DIR, UPLOAD_DIR,
};
