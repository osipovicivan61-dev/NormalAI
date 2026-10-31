// h3-max.me — MiniMax H3 Turbo (text-to-video / image-to-video)
const path = require('path');
const {
  launch, clickAny, fillAny, text, clickText, ensureAuth,
  captureMedia, downloadMedia, waitForVideoElement, VIDEO_DIR, UPLOAD_DIR,
} = require('../automation/browser');

const SITE = 'https://h3-max.me/';

module.exports = async function run(job, log) {
  const p = job.params;
  const ctx = await launch(job.slot || 1);
  const page = await ctx.newPage();
  try {
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    log('h3-max открыт');

    await ensureAuth(page, '[data-testid="video-mode-text"]', log,
      require('../automation/register').registerH3);

    // 480P держит до 8s, 768P — максимум 5s
    const res = p.resolution === '768P' ? '768P' : '480P';
    let dur = Math.max(5, Math.min(8, Number(p.duration) || 5));
    if (res === '768P') dur = Math.min(5, dur);

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

    await page.selectOption('select[name="duration"]', String(dur)).catch(() => {});
    log(`длительность: ${dur}s · ${res}`);

    await clickAny(page, [`[aria-pressed="false"]:has-text("${res}")`, `button:has-text("${res}")`], 6000)
      .catch(() => log('кнопка разрешения не найдена, оставляю по умолчанию'));
    if (mode === 'text') {
      await clickAny(page, [`button:has-text("${p.aspect}")`, `label:has-text("${p.aspect}")`], 6000)
        .catch(() => log('ratio не найден, оставляю по умолчанию'));
    }

    // ловим отказ сервера (например, нехватка кредитов) и фиксируем, что запрос ушёл
    let jobRequested = false;
    const fail = new Promise((_, rej) => {
      const onResp = async (r) => {
        if (!/\/api\/video\/jobs/.test(r.url()) || r.request().method() !== 'POST') return;
        jobRequested = true;
        if (r.ok()) return;
        let msg = 'HTTP ' + r.status();
        try { msg = (await r.json()).error || msg; } catch (e) {}
        page.off('response', onResp);
        rej(new Error(msg));
      };
      page.on('response', onResp);
    });

    await clickAny(page, ['[data-testid="video-generate"]']);
    log('генерация запущена…');

    // если через 10с запрос не ушёл — сайт не запустил генерацию (обычно не хватает кредитов)
    setTimeout(async () => {
      if (jobRequested) return;
      const why = await page.evaluate(() => {
        const m = document.body.innerText.match(/[^\n]*(не хватает|insufficient|need more credits|Add a plan|credit pack)[^\n]*/i);
        return m ? m[0].trim() : '';
      }).catch(() => '');
      fail.catch(() => {});
      fail.reject(new Error('генерация не запустилась' + (why ? ': ' + why : ' (не хватает кредитов?)')));
    }, 10000);

    const media = captureMedia(page);

    const url = await Promise.race([
      media,
      fail,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout генерации (12 мин)')), 720000)),
    ]);

    const ext = path.extname(new URL(url, SITE).pathname) || '.mp4';
    const out = path.join(VIDEO_DIR, `h3-${job.id}${ext}`);
    await downloadMedia(page, url, out);
    log('видео скачано');
    return out;
  } finally {
    await ctx.close().catch(() => {});
  }
};
