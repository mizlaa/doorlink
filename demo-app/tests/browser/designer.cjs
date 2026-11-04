const { chromium } = require('playwright')
const OUT = process.env.SHOTS || '/tmp/doorlink-shots'
;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  let fails = 0
  for (const mobile of [false, true]) {
    const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } })
    const errs = []; page.on('pageerror', (e) => errs.push(e.message))
    const p = mobile ? 'm-' : ''
    try {
      await page.goto('http://localhost:4300/#/configure')
      await page.locator('[data-demo-scene] canvas').first().waitFor({ timeout: 60000 })
      await page.waitForFunction(() => !document.body.innerText.includes('Loading 3D view'), null, { timeout: 90000 })
      await page.locator('[data-demo-scene]:visible').getByRole('button', { name: 'Full screen', exact: true }).first().click()
      await page.waitForTimeout(4000)
      const r = await page.locator('.is-immersive').boundingBox()
      if (Math.abs(r.width - page.viewportSize().width) > 1 || Math.abs(r.height - page.viewportSize().height) > 1) throw new Error('not full screen ' + JSON.stringify(r))
      await page.screenshot({ path: `${OUT}/${p}d1-full.png` })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
      if (await page.locator('.is-immersive').count()) throw new Error('did not exit')
      if ((await page.evaluate(() => document.body.style.overflow)) === 'hidden') throw new Error('scroll locked')
      console.log('OK  ', mobile ? 'phone' : 'desktop', 'designer full screen and exit', errs.length ? errs : '')
    } catch (e) { fails++; console.log('FAIL', mobile ? 'phone' : 'desktop', e.message.split('\n')[0]); await page.screenshot({ path: `${OUT}/${p}dfail.png` }) }
    await page.close()
  }
  console.log(fails ? fails + ' FAILED' : 'DESIGNER OK')
  await browser.close()
})()
