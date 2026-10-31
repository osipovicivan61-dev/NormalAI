// h3-max.me — MiniMax H3 Turbo (text-to-video / image-to-video)
const path = require('path');
const {
  launch, clickAny, fillAny, text, clickText, ensureAuth,
  captureMedia, downloadMedia, waitForVideoElement, VIDEO_DIR, UPLOAD_DIR,
} = require('./browser');

const SITE = 'https://h3-max.me/';

module.exports = async function run(job, log) {
  const p = job.params;
  const ctx = await launch();
  const page = await ctx.newPage();
  try {
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    log('h3-max открыт');

    await ensureAuth(page, '[data-testid="video-mode-text"]', log,
      require('../automation/register').registerH3);

    const mode = p.photoRef ? 'image' : 'text';
    await clickAny(page, [`[data-testid="video-mode-${mode}"]`]);
    log(`режим: ${mode === 'image' ? 'image to video' : 'text to video'}`);

    if (mode === 'image') {
      const input = page.locator('input[type="file"]').first();
      await input.setInputFiles(path.join(UPLOAD_DIR, p.photoRef));
      await page.waitForTimeout(2500);
      log('фото загружено');
    }

    await fillAny(page, ['textarea', '[contenteditable="true"]'], p.prompt);
    log('промт введён');

    const dur = Math.min(8, Math.max(5, p.duration));
    await page.selectOption('select[name="duration"]', String(dur)).catch(() => {});
    log(`длительность: ${dur}s`);

    await clickAny(page, ['[aria-pressed="false"]:has-text("480P")'], 6000).catch(() => {});
    if (mode === 'text') {
      await clickAny(page, [`button:has-text("${p.aspect}")`, `label:has-text("${p.aspect}")`], 6000)
        .catch(() => log('ratio не найден, оставляю по умолчанию'));
    }

    const media = captureMedia(page);
    await clickAny(page, ['[data-testid="video-generate"]']);
    log('генерация запущена…');

    const url = await Promise.race([
      media,
      waitForVideoElement(page).catch(() => null),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout генерации (12 мин)')), 720000)),
    ]);
    if (!url) throw new Error('видео не появилось');

    const ext = path.extname(new URL(url, SITE).pathname) || '.mp4';
    const out = path.join(VIDEO_DIR, `h3-${job.id}${ext}`);
    await downloadMedia(page, url, out);
    log('видео скачано');
    return out;
  } finally {
    await ctx.close().catch(() => {});
  }
};
