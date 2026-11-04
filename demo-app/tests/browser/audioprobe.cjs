const { chromium } = require('playwright')
const BASE = process.env.XURL || 'http://localhost:4300/'
;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } })
  const errs = []; page.on('pageerror', (e) => errs.push(e.message))
  await page.addInitScript(() => {
    window.__played = []; window.__rejected = []
    const real = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      const el = this
      if (!el.__hooked) { el.__hooked = true; el.addEventListener('playing', () => window.__played.push((el.currentSrc || el.src).split('/').pop().slice(0, 40))) }
      return real.call(this).catch((e) => { window.__rejected.push(e.name); throw e })
    }
  })
  await page.goto(BASE + '#/')
  await page.evaluate(() => localStorage.removeItem('doorlink:intro-seen-v1')); await page.reload()
  await page.getByRole('button', { name: /OPEN THE DOOR/ }).click()
  await page.getByRole('button', { name: 'Enter Doorlink World' }).click({ timeout: 20000 })
  await page.locator('.world-caption', { hasText: 'Tap a product' }).waitFor({ timeout: 180000 })
  const r = await page.evaluate(() => ({ played: window.__played, rejected: window.__rejected }))
  console.log('played', r.played.length, r.played.map((s) => s.startsWith('data:') ? 'data-uri' : s).join(' | '))
  console.log('rejected', r.rejected.length, r.rejected.join(','))
  console.log(errs.length ? errs.join('\n') : 'no errors')
  await browser.close()
})()
