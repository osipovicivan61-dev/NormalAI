// emailnator: temp-gmail адрес + приём писем (коды и ссылки)
const { rnd, sleep } = require('./stealth');

async function newAddress(mailPage) {
  await mailPage.goto('https://www.emailnator.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mailPage.locator('.mf-btn-go').first().click({ timeout: 20000 });
  await mailPage.waitForURL(/\/inbox#/, { timeout: 30000 });
  return decodeURIComponent(mailPage.url().split('#')[1]);
}

// ждёт письмо от нужного отправителя, возвращает { text, href }
async function waitMessage(mailPage, senderRe, timeout = 180000) {
  const deadline = Date.now() + timeout;
  let first = true;
  while (Date.now() < deadline) {
    if (!first) {
      await mailPage.getByText('Reload', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
      await sleep(Math.round(rnd(4000, 6000)));
    }
    first = false;
    const hit = await mailPage.evaluate((src) => {
      const row = [...document.querySelectorAll('.mf-msg-row')]
        .find((r) => new RegExp(src, 'i').test(r.innerText));
      if (!row) return null;
      const a = row.querySelector('a.mf-msg-link');
      return { text: (row.innerText || '').replace(/\s+/g, ' '), href: a ? a.href : null };
    }, senderRe);
    if (hit && hit.href) return hit;
  }
  throw new Error('письмо не пришло от ' + senderRe);
}

// тело письма лежит в about:blank iframe — ищем ссылку там
async function messageLink(mailPage, hrefRe) {
  await sleep(1500);
  return mailPage.evaluate((src) => {
    for (const f of document.querySelectorAll('iframe')) {
      try {
        const d = f.contentDocument;
        if (!d) continue;
        for (const a of d.querySelectorAll('a')) {
          if (new RegExp(src, 'i').test(a.href)) return a.href;
        }
      } catch (e) {}
    }
    return null;
  }, hrefRe);
}

function extractCode(text) {
  const m = String(text).match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

module.exports = { newAddress, waitMessage, messageLink, extractCode };
