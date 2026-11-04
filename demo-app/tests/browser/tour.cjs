const { chromium } = require('playwright')
const OUT = process.env.SHOTS || '/tmp/doorlink-shots'
const BASE = process.env.XURL || 'http://localhost:4300/'
;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } })
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)))
  let fails = 0
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name) } catch (e) { fails++; console.log('FAIL', name, e.message.split('\n')[0]); await page.screenshot({ path: `${OUT}/tfail-${name.replace(/\W+/g, '-').slice(0, 30)}.png` }) } }
  const idx = async () => parseInt((await page.locator('.intro-caption.is-world .intro-count').innerText()).slice(0, 2), 10)
  const waitIdx = (n, timeout = 6000) => page.waitForFunction((n) => { const el = document.querySelector('.intro-caption.is-world .intro-count'); return el && parseInt(el.textContent.slice(0, 2), 10) === n }, n, { timeout })
  const gpu = () => page.evaluate(() => ({ programs: window.__doorlinkGL.info.programs.length, textures: window.__doorlinkGL.info.memory.textures }))
  const next = () => page.getByRole('button', { name: /Next scene|Finish introduction/ }).click()
  const prev = () => page.getByRole('button', { name: 'Previous scene' }).click()
  const pause = async () => { const b = page.getByRole('button', { name: 'Pause introduction' }); if (await b.count()) await b.click() }
  const resume = async () => { const b = page.getByRole('button', { name: 'Resume introduction' }); if (await b.count()) await b.click() }
  const goTo = async (n) => { let i = await idx(); while (i !== n) { const up = i < n; await (up ? next() : prev()); i += up ? 1 : -1; await waitIdx(i) } }
  const secs = () => page.locator('.tour-timer-text').innerText().then((t) => parseInt(t, 10))
  await page.goto(BASE + '?perf=1#/')
  await page.evaluate(() => { sessionStorage.clear(); localStorage.removeItem('doorlink:intro-seen-v1') }); await page.reload()
  await page.getByRole('button', { name: /OPEN THE DOOR/ }).click()
  await page.getByRole('button', { name: 'Enter Doorlink World' }).click({ timeout: 20000 })
  let base
  await step('tour starts: label, countdown ring and arrows', async () => {
    await page.locator('.intro-caption.is-world').waitFor({ timeout: 120000 })
    await pause()
    await page.locator('.tour-timer-text').waitFor()
    const label = (await page.locator('.intro-caption.is-world .intro-kicker').innerText()).replace(/\s+/g, ' ')
    console.log('     label:', label)
    if (!/0[2-8] \/ 08 — /.test(label)) throw new Error('bad label ' + label)
    base = await gpu(); console.log('     gpu after arrival', JSON.stringify(base))
  })
  await step('pause holds the countdown; resume runs it down', async () => {
    await page.waitForTimeout(800); const a = await secs(); await page.waitForTimeout(2500); const b = await secs()
    if (a !== b) throw new Error(`moved while paused ${a} -> ${b}`)
    await resume(); await page.waitForTimeout(2600); const c = await secs()
    console.log('     paused', a, b, '-> running', c, 'scene', await idx())
    if (!(c < b) && (await idx()) === 2) throw new Error('countdown did not run')
    await pause()
    if (!(await page.getByRole('button', { name: 'Resume introduction' }).count())) throw new Error('not paused')
  })
  await step('garage -> gate', async () => { await goTo(2); await next(); await waitIdx(3); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/t-gate.png` }) })
  await step('rapid Next x3 lands exactly three scenes on, one caption', async () => {
    const i = await idx(); await next(); await next(); await next(); await waitIdx(i + 3)
    if ((await page.locator('.intro-caption.is-world').count()) !== 1) throw new Error('duplicate captions')
    await page.locator('.intro-panel', { hasText: 'Quotes for your project' }).waitFor({ timeout: 4000 })
  })
  await step('Previous twice during a transition', async () => {
    const i = await idx(); await prev(); await page.waitForTimeout(120); await prev(); await waitIdx(i - 2)
    if (await page.locator('.intro-panel').count()) throw new Error('overlay left over')
  })
  await step('fence -> roller shutters: no shader compiles or texture uploads', async () => {
    await goTo(4); await page.waitForTimeout(2000); await next(); await waitIdx(5); await page.waitForTimeout(3000)
    await page.screenshot({ path: `${OUT}/t-shutters.png` })
    const g = await gpu(); console.log('     gpu', JSON.stringify(g))
    if (g.programs > base.programs || g.textures > base.textures) throw new Error('GPU resources created during the transition')
  })
  await step('roller shutters -> fence', async () => { await prev(); await waitIdx(4); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/t-fence.png` }) })
  await step('still paused after manual navigation; countdown reaching zero then advances', async () => {
    if (!(await page.getByRole('button', { name: 'Resume introduction' }).count())) throw new Error('navigation unpaused the tour')
    await resume(); await waitIdx(5, 20000); await pause()
  })
  await step('resize desktop -> phone -> desktop mid-tour', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(2000)
    await page.screenshot({ path: `${OUT}/t-phone.png` })
    await page.setViewportSize({ width: 1280, height: 760 }); await page.waitForTimeout(1000)
    if ((await page.locator('.intro-caption.is-world').count()) !== 1) throw new Error('caption lost on resize')
  })
  await step('last scene shows Finish, then completes without looping', async () => {
    await goTo(8)
    await page.waitForTimeout(500)
    if ((await page.locator('.tour-timer-label').innerText()).toLowerCase() !== 'finish') throw new Error('no finish indication')
    await page.getByRole('button', { name: 'Finish introduction' }).click()
    await page.locator('.world-caption', { hasText: 'Tap a product' }).waitFor({ timeout: 5000 })
    await page.waitForTimeout(1500)
    if (await page.locator('.tour-timer, .tour-nav, .intro-caption.is-world').count()) throw new Error('tour controls left behind')
  })
  await step('whole tour created no new shaders', async () => { const g = await gpu(); console.log('     gpu end', JSON.stringify(g)); if (g.programs > base.programs) throw new Error('shaders compiled during the tour') })
  await step('replay, then skip midway', async () => {
    await page.getByRole('button', { name: 'Replay the introduction' }).click()
    await page.locator('.tour-nav').waitFor({ timeout: 15000 }); await pause(); const r = await idx(); if (r > 3) throw new Error('replay did not restart'); await next(); await waitIdx(r + 1)
    await page.getByRole('button', { name: 'Skip intro' }).click()
    await page.locator('.world-caption', { hasText: 'Tap a product' }).waitFor({ timeout: 5000 })
    await page.waitForTimeout(3000)
    if (await page.locator('.tour-timer, .intro-caption.is-world').count()) throw new Error('tour still running after skip')
    await page.getByRole('button', { name: /Operate the garage door/ }).waitFor({ timeout: 5000 })
  })
  console.log(errs.length ? errs.join('\n') : 'no errors')
  console.log(fails ? fails + ' FAILED' : 'TOUR OK')
  await browser.close()
})()
