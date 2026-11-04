const { chromium } = require('playwright')
const OUT = process.env.SHOTS || '/tmp/doorlink-shots'
const mobile = process.argv.includes('--mobile')
const BASE = process.env.XURL || 'http://localhost:4300/'
;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 760 } })
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)))
  const p = mobile ? 'm-' : ''
  let fails = 0
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name) } catch (e) { fails++; console.log('FAIL', name, e.message.split('\n')[0]); console.log('     lines:', JSON.stringify(await page.evaluate(() => window.__lines))); await page.screenshot({ path: `${OUT}/${p}ifail.png` }) } }
  await page.goto(BASE + '#/')
  await page.evaluate(() => { sessionStorage.clear(); localStorage.removeItem('doorlink:intro-seen-v1') }); await page.reload()
  await page.evaluate(() => {
    window.__lines = []; window.__overlays = []
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.intro-line .sr-only')) { const t = el.textContent; if (t && window.__lines.at(-1) !== t) window.__lines.push(t) }
      for (const c of ['intro-panel', 'intro-logo']) for (const el of document.querySelectorAll('.' + c)) { const k = c + ':' + el.querySelector('.intro-panel-title, .intro-logo-tag')?.textContent; if (!window.__overlays.includes(k)) window.__overlays.push(k) }
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  await step('scene 1 captions play as the door opens', async () => {
    await page.getByRole('button', { name: /OPEN THE DOOR/ }).click()
    await page.locator('.intro-caption.is-hero', { hasText: 'Welcome to Doorlink.' }).waitFor({ timeout: 8000 })
    await page.locator('.intro-caption.is-hero', { hasText: 'Established in 2026' }).waitFor({ timeout: 12000 })
    await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${p}i1-home.png` })
  })
  await step('portal journey keeps the caption on screen, then the tour runs', async () => {
    await page.getByRole('button', { name: 'Enter Doorlink World' }).click()
    await page.locator('.intro-caption.is-fixed').waitFor({ timeout: 4000 })
    await page.locator('.intro-caption.is-world', { hasText: 'More than just garage doors.' }).waitFor({ timeout: 120000 })
    await page.getByRole('button', { name: 'Skip intro' }).waitFor()
    await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/${p}i2-garage.png` })
    await page.locator('.intro-panel').first().waitFor({ timeout: 40000 }); await page.screenshot({ path: `${OUT}/${p}i4-market.png` })
    await page.locator('.intro-logo').waitFor({ timeout: 40000 }); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${p}i6-logo.png` })
    await page.locator('.world-caption', { hasText: 'Tap a product' }).waitFor({ timeout: 40000 })
    const lines = await page.evaluate(() => window.__lines)
    const want = ['Welcome to Doorlink.', 'One platform', 'Established in 2026', 'More than just garage doors', 'swing gates to sliding gates', 'we don’t stop there', 'roller shutters, fencing', 'connects customers', 'Design it. Visualise it', 'smarter way forward']
    const missing = want.filter((w) => !lines.some((l) => l.includes(w)))
    console.log('     lines seen:', lines.length, 'overlays:', (await page.evaluate(() => window.__overlays)).join(' | '))
    if (missing.length) throw new Error('missing captions: ' + missing.join(', '))
    const ov = (await page.evaluate(() => window.__overlays)).join('|')
    for (const w of ['Quotes for your project', 'One place for the whole project', 'Your Vision. Our Connection.']) if (!ov.includes(w)) throw new Error('missing overlay ' + w)
    if (!(await page.evaluate(() => localStorage.getItem('doorlink:intro-seen-v1') === '1'))) throw new Error('seen flag not set')
    await page.getByRole('button', { name: /Operate the garage door/ }).waitFor({ timeout: 5000 })
  })
  if (process.argv.includes('--tour-only')) { console.log(errs.join('\n')); await browser.close(); return }
  await step('returning visit: no intro on re-entry', async () => {
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
    await page.getByRole('button', { name: 'Enter Doorlink World' }).click()
    await page.waitForFunction(() => !document.querySelector('.portal-travel') && document.querySelector('.world-root canvas'), null, { timeout: 120000 })
    await page.waitForTimeout(3000)
    if (await page.locator('.intro-caption.is-world').count()) throw new Error('intro replayed')
    await page.getByRole('button', { name: /Transform my property/i }).waitFor({ timeout: 5000 })
  })
  await step('replay intro, then skip it', async () => {
    await page.getByRole('button', { name: 'Replay the introduction' }).click()
    await page.locator('.intro-caption.is-world', { hasText: 'More than just garage doors.' }).waitFor({ timeout: 20000 })
    await page.getByRole('button', { name: 'Skip intro' }).click()
    await page.locator('.world-caption', { hasText: 'Tap a product' }).waitFor({ timeout: 8000 })
    await page.waitForTimeout(1200)
    if (await page.locator('.intro-caption.is-world, .intro-panel, .intro-logo').count()) throw new Error('intro elements left behind')
  })
  console.log(errs.length ? errs.join('\n') : 'no errors')
  console.log(fails ? fails + ' FAILED' : 'INTRO OK')
  await browser.close()
})()
