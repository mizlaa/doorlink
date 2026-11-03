// Browser checks for the demo, at iPhone size by default (--desktop for 1366 px).
// Serve the build first:  python3 -m http.server 4300 --directory demo-app/dist
// then:                   node demo-app/tests/e2e-flows.cjs
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
;(async () => {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1.3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  page.on('dialog', (d) => d.accept())
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
  let failures = 0
  const step = async (name, fn) => {
    try { await fn(); console.log('OK  ', name) } catch (e) { failures++; console.log('FAIL', name, '-', e.message.split('\n')[0]); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '-')}.png`, fullPage: true }) }
  }
  const shot = (name) => page.screenshot({ path: `${OUT}/f-${name}.png`, fullPage: true })
  const go = async (route) => { await page.goto(BASE + '#' + route); await page.waitForTimeout(400) }
  const signIn = async (role) => {
    await go('/sign-in')
    await page.locator('li', { hasText: `${role}@demo.doorlink.test` }).getByRole('button', { name: 'Try it' }).click()
    await page.waitForTimeout(500)
  }
  const cheapestFor = async (name) => {
    const card = page.locator('li', { hasText: name }).filter({ has: page.getByRole('link', { name: 'Choose business' }) }).first()
    const text = await card.innerText()
    const prices = [...text.matchAll(/\$([\d,]+(?:\.\d\d)?)/g)].map((m) => Number(m[1].replace(/,/g, '')))
    return Math.max(...prices.filter((p) => p > 500))
  }
  const compare = async () => {
    await go('/configure')
    await page.waitForTimeout(1200)
    await page.getByRole('link', { name: /Get (instant|installed) quotes/ }).click()
    await page.waitForFunction(() => location.hash.startsWith('#/quote?'))
    await page.locator('input[name=postcode]').fill('2170')
    await page.getByRole('button', { name: /Compare free quotes/ }).click()
    await page.waitForFunction(() => location.hash.startsWith('#/compare/'))
    await page.waitForTimeout(500)
  }

  await go('/')
  await page.evaluate(() => localStorage.clear())
  let ref = null
  await step('customer posts a job', async () => {
    await signIn('customer')
    await go('/request-technician')
    await page.locator('input[name=title]').fill('Roller door off its track')
    await page.locator('textarea[name=message]').fill('Single roller door came off the track on the left side. Opens halfway then jams.')
    await page.locator('input[name=budgetMin]').fill('300')
    await page.locator('input[name=budgetMax]').fill('600')
    await page.locator('input[name=suburb]').fill('Liverpool')
    await page.locator('input[name=postcode]').fill('2170')
    await page.locator('input[name=name]').fill('Alex Morgan')
    await page.locator('input[name=email]').fill('customer@demo.doorlink.test')
    await page.getByRole('button', { name: 'Post job' }).click()
    await page.waitForFunction(() => location.hash.startsWith('#/request-technician/thanks'))
    ref = decodeURIComponent((await page.evaluate(() => location.hash)).split('ref=')[1])
    console.log('     job ref', ref)
  })
  await step('installer quotes on it from the job board', async () => {
    await signIn('installer')
    await go('/leads')
    const card = page.locator('li', { hasText: ref }).first()
    await card.getByText('Send a quote').click()
    await card.locator('input[name=amount]').fill('480')
    await card.locator('textarea[name=message]').fill('Re-hang the curtain, new guide and service the springs. Fixed price.')
    await card.getByRole('button', { name: /Send quote|Update quote|Submit/ }).click()
    await page.getByText('Quote sent to the customer.').waitFor()
    await shot('leads-quoted')
  })
  await step('customer accepts the installer quote', async () => {
    await signIn('customer')
    await go('/my-requests/' + ref)
    await page.getByText('Westline Door Systems').first().waitFor()
    await shot('my-request-quote')
    await page.locator('li', { hasText: 'Westline Door Systems' }).getByRole('button', { name: 'Accept this quote' }).click()
    await page.waitForFunction(() => location.hash.startsWith('#/jobs/'))
  })
  await step('installer sees it accepted and gets a notification', async () => {
    await signIn('installer')
    await go('/leads')
    await page.getByText('Accepted. This job is now in your').waitFor()
    await go('/notifications')
    await page.getByText('Your quote was accepted').waitFor()
  })
  let before = 0
  await step('customer compares quotes (baseline)', async () => {
    await signIn('customer')
    await compare()
    before = await cheapestFor('Westline Door Systems')
    console.log('     Westline before', before)
  })
  await step('admin raises Westline prices by 5%', async () => {
    await signIn('admin')
    await go('/admin/pricing?business=company_01')
    await page.getByRole('button', { name: 'Raise' }).click()
    await page.getByText(/Raised every Westline/).waitFor()
    await shot('admin-pricing')
  })
  await step('customer sees the higher price in a new comparison', async () => {
    await signIn('customer')
    await compare()
    const after = await cheapestFor('Westline Door Systems')
    console.log('     Westline after', after)
    if (!(after > before)) throw new Error(`price did not rise: ${before} -> ${after}`)
    await shot('compare-after-raise')
  })
  await step('admin suspends Westline: it drops out of quotes', async () => {
    await signIn('admin')
    await go('/admin/businesses')
    await page.locator('li', { hasText: 'Westline Door Systems' }).getByRole('button', { name: 'Suspend' }).click()
    await signIn('customer')
    await compare()
    if (await page.locator('li', { hasText: 'Westline Door Systems' }).filter({ has: page.getByRole('link', { name: 'Choose business' }) }).count()) throw new Error('still listed')
  })
  await step('supplier edits a price with the real rule form', async () => {
    await signIn('supplier')
    await go('/pricing')
    await shot('supplier-pricing')
    await page.getByRole('link', { name: 'Edit' }).first().click()
    await page.waitForFunction(() => /#\/pricing\/company_03-r/.test(location.hash))
    await page.locator('input[name=price]').fill('4321')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForFunction(() => location.hash.includes('saved=1'))
    await page.getByText('$4,321').first().waitFor()
  })
  await step('supplier creates a listing', async () => {
    await go('/my-listings/new')
    await page.locator('input[name=title]').fill('Demo test: BG-600 motor, ex-display')
    await page.locator('input[name=price]').fill('899')
    await page.getByRole('button', { name: 'Create listing' }).click()
    await page.waitForFunction(() => location.hash === '#/my-listings')
    await page.getByText('Demo test: BG-600 motor, ex-display').waitFor()
    await go('/dashboard')
    await shot('supplier-dashboard')
  })
  await step('customer messages a seller and gets a reply', async () => {
    await signIn('customer')
    await go('/marketplace/LST-3103')
    await page.getByRole('button', { name: 'Send message' }).click()
    await go('/messages')
    await page.locator('a[href*="#/messages/"]').first().click()
    await page.locator('textarea[name=body]').fill('Could I pick it up Saturday?')
    await page.getByRole('button', { name: 'Send' }).click()
    await page.getByText(/Demo auto-reply/).waitFor({ timeout: 5000 })
    await shot('messages-thread')
  })
  await step('supplier sees the enquiry', async () => {
    await signIn('supplier')
    await go('/messages')
    await page.getByText('Alex Morgan').first().waitFor()
  })
  await step('manufacturer dashboard and catalogue', async () => {
    await signIn('manufacturer')
    await go('/dashboard')
    await page.getByText('Manufacturer dashboard').waitFor()
    await shot('manufacturer-dashboard')
    await go('/admin/models')
    await page.getByText('Highlighted: your brand').waitFor()
    await go('/admin/businesses')
    await page.getByText('This area is for Doorlink staff').waitFor()
  })
  await step('admin hides a review, then resets the demo', async () => {
    await signIn('admin')
    await go('/admin/reviews')
    await page.getByRole('button', { name: 'Hide review' }).first().click()
    await page.getByRole('button', { name: 'Show again' }).first().waitFor()
    await go('/admin')
    await shot('admin-overview')
    await page.getByRole('button', { name: 'Reset demo data' }).click()
    await page.getByText('Demo data has been reset.').waitFor()
    await go('/admin/businesses')
    if (await page.locator('li', { hasText: 'Westline Door Systems' }).getByText('Suspended').count()) throw new Error('reset did not restore status')
  })
  await step('installer job board renders', async () => {
    await signIn('installer')
    await go('/leads')
    await shot('installer-leads')
  })
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors')
  console.log(failures ? `${failures} FAILED` : 'ALL FLOWS PASSED')
  process.exitCode = failures ? 1 : 0
  await browser.close()
})()
