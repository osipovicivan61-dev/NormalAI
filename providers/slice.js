// slice.video — TikTok / Shorts: New Slice, фикс 15s, trial-кредиты
const path = require('path');
const {
  launch, clickAny, fillAny, any, clickText, ensureAuth,
  captureMedia, downloadMedia, waitForVideoElement, VIDEO_DIR,
} = require('../automation/browser');

const SITE = 'https://slice.video/';

async function radioByLabel(page, label, timeout = 6000) {
  // label → input рядом: кликаем по самому label
  const loc = page.locator(`label:has-text("${label}"), [role="radio"]:has-text("${label}")`).first();
  await loc.click({ timeout });
  return loc;
}

module.exports = async function run(job, log) {
  const p = job.params;
  const ctx = await launch();
  const page = await ctx.newPage();
  try {
    await page.goto('https://slice.video/videos', { waitUntil: 'domcontentloaded', timeout: 60000 });
    log('slice.video открыт');

    await ensureAuth(page, 'a:has-text("New slice")', log,
      require('../automation/register').registerSlice);

    await clickAny(page, ['a:has-text("New Slice")', 'a[href*="slices/new"]', 'button:has-text("New Slice")'], 15000);
    log('новый slice создан');

    // "What's your video about?" — одна фраза, AI пишет сценарий
    await fillAny(page, ['textarea[name*="brief"]', 'textarea[name*="idea"]', 'textarea'], p.prompt);
    log('тема введена');

    // Visuals
    await radioByLabel(page, p.visuals === 'still' ? 'Still images' : 'Animated video')
      .catch(() => log('выбор визуала не найден'));
    log(`визуал: ${p.visuals === 'still' ? 'still images' : 'animated video'}`);

    // Who speaks
    await radioByLabel(page, p.speaker === 'characters' ? 'The characters' : 'A narrator')
      .catch(() => log('выбор диктора не найден'));
    log(`голос: ${p.speaker}`);

    // Length — trial всегда 15s
    await radioByLabel(page, '~15s', 4000).catch(() => log('длина: 15s по умолчанию'));
    log('длина: 15s (trial)');

    // Voiceover + Captions — включаем по умолчанию
    await page.locator('input[type="checkbox"]').first().check({ timeout: 3000 }).catch(() => {});

    // Visual style
    if (p.style && p.style !== 'auto') {
      await clickText(page, new RegExp(p.style, 'i'), 5000).catch(() => log('стиль не выбран, ставлю Auto'));
      log(`стиль: ${p.style}`);
    } else {
      log('стиль: auto');
    }

    const media = captureMedia(page);
    await clickAny(page, [
      'button:has-text("Generate")', 'button:has-text("Slice it")',
      'button:has-text("Create")', 'button[type="submit"]',
    ]);
    log('генерация запущена…');

    const url = await Promise.race([
      media,
      waitForVideoElement(page).catch(() => null),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout генерации (15 мин)')), 900000)),
    ]);
    if (!url) throw new Error('видео не появилось');

    const ext = path.extname(new URL(url, SITE).pathname) || '.mp4';
    const out = path.join(VIDEO_DIR, `slice-${job.id}${ext}`);
    await downloadMedia(page, url, out);
    log('видео скачано');
    return out;
  } finally {
    await ctx.close().catch(() => {});
  }
};
