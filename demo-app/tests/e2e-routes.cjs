// Browser checks for the demo, at iPhone size by default (--desktop for 1366 px).
// Serve the build first:  python3 -m http.server 4300 --directory demo-app/dist
// then:                   node demo-app/tests/e2e-routes.cjs
const fs = require('node:fs')
const os = require('node:os')
let playwright
try {
  playwright = require('playwright')
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright')
}
const { chromium } = playwright
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const OUT = process.env.OUT || fs.mkdtempSync(os.tmpdir() + '/doorlink-demo-')
const BASE = process.env.BASE || 'http://localhost:4300/'
const desktop = process.argv.includes('--desktop')
const ROUTES = ['/', '/configure', '/sign-in', '/register', '/welcome', '/quotes', '/jobs', '/businesses/company_01', '/request-technician', '/my-requests', '/marketplace', '/marketplace/LST-3100', '/manuals', '/manuals/submit', '/tools', '/tools/spring-calculator', '/find', '/find/unknown', '/compliance', '/compliance/pack', '/compliance/pack/dl-bus-001', '/search?q=westline', '/leads', '/pricing', '/pricing/quotes', '/pricing/profile', '/pricing/payments', '/pricing/business', '/dashboard', '/my-listings', '/my-listings/new', '/admin', '/admin/manufacturers', '/admin/categories', '/admin/models', '/admin/manuals', '/admin/manual-submissions', '/admin/marketplace', '/admin/businesses', '/admin/pricing', '/admin/reviews', '/admin/users', '/admin/metrics', '/admin/settings', '/account', '/messages', '/notifications', '/saved', '/support', '/support/new', '/demo']
;(async () => {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1366, height: 900 } } : { viewport: { width: 393, height: 852 }, deviceScaleFactor: 1.3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  let errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
  const results = []
  const signIn = async (role) => {
    await page.goto(BASE + '#/sign-in')
    await page.waitForTimeout(300)
    await page.locator('li', { hasText: `${role}@demo.doorlink.test` }).getByRole('button', { name: 'Try it' }).click()
    await page.waitForTimeout(500)
  }
  for (const role of ['guest', 'customer', 'installer', 'supplier', 'manufacturer', 'admin']) {
    await page.goto(BASE + '#/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    if (role !== 'guest') await signIn(role)
    for (const route of ROUTES) {
      errs = []
      await page.goto(BASE + '#' + route)
      await page.waitForTimeout(route === '/configure' || route === '/' ? 1500 : 350)
      const text = await page.locator('main').innerText().catch(() => '')
      const notFound = /Page not found|This page could not be found|couldn.t find/i.test(text)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const h1 = (await page.locator('main h1').first().innerText().catch(() => '')).slice(0, 50)
      const bad = errs.filter((e) => !/Failed to load resource/.test(e))
      if (notFound || bad.length || overflow > 2) results.push(`${role} ${route}: ${notFound ? 'NOT FOUND ' : ''}${overflow > 2 ? 'OVERFLOW ' + overflow + ' ' : ''}${bad.join(' | ')}`)
      if (process.argv.includes('--shots')) await page.screenshot({ path: `${OUT}/${desktop ? 'd-' : ''}${role}${route.replace(/[\/?=]+/g, '_')}.png`, fullPage: true })
      if (process.argv.includes('--h1')) console.log(role.padEnd(12), route.padEnd(28), h1)
    }
  }
  console.log(results.length ? results.join('\n') : 'ALL ROUTES CLEAN')
  process.exitCode = results.length ? 1 : 0
  await browser.close()
})()
