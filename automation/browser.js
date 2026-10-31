const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const stealth = require('./stealth');

const ROOT = path.join(__dirname, '..');
const SESSION_DIR = process.env.SESSION_DIR || path.join(ROOT, '.sessions');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const VIDEO_DIR = path.join(ROOT, 'videos');
const READY_MARK = path.join(SESSION_DIR, '.ready');

for (const dir of [SESSION_DIR, UPLOAD_DIR, VIDEO_DIR]) fs.mkdirSync(dir, { recursive: true });

const HEADLESS = !process.env.HEADED;

async function launch() {
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
  return ctx;
}

function stampReady() {
  fs.writeFileSync(READY_MARK, String(Date.now()));
}

function firstRun() {
  return !fs.existsSync(READY_MARK);
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

// waits until the generator is usable; if not, opens login and waits for him to finish it
async function ensureAuth(page, authSelector, log, hint) {
  const ok = await page.locator(authSelector).first().isVisible({ timeout: 12000 }).catch(() => false);
  const enabled = ok ? !(await page.locator(authSelector).first().isDisabled().catch(() => true)) : false;
  if (enabled) return true;

  if (HEADLESS) {
    log('нет входа — перезапусти с HEADED=1 и залогинься один раз');
    throw new Error('not authenticated: ' + hint);
  }

  log(hint);
  log('окно браузера открыто — залогинься, потом нажми Enter здесь…');
  await new Promise((r) => process.stdin.once('data', r));
  await page.waitForTimeout(1500);
  stampReady();
  return true;
}

// captures a direct media url (mp4/webm) produced by the page
function captureMedia(page) {
  return new Promise((resolve) => {
    const onResp = (resp) => {
      const u = resp.url();
      if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u) && !/signup|avatar|font|icon/i.test(u)) {
        page.off('response', onResp);
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

// waits for any <video src> and returns its url
async function waitForVideoElement(page, timeout = 600000) {
  await page.waitForSelector('video[src], video source', { timeout });
  return page.evaluate(() => {
    const v = document.querySelector('video[src]') || document.querySelector('video');
    return v.currentSrc || v.src || (v.querySelector('source') && v.querySelector('source').src);
  });
}

module.exports = {
  launch, any, clickAny, fillAny, text, clickText,
  ensureAuth, captureMedia, downloadMedia, waitForVideoElement,
  stampReady, firstRun, VIDEO_DIR, UPLOAD_DIR,
};
