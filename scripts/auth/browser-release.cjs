const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/git/Bit-O/trip/node_modules/playwright-core');
const db = new PrismaClient();
const base = 'http://localhost:4428';
const password = 'correct horse battery staple';
const stamp = Date.now();
const screenshots = process.env.AUTH_SCREENSHOT_DIR || 'docs/auth-verification';
let browser;
const network = [];
async function signup(page, who, claim) {
  await page.goto(base + '/signup');
  await page.locator('#auth-name').fill(who);
  await page.locator('#auth-email').fill(`${who}${stamp}@example.com`);
  await page.locator('#auth-password').fill(password);
  await page.locator('#auth-confirm').fill(password);
  if (claim) { await page.locator('summary').click(); await page.locator('#auth-claim').fill(claim); }
  await page.getByRole('button', { name: '가입하고 시작하기', exact: true }).click();
  await page.waitForURL(base + '/', { timeout: 30000 });
  await page.getByRole('button', { name: '로그아웃', exact: true }).waitFor();
}
async function add(page, merchant) {
  await page.bringToFront();
  await page.goto(base + '/transactions');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '거래 입력', exact: true }).click();
  await page.locator('#tx-amount').fill('4321');
  await page.locator('#tx-merchant').fill(merchant);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  try { await page.locator('.tx').filter({ hasText: merchant }).waitFor(); }
  catch (error) {
    await page.screenshot({ path: 'docs/release-candidate/browser/add-failure.png', fullPage: true });
    fs.writeFileSync('docs/release-candidate/browser/add-failure.json', JSON.stringify({ url: page.url(), body: await page.locator('body').innerText(), fields: await page.locator('input').evaluateAll(inputs => inputs.map(i => ({ name: i.name, value: i.value, valid: i.validity.valid, message: i.validationMessage }))), stored: await db.transaction.findMany({ where: { merchantRaw: merchant }, select: { id: true, userId: true, occurredAt: true, amount: true } }), network }, null, 2));
    throw error;
  }
}
async function main() {
  require('../db/test-target.cjs').assertTestDatabase();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  const ca = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const cb = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (process.env.SMOKE_ABORT_FONTS === '1') for (const ctx of [ca, cb]) await ctx.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  for (const ctx of [ca, cb]) ctx.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    const label = ctx === ca ? 'A' : 'B';
    const record = (event, r, extra = {}) => { if (r.url().startsWith(base)) network.push({ event, context: label, at: Date.now(), method: r.method(), url: r.url(), action: r.headers()['next-action'], ...extra }); };
    p.on('request', r => record('all-request', r));
    p.on('requestfinished', r => record('all-finished', r));
    p.on('requestfailed', r => record('all-failed', r, { error: r.failure()?.errorText }));
    p.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) network.push({ event: 'font-request', at: Date.now(), url: r.url() }); });
    p.on('requestfinished', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) network.push({ event: 'font-finished', at: Date.now(), url: r.url() }); });
    p.on('requestfailed', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) network.push({ event: 'font-failed', at: Date.now(), url: r.url(), failure: r.failure()?.errorText }); });
    p.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/transactions')) network.push({ event: 'request', at: Date.now(), url: r.url() }); });
    p.on('requestfinished', r => { if (r.method() === 'POST' && r.url().endsWith('/transactions')) network.push({ event: 'finished', at: Date.now(), url: r.url() }); });
    p.on('response', r => { if (r.request().method() === 'POST' && r.url().endsWith('/transactions')) network.push({ event: 'response', at: Date.now(), status: r.status(), url: r.url() }); });
  });
  const a = await ca.newPage(), b = await cb.newPage();
  for (const route of ['/', '/transactions', '/accounts', '/budget', '/fixed', '/notifications']) {
    await a.goto(base + route); await a.waitForURL(base + '/login');
    assert.equal(await a.locator('.shell').count(), 0);
  }
  fs.mkdirSync(screenshots, { recursive: true });
  for (const width of [320, 390, 1440]) {
    await a.setViewportSize({ width, height: 1000 });
    for (const route of ['/login', '/signup']) {
      await a.goto(base + route);
      assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width} overflow`);
    }
  }
  await a.setViewportSize({ width: 1440, height: 1000 });
  await a.screenshot({ path: `${screenshots}/signup-desktop.png`, fullPage: true });
  await b.emulateMedia({ colorScheme: 'dark' });
  await b.goto(base + '/login');
  await b.screenshot({ path: `${screenshots}/login-mobile-dark.png`, fullPage: true });
  await signup(a, 'browserA');
  const cookie = (await ca.cookies()).find(c => c.name === 'accountbook-session');
  assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Lax');
  assert.equal(await a.locator('.tx').count(), 0);
  await add(a, `privateA${stamp}`);
  await signup(b, 'browserB');
  await add(b, `privateB${stamp}`);
  assert.equal(await b.locator('.tx').filter({ hasText: `privateA${stamp}` }).count(), 0);
  await a.reload();
  assert.equal(await a.locator('.tx').filter({ hasText: `privateB${stamp}` }).count(), 0);
  const txA = await db.transaction.findFirstOrThrow({ where: { merchantRaw: `privateA${stamp}` } });
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());
  await db.transaction.update({ where: { id: txA.id }, data: { installmentMonths: 7, firstBillingMonth: month } });
  await db.transaction.create({ data: { userId: txA.userId, amount: 123, kind: 'INCOME', occurredAt: new Date(), merchantRaw: `refundA${stamp}`, merchantNorm: txA.merchantNorm, source: 'MANUAL', refundOfId: txA.id } });
  await a.goto(base + `/installments?month=${month}`);
  await a.getByText(`privateA${stamp}`, { exact: true }).first().waitFor();
  await a.goto(base + `/refunds?month=${month}`);
  await a.locator('article').filter({ hasText: txA.merchantNorm }).getByRole('button', { name: '연결 해제', exact: true }).waitFor();
  await b.goto(base + `/installments?month=${month}`);
  assert.equal(await b.getByText(`privateA${stamp}`, { exact: true }).count(), 0);
  await b.goto(base + `/refunds?month=${month}`);
  assert.equal(await b.locator('article').filter({ hasText: txA.merchantNorm }).count(), 0);
  await b.goto(base + '/transactions');
  await b.locator('.tx').filter({ hasText: `privateB${stamp}` }).click();
  await b.locator('#d-memo').fill('unauthorized-change');
  await b.locator('form').filter({ has: b.locator('#d-memo') }).locator('input[name=id]').evaluate((el, id) => el.value = id, txA.id);
  await b.getByRole('button', { name: '저장', exact: true }).click();
  await b.getByText('거래를 찾지 못했어요.', { exact: true }).waitFor();
  assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: txA.id } })).memo, null);
  await b.goto(base + `/transactions?q=privateA${stamp}`);
  assert.equal(await b.locator('.tx').count(), 0);
  await b.goto(base + '/');
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await b.screenshot({ path: `${screenshots}/account-mobile-dark.png`, fullPage: true });
  await a.getByRole('button', { name: '로그아웃', exact: true }).click();
  await a.waitForURL(base + '/login');
  const hash = crypto.createHash('sha256').update(cookie.value).digest('hex');
  assert.equal(await db.session.findUnique({ where: { tokenHash: hash } }), null);
  await ca.addCookies([cookie]);
  await a.goto(base + '/'); await a.waitForURL(base + '/login');
  await ca.clearCookies();
  await a.locator('#auth-email').fill(`browserA${stamp}@example.com`);
  await a.locator('#auth-password').fill(password + 'bad');
  await a.getByRole('button', { name: '로그인', exact: true }).click();
  await a.locator('p[role=alert]').filter({ hasText: '이메일 또는 비밀번호를 확인해 주세요.' }).waitFor();
  await a.locator('#auth-email').fill(`browserA${stamp}@example.com`);
  await a.locator('#auth-password').fill(password);
  await a.getByRole('button', { name: '로그인', exact: true }).click();
  await a.waitForURL(base + '/');
  const newCookie = (await ca.cookies()).find(c => c.name === 'accountbook-session');
  await db.session.update({ where: { tokenHash: crypto.createHash('sha256').update(newCookie.value).digest('hex') }, data: { expiresAt: new Date(0) } });
  await a.goto(base + '/transactions'); await a.waitForURL(base + '/login');
  await ca.addCookies([{ ...newCookie, value: 'f'.repeat(64) }]);
  await a.goto(base + '/budget'); await a.waitForURL(base + '/login');
  await ca.clearCookies();
  const token = crypto.randomBytes(32).toString('hex');
  const legacy = await db.user.create({ data: { name: 'claim-browser', claimTokenHash: crypto.createHash('sha256').update(token).digest('hex'), claimExpiresAt: new Date(Date.now() + 1800000) } });
  await db.transaction.create({ data: { userId: legacy.id, occurredAt: new Date(), amount: -9876, kind: 'EXPENSE', merchantRaw: 'claimed-private-record', merchantNorm: 'claimed-private-record', source: 'MANUAL' } });
  await signup(a, 'browserClaim', token);
  await a.goto(base + '/transactions');
  await a.locator('.tx').filter({ hasText: 'claimed-private-record' }).waitFor();
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: legacy.id } })).email, `browserclaim${stamp}@example.com`);
  await b.goto(base + '/transactions');
  assert.equal(await b.locator('.tx').filter({ hasText: 'claimed-private-record' }).count(), 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync('docs/release-candidate/browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), standalone: true, next: '15.5.28', port: 4428, syntheticDatabaseOnly: true, signupLoginLogout: true, ownerIsolation: true, installmentsAndRefunds: true, forgedIdBlocked: true, claim: true, secureCookie: true, browserLocalhostExceptionOnly: true, fontRequestsAborted: process.env.SMOKE_ABORT_FONTS === '1', network, pageErrors: errors }, null, 2));
  console.log('PASS: six private routes, responsive auth, signup/login/logout, secure cookie, two-user transaction isolation and forged-ID action, search isolation, revoked/expired/forged session, legacy claim UI');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); await db.$disconnect(); });
