// Usage: node scripts/tour.mjs <outDir> <width> <height> <url> "<sel>:<waitMs>" ...
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [dir, w, h, url, ...stops] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const mobile = +w < 600;
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text().slice(0, 250)); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.loaded === 'true', null, { timeout: 40000 }).catch(() => errs.push('preloader never finished'));
for (const s of stops) {
  const [sel, wait = '2500', off = '0'] = s.split(':');
  if (/^\d+$/.test(sel)) await page.evaluate((y) => window.scrollTo(0, +y), sel);
  else await page.evaluate(([q, o]) => { const el = document.querySelector(q); if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY + +o); }, [sel, off]);
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: `${dir}/${sel.replace(/[^a-z0-9]/gi, '_')}.png` });
}
console.log(errs.join('\n') || 'no console errors');
await browser.close();
