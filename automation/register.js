// авто-регистрация на первом запуске: temp-почта → аккаунт → сессия сохраняется в .sessions
const mailbox = require('./mailbox');
const { rnd, sleep, humanType } = require('./stealth');

const PASSWORD = 'VidStuDio!2026x';
const NAME = 'studio nyx';

async function freshMail(page) {
  const mailPage = await page.context().newPage();
  const addr = await mailbox.newAddress(mailPage);
  return { mailPage, addr };
}

// h3-max.me: Sign in → Sign up → форма → письмо → Confirm email → автологин
// сайт отвергает часть temp-доменов (400 Invalid email) — пробуем адреса, пока не примет
async function registerH3(page, log) {
  await page.goto('https://h3-max.me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const { mailPage } = await freshMail(page);

  let addr = null;
  for (let attempt = 1; attempt <= 4 && !addr; attempt++) {
    // свежая страница на каждую попытку — диалог после отказа остаётся в мёртвом состоянии
    await page.goto('https://h3-max.me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    addr = await mailbox.newAddress(mailPage);
    log('temp-почта: ' + addr);

    await page.click('[data-testid="navbar-login-trigger"]', { timeout: 20000 }).catch(() => {});
    await page.click('button:has-text("Sign up")', { timeout: 8000 }).catch(() => {});
    await page.fill('input[name="name"]', NAME);
    await page.fill('input[name="email"]', addr);
    await page.fill('input[name="password"]', PASSWORD);
    await page.fill('input[name="confirmPassword"]', PASSWORD);
    await page.click('[data-testid="auth-register-submit"]');

    const ok = await page.getByText(/Check your inbox/i).first()
      .isVisible({ timeout: 15000 }).catch(() => false);
    if (ok) break;

    // реальные ошибки формы («Already have an account? Sign in» — это подпись, не ошибка)
    const err = await page.evaluate(() => {
      const bad = document.querySelector('input[aria-invalid="true"]');
      if (bad) return 'invalid field: ' + bad.name;
      return (document.body.innerText.split('\n').find((l) =>
        /invalid email|already registered|password.*(short|match)|too short/i.test(l)) || '').trim();
    });
    log(`h3: попытка ${attempt} не прошла${err ? ' (' + err + ')' : ''} — пробую другой адрес`);
    addr = null;
  }
  if (!addr) throw new Error('h3: ни один temp-адрес не прошёл регистрацию');
  log('h3: письмо с подтверждением ушло');

  await mailbox.waitMessage(mailPage, /h3-max/i);
  // письмо уже открыто в mailPage — ищем verify-ссылку прямо в нём
  const link = await mailbox.messageLink(mailPage, /verify-email/i, 60000);
  if (!link) throw new Error('h3: ссылка verify-email не найдена в письме');
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  log('h3: email подтверждён');

  // verify с callbackURL обычно сразу логинит — проверяем, и только если заблокировано входим сами
  const tab = page.locator('[data-testid="video-mode-text"]').first();
  const vis = await tab.isVisible({ timeout: 10000 }).catch(() => false);
  const disabled = vis ? await tab.isDisabled().catch(() => true) : true;
  if (disabled) {
    log('h3: вхожу email/password…');
    await page.click('[data-testid="navbar-login-trigger"]', { timeout: 15000 });
    await page.click('button:has-text("Sign in with email")', { timeout: 10000 });
    await page.fill('input[type="email"]', addr);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]', { timeout: 10000 });
    await sleep(4000);
    const t2 = page.locator('[data-testid="video-mode-text"]').first();
    const d2 = (await t2.isVisible({ timeout: 8000 }).catch(() => false))
      ? await t2.isDisabled().catch(() => true) : true;
    if (d2) throw new Error('h3: вход не подтвердился после verify');
  } else {
    log('h3: вход подтверждён');
  }
  await mailPage.close().catch(() => {});
}

// polyfaced.com: /sign-up — верификация не нужна, студия открывается сразу
async function registerPolyfaced(page, log) {
  await page.goto('https://polyfaced.com/sign-up', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const { mailPage, addr } = await freshMail(page);
  log('temp-почта: ' + addr);

  await page.fill('#name', NAME);
  await page.fill('#email', addr);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.click('form button[type="submit"], form button:has-text("Sign Up")');
  await page.waitForURL(/\/(studio|$)/, { timeout: 30000 }).catch(() => {});
  await mailPage.close().catch(() => {});
  log('polyfaced: аккаунт создан');
}

// slice.video: email → 6-digit код из темы письма → дашборд
async function registerSlice(page, log) {
  await page.goto('https://slice.video/registration/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const { mailPage, addr } = await freshMail(page);
  log('temp-почта: ' + addr);

  await page.fill('input[name="email_address"]', addr);
  await page.click('button:has-text("Email me a code"), input[type="submit"][value="Email me a code"]');
  await page.waitForURL(/session\/code/, { timeout: 30000 });
  log('slice: жду 6-значный код…');

  const hit = await mailbox.waitMessage(mailPage, /slice\.video/i);
  const code = mailbox.extractCode(hit.text);
  if (!code) throw new Error('slice: код не найден в письме');
  log('slice: код ' + code);

  await page.fill('input[placeholder="6-digit code"], input[name*="code"]', code);
  await page.click('button:has-text("Continue")');
  await page.waitForURL(/videos/, { timeout: 30000 });
  await mailPage.close().catch(() => {});
  log('slice: аккаунт создан');
}

module.exports = { registerH3, registerPolyfaced, registerSlice, PASSWORD };
