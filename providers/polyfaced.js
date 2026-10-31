// polyfaced.com — Kling 2.1 video (≤5s) и AI photo (GPT Image 2 / Nano Banana)
const path = require('path');
const {
  launch, clickAny, fillAny, any, text, ensureAuth,
  captureMedia, downloadMedia, waitForVideoElement, VIDEO_DIR, UPLOAD_DIR,
} = require('../automation/browser');

const SITE = 'https://polyfaced.com/';

async function openStudio(page, log) {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('polyfaced открыт');
  // залогинен = ссылки "Start free / sign-up" нет
  await ensureAuth(page, 'a[href*="/sign-up"]', log,
    require('../automation/register').registerPolyfaced, { invert: true });
}

async function pickModel(page, want, log) {
  const map = {
    'gpt-image-2': /gpt\s*image\s*2/i,
    'nano-banana': /nano\s*banana/i,
  };
  try {
    await clickText(page, map[want] || /gpt\s*image/i);
    log(`фото-модель: ${want}`);
  } catch (_) {
    log('выбор модели не найден, оставляю по умолчанию');
  }
}

async function runVideo(page, job, log) {
  const p = job.params;
  await page.goto('https://polyfaced.com/studio/video', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  await fillAny(page, ['textarea', '[contenteditable="true"]', 'input[type="text"]'], p.prompt);
  log('промт введён');

  const dur = Math.min(5, Math.max(1, p.duration));
  const durBtn = page.locator(
    `button:has-text("${dur}s"), button:has-text("${dur} sec"), button:text-is("${dur}"), [role="radio"]:has-text("${dur}")`
  ).first();
  await durBtn.click({ timeout: 5000 }).catch(() => log('кнопка длительности не найдена'));
  log(`длительность: ${dur}s (kling max 5)`);

  const media = captureMedia(page);
  await clickAny(page, ['button:has-text("Generate")', 'button:has-text("Create")']);
  log('генерация запущена…');
  return waitResult(page, media, log);
}

async function runPhoto(page, job, log) {
  const p = job.params;
  await page.goto('https://polyfaced.com/studio/image', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  await pickModel(page, p.photoModel, log);

  if (p.photoRef) {
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(path.join(UPLOAD_DIR, p.photoRef)).catch(() => log('поле референса не найдено'));
    await page.waitForTimeout(2000);
    log('референс загружен');
  }

  await fillAny(page, ['textarea', '[contenteditable="true"]', 'input[type="text"]'], p.prompt);
  log('промт введён');

  const media = page.waitForResponse((r) =>
      /\.(png|jpe?g|webp)(\?|$)/i.test(r.url()) &&
      !/icon|logo|avatar|thumb|preset|showcase|favicon|og-/i.test(r.url()),
    { timeout: 600000 }).then((r) => r.url());
  await clickAny(page, ['button:has-text("Generate")', 'button:has-text("Create")']);
  log('генерация фото запущена…');

  const url = await media;
  const ext = path.extname(new URL(url, SITE).pathname) || '.png';
  const out = path.join(VIDEO_DIR, `photo-${job.id}${ext}`);
  await downloadMedia(page, url, out);
  log('фото скачано');
  return out;
}

async function waitResult(page, media, log) {
  const url = await Promise.race([
    media,
    waitForVideoElement(page),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout генерации (12 мин)')), 720000)),
  ]);
  const ext = path.extname(new URL(url, 'https://polyfaced.com/').pathname) || '.mp4';
  const out = path.join(VIDEO_DIR, `kling-${job.id}${ext}`);
  await downloadMedia(page, url, out);
  log('видео скачано');
  return out;
}

module.exports = async function run(job, log, kind) {
  const ctx = await launch(job.slot || 1);
  const page = await ctx.newPage();
  try {
    await openStudio(page, log);
    return kind === 'photo' ? await runPhoto(page, job, log) : await runVideo(page, job, log);
  } finally {
    await ctx.close().catch(() => {});
  }
};
