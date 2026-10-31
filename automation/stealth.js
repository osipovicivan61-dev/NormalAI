// антидетект-патчи + человеческий тайминг для автоматизации
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// исполняется ДО любой страницы: снимает webdriver-флаги и типичные маркеры автоматизации
function initScript() {
  return () => {
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => undefined, configurable: true,
      });
    } catch (e) {}

    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};
    window.chrome.loadTimes = window.chrome.loadTimes || (() => ({}));
    window.chrome.csi = window.chrome.csi || (() => ({}));

    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
        configurable: true,
      });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
    } catch (e) {}

    const q = navigator.permissions && navigator.permissions.query.bind(navigator.permissions);
    if (q) {
      navigator.permissions.query = (p) =>
        p && p.name === 'notifications'
          ? Promise.resolve({ state: typeof Notification !== 'undefined' ? Notification.permission : 'default', status: 'granted' })
          : q(p);
    }

    // маркеры chrome devtools protocol
    try {
      Object.getOwnPropertyNames(window)
        .filter((k) => /cdc_|__\$cdc|_phantom|__nightmare|callPhantom/.test(k))
        .forEach((k) => { try { delete window[k]; } catch (e) {} });
    } catch (e) {}
  };
}

// движение мыши по дуге с дрожанием, без резких телепортов
async function humanMove(page, loc) {
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return;
  await page.mouse.move(rnd(80, 1200), rnd(80, 700));
  await sleep(rnd(60, 200));
  const tx = box.x + rnd(box.width * 0.2, box.width * 0.8);
  const ty = box.y + rnd(box.height * 0.25, box.height * 0.75);
  await page.mouse.move(tx, ty, { steps: Math.round(rnd(10, 22)) });
  await sleep(rnd(80, 240));
}

async function humanClick(page, loc) {
  await humanMove(page, loc);
  await loc.click();
  await sleep(rnd(100, 380));
}

// печатает как человек: интервал 35–95мс на клавишу, а не мгновенный fill
async function humanType(loc, text) {
  await loc.pressSequentially(String(text), { delay: Math.round(rnd(35, 95)), timeout: 60000 });
}

module.exports = { UA, rnd, sleep, initScript, humanMove, humanClick, humanType };
