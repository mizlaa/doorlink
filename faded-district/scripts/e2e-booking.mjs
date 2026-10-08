// Smoke test for the booking flow. Usage: node scripts/e2e-booking.mjs [baseUrl]
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:3100';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}/?3d=off`);
await page.waitForFunction(() => document.documentElement.dataset.loaded === 'true', null, { timeout: 30000 });
await page.getByRole('button', { name: 'Book', exact: true }).first().click();
const dlg = page.getByRole('dialog', { name: 'Book a chair' });
await dlg.waitFor();
// step 1: keyboard-select the first service via arrow keys then continue with Enter
await dlg.getByLabel(/Skin Fade/).check({ force: true });
await page.keyboard.press('Enter');
await dlg.getByLabel(/Anyone available/).check({ force: true });
await dlg.getByRole('button', { name: 'Continue' }).click();
// step 3: first enabled time
const t = dlg.locator('input[name=time]:not([disabled])').first();
await t.check({ force: true });
await dlg.getByRole('button', { name: 'Continue' }).click();
// step 4 validation
await dlg.getByRole('button', { name: 'Create request' }).click();
console.log('validation shown:', await dlg.getByText('Please enter your name.').waitFor({ timeout: 2000 }).then(() => true, () => false));
await dlg.getByLabel('Name').fill('Sam');
await dlg.getByLabel('Mobile number').fill('0412 345 678');
await dlg.getByRole('button', { name: 'Create request' }).click();
const href = await dlg.getByRole('link', { name: 'Open Messages' }).getAttribute('href');
console.log('sms href:', decodeURIComponent(href));
console.log('tel link present:', await dlg.getByRole('link', { name: 'Call instead' }).getAttribute('href'));
await page.keyboard.press('Escape');
console.log('closed on Esc:', !(await dlg.isVisible().catch(() => false)));
// /book page with prefill
await page.goto(`${base}/book?service=kids-cut`);
console.log('prefill → step:', await page.getByText(/Step 2 \/ 4/).isVisible());
console.log(errs.length ? 'ERRORS: ' + errs.join('\n') : 'no page errors');
await browser.close();
