const { chromium } = require('playwright')
const OUT = process.env.SHOTS || '/tmp/doorlink-shots'
const mobile = process.argv.includes('--mobile')
;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage(mobile ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true } : { viewport: { width: 1400, height: 860 } })
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  const p = mobile ? 'm-' : ''
  let fails = 0
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name) } catch (e) { fails++; console.log('FAIL', name, e.message.split('\n')[0]); await page.screenshot({ path: `${OUT}/${p}xfail-${name.replace(/\W+/g, '-')}.png` }) } }
  await page.goto('http://localhost:4300/#/')
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await step('no invite before opening', async () => { await page.waitForTimeout(800); if (await page.locator('.portal-invite').count()) throw new Error('invite shown early') })
  await step('open the garage, invite appears', async () => {
    await page.getByRole('button', { name: /OPEN THE DOOR/ }).click()
    await page.locator('.portal-invite').waitFor({ timeout: 15000 })
    await page.screenshot({ path: `${OUT}/${p}x1-invite.png` })
  })
  await step('activate x-ray, scene loads', async () => {
    await page.getByRole('button', { name: 'or X-ray this garage door' }).click()
    await page.locator('.xray-root canvas').waitFor({ timeout: 30000 })
    await page.waitForFunction(() => !document.querySelector('.xray-loading'), null, { timeout: 90000 })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: `${OUT}/${p}x2-overview.png` })
  })
  await step('springs station', async () => {
    await page.locator('.xray-stations').getByRole('button', { name: 'Springs' }).click()
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${OUT}/${p}x3-springs.png` })
  })
  await step('hotspot selects motor', async () => {
    await page.getByRole('button', { name: 'Reset view' }).click()
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${OUT}/${p}x3b-overview-again.png` })
    await page.getByRole('button', { name: 'Show Motor & opener' }).click({ force: true })
    await page.waitForTimeout(500)
    if (!(await page.locator('.xray-card-title', { hasText: 'Motor & opener' }).count())) throw new Error('motor card not shown')
    await page.getByRole('button', { name: 'Run the motor' }).click()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${OUT}/${p}x4-motor.png` })
  })
  await step('obstruction test reverses the door', async () => {
    await page.getByRole('button', { name: 'Safety sensor test' }).click()
    await page.locator('.xray-status', { hasText: 'Beam broken' }).waitFor({ timeout: 40000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/${p}x5-beam.png` })
    await page.locator('.xray-status', { hasText: 'reverses' }).waitFor({ timeout: 20000 })
  })
  await step('panels thermal view', async () => {
    await page.getByRole('button', { name: 'Insulated vs single skin' }).click()
    await page.waitForTimeout(7000)
    await page.screenshot({ path: `${OUT}/${p}x6-thermal.png` })
  })
  await step('pause and reset', async () => {
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.getByRole('button', { name: 'Play' }).waitFor()
    await page.getByRole('button', { name: 'Reset view' }).click()
  })
  await step('exit returns to the homepage', async () => {
    await page.getByRole('button', { name: 'Exit X-ray' }).click()
    await page.waitForTimeout(500)
    if (await page.locator('.xray-root').count()) throw new Error('still open')
    if (!(await page.getByRole('button', { name: /CLOSE THE DOOR/ }).count())) throw new Error('hero missing')
    if ((await page.evaluate(() => document.body.style.overflow)) === 'hidden') throw new Error('scroll still locked')
  })
  console.log(errs.length ? errs.join('\n') : 'no errors')
  console.log(fails ? `${fails} FAILED` : 'XRAY OK')
  await browser.close()
})()
