// Renders the real 3D scenes to static images:
//   public/posters/pole.jpg, chair.jpg  (shown while 3D loads / for reduced-motion)
//   public/sequence/f-000…f-047.jpg     (low-end fallback for The Fade section)
// Usage: npm run build && npm start (port 3100) → node scripts/capture.mjs [baseUrl]
// Needs a Chromium with WebGL (software GL is fine, just slow). Set CHROMIUM_PATH if needed.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:3100';
const FRAMES = 48;
mkdirSync('public/posters', { recursive: true });
mkdirSync('public/sequence', { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`${base}/?3d=on`, { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.loaded === 'true', null, { timeout: 60000 });
await page.addStyleTag({ content: '[data-capture-hide],.grain,.scanlines,.vignette,header,nav{visibility:hidden!important} #fade, #fade *{background:none!important} #chair button{visibility:hidden!important}' });
await page.evaluate(() => { window.__fd.snap = true; });
const sleep = (ms) => page.waitForTimeout(ms);

// hero poster
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(6000);
await page.screenshot({ path: 'public/posters/pole.jpg', type: 'jpeg', quality: 78 });
console.log('pole poster');

// chair poster
await page.evaluate(() => { const el = document.querySelector('#chair [role=img]'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 40); });
await sleep(9000);
await page.locator('#chair [role=img]').screenshot({ path: 'public/posters/chair.jpg', type: 'jpeg', quality: 78 });
console.log('chair poster');

// head sequence
const geo = await page.evaluate(() => { const s = document.querySelector('#fade'); return { top: s.getBoundingClientRect().top + scrollY, h: s.offsetHeight, vh: innerHeight }; });
for (let i = 0; i < FRAMES; i++) {
  const p = i / (FRAMES - 1);
  await page.evaluate((y) => window.scrollTo(0, y), geo.top + p * (geo.h - geo.vh) + (i === 0 ? 2 : 0) - (i === FRAMES - 1 ? 2 : 0));
  await sleep(i === 0 ? 7000 : 2200);
  await page.locator('#fade [role=img]').first().screenshot({ path: `public/sequence/f-${String(i).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 72 });
  process.stdout.write(`\rframe ${i + 1}/${FRAMES}`);
}
console.log('\ndone');
await browser.close();
