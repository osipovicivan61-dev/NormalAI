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
async function registerH3(page, log) {
  await page.goto('https://h3-max.me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const { mailPage, addr } = await freshMail(page);
  log('temp-почта: ' + addr);

  await page.click('[data-testid="navbar-login-trigger"]', { timeout: 20000 });
  await page.click('button:has-text("Sign up")', { timeout: 10000 });
  await page.fill('input[name="name"]', NAME);
  await page.fill('input[name="email"]', addr);
  await page.fill('input[name="password"]', PASSWORD);
  await page.fill('input[name="confirmPassword"]', PASSWORD);
  await page.click('[data-testid="auth-register-submit"]');
  await page.getByText(/Check your inbox/i).first().waitFor({ timeout: 25000 });
  log('h3: письмо с подтверждением ушло');

  const hit = await mailbox.waitMessage(mailPage, /h3-max/i);
  await mailPage.goto(hit.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const link = await mailbox.messageLink(mailPage, /verify-email/i);
  if (!link) throw new Error('h3: ссылка verify-email не найдена в письме');
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  log('h3: email подтверждён');

  // подтверждение может не залогинить — добиваем входом email/password
  const authed = await page.locator('[data-testid="video-mode-text"]').first()
    .isVisible({ timeout: 8000 }).catch(() => false)
    .then((v) => v && !page.locator('[data-testid="video-mode-text"]').first().isDisabled());
  if (!authed) {
    await page.click('[data-testid="navbar-login-trigger"]', { timeout: 10000 }).catch(() => {});
    await page.click('button:has-text("Sign in with email")', { timeout: 8000 }).catch(() => {});
    await page.fill('input[type="email"]', addr);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]', { timeout: 8000 }).catch(() => {});
    await sleep(4000);
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
