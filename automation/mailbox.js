// temp-mail.io: temp-адрес + приём писем (коды и ссылки)
const { rnd, sleep } = require('./stealth');

const SITE = 'https://temp-mail.io/en';

// открывает temp-mail.io и возвращает свежий адрес (кнопка change гарантирует новый)
async function newAddress(mailPage) {
  await mailPage.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mailPage.waitForSelector('input#email', { timeout: 30000 });
  // закрывает cookie-баннер, если есть
  await mailPage.locator('[data-qa="close-button"]').last().click({ timeout: 4000 }).catch(() => {});
  await mailPage.waitForTimeout(1500);
  // «change» выдаёт новый адрес; на свежей странице адрес уже уникальный — жмём для верности
  await mailPage.locator('[data-qa="change-button"]').click({ timeout: 8000 }).catch(() => {});
  await mailPage.waitForTimeout(2500);
  const addr = await mailPage.evaluate(() => (document.querySelector('input#email') || {}).value || '');
  if (!addr.includes('@')) throw new Error('temp-mail: адрес не появился');
  return addr;
}

// ждёт письмо от нужного отправителя; возвращает { text, href }
async function waitMessage(mailPage, senderRe, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await mailPage.locator('[data-qa="refresh-button"]').click({ timeout: 6000 }).catch(() => {});
    const hit = await mailPage.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const box = document.querySelector('[data-qa="inbox"]') || document.body;
      const rows = [...box.querySelectorAll('a, li, tr, [class*="message"], [class*="row"]')]
        .filter((r) => r.innerText && r.innerText.trim().length > 2 && re.test(r.innerText));
      if (!rows.length) return null;
      const row = rows[0];
      return { text: row.innerText.replace(/\s+/g, ' ').trim(), el: true };
    }, senderRe);
    if (hit) {
      // открываем письмо
      await mailPage.evaluate((src) => {
        const re = new RegExp(src, 'i');
        const box = document.querySelector('[data-qa="inbox"]') || document.body;
        const row = [...box.querySelectorAll('a, li, tr, [class*="message"], [class*="row"]')]
          .find((r) => r.innerText && r.innerText.trim().length > 2 && re.test(r.innerText));
        if (row) row.click();
      }, senderRe).catch(() => {});
      await sleep(2500);
      const body = await mailPage.evaluate(() =>
        (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 4000));
      const href = await messageLink(mailPage, /.*/i, 5000).catch(() => null);
      return { text: hit.text + ' ' + body, href };
    }
    await mailPage.waitForTimeout(Math.round(rnd(4000, 6000)));
  }
  throw new Error('письмо не пришло от ' + senderRe);
}

// ищет ссылку в письме (документ + iframe), возвращает null если нет
async function messageLink(mailPage, hrefRe, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const link = await mailPage.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const scan = (doc) => {
        for (const a of doc.querySelectorAll('a')) {
          if (re.test(a.href)) return a.href;
        }
        return null;
      };
      let found = scan(document);
      if (found) return found;
      for (const f of document.querySelectorAll('iframe')) {
        try {
          const d = f.contentDocument;
          if (d) { found = scan(d); if (found) return found; }
        } catch (e) {}
      }
      return null;
    }, hrefRe);
    if (link) return link;
    await mailPage.waitForTimeout(1500);
  }
  return null;
}

function extractCode(text) {
  const m = String(text).match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

module.exports = { newAddress, waitMessage, messageLink, extractCode };
