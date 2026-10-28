// End-to-end check of automated quoting in a real browser against a running
// dev server and a scratch database that has been seeded (npm run db:seed).
//
//   npm run dev            # in one terminal
//   node scripts/e2e/quoting.mjs
//
// Stripe is not connected in development, so the script gives the demo
// trade accounts an ACTIVE subscription row directly. Everything else goes
// through the UI. Needs Playwright and Chromium installed (globally is fine).
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const req = createRequire(import.meta.url)
let pw
try { pw = req('playwright') } catch { pw = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'))('playwright') }
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
const SHOTS = process.env.SHOTS || ''
let passed = 0
const failures = []
const step = async (name, fn) => { try { await fn(); passed++; console.log('ok  ', name) } catch (e) { failures.push(name); console.log('FAIL', name, '\n    ', e.message.replace(/\s+/g, ' ').slice(0, 900)) } }

const as = async (email, width = 1280) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  if (email) await ctx.addCookies([{ name: 'doorlink-dev-session', value: email, url: BASE }])
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  return page
}
const go = async (page, url) => { const r = await page.goto(BASE + url); await page.waitForLoadState('networkidle'); return r }
const bodyText = (page) => page.locator('body').innerText()

// ---- fixtures: subscriptions (no payment provider in dev) and a clean slate for these accounts
const TECH = 'technician@demo.doorlink', SUPPLIER = 'supplier@demo.doorlink', CUSTOMER = 'customer@demo.doorlink', ADMIN = 'admin@demo.doorlink', MANUF = 'manufacturer@demo.doorlink'
const users = Object.fromEntries((await prisma.user.findMany({ where: { email: { in: [TECH, SUPPLIER, CUSTOMER, ADMIN, MANUF] } } })).map((u) => [u.email, u]))
assert.ok(users[TECH] && users[SUPPLIER] && users[CUSTOMER], 'run npm run db:seed first')
const plan = await prisma.subscriptionPlan.upsert({ where: { code: 'e2e-trade' }, update: {}, create: { code: 'e2e-trade', name: 'E2E trade (test fixture)', interval: 'MONTH', priceCents: 999, isActive: false } })
for (const email of [TECH, SUPPLIER]) {
  await prisma.subscription.deleteMany({ where: { userId: users[email].id, planId: plan.id } })
  await prisma.subscription.create({ data: { userId: users[email].id, planId: plan.id, status: 'ACTIVE' } })
}
await prisma.quoteRequest.deleteMany({ where: { customerId: { in: Object.values(users).map((u) => u.id) } } })
const techOrgs = await prisma.organizationMember.findMany({ where: { userId: users[TECH].id } })
await prisma.organization.deleteMany({ where: { id: { in: techOrgs.map((m) => m.organizationId) } } })
await prisma.pricingRule.deleteMany({ where: { organizationId: 'demo-supplier-org' } })
await prisma.companyProfile.deleteMany({ where: { organizationId: 'demo-supplier-org' } })

async function addRule(page, r) {
  await go(page, '/pricing/rules/new')
  await page.selectOption('#category', r.category)
  if (r.brand) await page.fill('#brand', r.brand)
  for (const k of ['widthMinMm', 'widthMaxMm', 'heightMinMm', 'heightMaxMm']) await page.fill(`#${k}`, String(r[k]))
  if (r.motor === 'none') await page.selectOption('#motorIncluded', 'no')
  else if (r.motor) {
    const tag = await page.locator('#motorBrand').evaluate((el) => el.tagName)
    if (tag === 'SELECT') await page.selectOption('#motorBrand', r.motor)
    else await page.fill('#motorBrand', r.motor)
  }
  await page.selectOption('#installation', r.installation ?? 'INCLUDED')
  if (r.installPrice) await page.fill('#installPrice', r.installPrice)
  await page.fill('#price', r.price)
  await page.selectOption('#gst', r.gst)
  await page.getByRole('button', { name: /^(Add this price|Save changes)$/ }).click()
  await Promise.race([page.waitForURL(/saved=rule/), page.locator('main [role=alert], form [role=alert]').first().waitFor()])
  await page.waitForLoadState('networkidle')
}
async function enableQuoting(page, about) {
  await go(page, '/pricing')
  await page.fill('#about', about)
  await page.fill('#serviceArea', 'Brisbane metro')
  await page.check('input[name=quotingEnabled]')
  await page.click('form:has(input[name=quotingEnabled]) button[type=submit]')
  await page.getByText('Saved.').waitFor()
}

let tech, supplier, customer
await step('a technician sets up a business and adds the client example price', async () => {
  tech = await as(TECH)
  await go(tech, '/pricing')
  assert.match(await bodyText(tech), /Set up your business|set yours up/i)
  await tech.fill('#name', 'Demo Door Services')
  await tech.getByRole('button', { name: 'Set up my business' }).click()
  await tech.getByRole('heading', { name: 'Your prices' }).waitFor()
  await addRule(tech, { category: 'GARAGE_DOOR', brand: 'DoorWorks', widthMinMm: '2300', widthMaxMm: '2500', heightMinMm: '2300', heightMaxMm: '2500', price: '3000', gst: 'EXCLUSIVE' })
  assert.match(tech.url(), /\/pricing\?saved=rule/)
  const t = await bodyText(tech)
  assert.match(t, /DoorWorks · \$3,000\.00 \+ GST/)
  assert.match(t, /2,300–2,500 mm/)
})
await step('an overlapping range for the same brand and motor is refused with a reason', async () => {
  await addRule(tech, { category: 'GARAGE_DOOR', brand: 'doorworks', widthMinMm: '2500', widthMaxMm: '2700', heightMinMm: '2300', heightMaxMm: '2500', price: '3500', gst: 'EXCLUSIVE' })
  assert.match(tech.url(), /\/pricing\/rules\/new/)
  assert.match(await bodyText(tech), /overlaps another active garage door price/)
})
await step('invalid ranges and a missing price are explained next to the fields', async () => {
  await addRule(tech, { category: 'GARAGE_DOOR', brand: 'Gliderol', widthMinMm: '2600', widthMaxMm: '2500', heightMinMm: 'abc', heightMaxMm: '2500', price: '', gst: 'EXCLUSIVE' })
  const t = await bodyText(tech)
  assert.match(t, /smallest width must not be more than the largest/)
  assert.match(t, /height range in whole millimetres/)
  assert.match(t, /price above \$0/)
})
await step('a gate price only accepts the listed gate motors', async () => {
  await go(tech, '/pricing/rules/new')
  await tech.selectOption('#category', 'SLIDING_GATE')
  const opts = await tech.locator('#motorBrand option').allInnerTexts()
  assert.deepEqual(opts.slice(1), ['Beninca', 'BFT', 'FAAC', 'Merlin', 'Grifo', 'Nice V8'])
  await tech.selectOption('#category', 'WINDOW_SHUTTER')
  assert.deepEqual((await tech.locator('#motorBrand option').allInnerTexts()).slice(1), ['CWB', 'Maximum', 'Somfy', 'Simu', 'Nice'])
  await tech.selectOption('#category', 'FENCE')
  assert.match(await bodyText(tech), /Fences do not take a motor/)
  await addRule(tech, { category: 'SLIDING_GATE', widthMinMm: '3000', widthMaxMm: '5000', heightMinMm: '1200', heightMaxMm: '2000', motor: 'BFT', installation: 'EXTRA', installPrice: '450', price: '4200', gst: 'EXCLUSIVE' })
  assert.match(await bodyText(tech), /Motor included \(BFT\) · Installation at extra cost \(\$450\.00\)/)
  await enableQuoting(tech, 'Garage doors and gates, supplied and fitted.')
  assert.match(await bodyText(tech), /Quoting customers/i)
})
await step('a second business sets its own prices (GST included) without seeing the first', async () => {
  supplier = await as(SUPPLIER)
  await go(supplier, '/pricing')
  const t = await bodyText(supplier)
  assert.match(t, /Demo Door Supplies/i)
  assert.doesNotMatch(t, /3,000\.00|BFT|Demo Door Services/)
  await addRule(supplier, { category: 'GARAGE_DOOR', brand: 'Gliderol', widthMinMm: '2300', widthMaxMm: '2500', heightMinMm: '2300', heightMaxMm: '2500', price: '3100', gst: 'INCLUSIVE' })
  await addRule(supplier, { category: 'WINDOW_SHUTTER', widthMinMm: '600', widthMaxMm: '1800', heightMinMm: '600', heightMaxMm: '2000', motor: 'Somfy', price: '890', gst: 'EXCLUSIVE' })
  await enableQuoting(supplier, 'Shutters and doors.')
})
await step("a business cannot open another business's price by URL", async () => {
  const techRule = await prisma.pricingRule.findFirst({ where: { organization: { members: { some: { userId: users[TECH].id } } } } })
  const r = await go(supplier, `/pricing/rules/${techRule.id}/edit`)
  assert.equal(r.status(), 404)
  assert.doesNotMatch(await bodyText(supplier), /3000\.00/)
})
await step('customers, platform admins and manufacturers without a subscription cannot manage pricing', async () => {
  const c = await as(CUSTOMER)
  await go(c, '/pricing')
  assert.match(await bodyText(c), /Automated pricing is for trade accounts/)
  const a = await as(ADMIN)
  await go(a, '/pricing')
  assert.match(await bodyText(a), /Automated pricing is for trade accounts/)
  const m = await as(MANUF)
  await go(m, '/pricing')
  assert.match(await bodyText(m), /Trade subscription required/)
  await go(a, '/pricing/rules/new')
  assert.doesNotMatch(await bodyText(a), /Add this price/)
})
let doorQuoteUrl
await step('customer designs a door in the 3D designer and gets quotes from both companies', async () => {
  customer = await as(CUSTOMER)
  await go(customer, '/configure')
  await customer.fill('#widthMm', '2400')
  await customer.fill('#heightMm', '2400')
  await customer.getByRole('link', { name: 'Get instant quotes' }).click()
  await customer.waitForURL(/\/quote\?category=garage-door/)
  await customer.waitForLoadState('networkidle')
  assert.equal(await customer.inputValue('#widthMm'), '2400')
  assert.match(await bodyText(customer), /Your door from the 3D designer/)
  assert.match(await bodyText(customer), /No reviews yet/)
  await customer.check('input[name=company] >> nth=0')
  await customer.check('input[name=company] >> nth=1')
  await customer.click('button:has-text("Get my quotes")')
  await customer.waitForURL(/\/quotes\//)
  doorQuoteUrl = new URL(customer.url()).pathname
  const t = await bodyText(customer)
  assert.match(t, /\$3,300\.00/)
  assert.match(t, /Price \(ex GST\)\s+\$3,000\.00/)
  assert.match(t, /GST \(10%\) added\s+\$300\.00/)
  assert.match(t, /\$3,100\.00/)
  assert.match(t, /GST \(10%\) included\s+\$281\.82/)
  assert.match(t, /Total ex GST\s+\$2,818\.18/)
  assert.match(t, /Installation\s+Included in the price/)
  assert.match(t, /Demo Door Services/)
  assert.match(t, /Demo Door Supplies/)
  if (SHOTS) await customer.screenshot({ path: `${SHOTS}/quote-door.png`, fullPage: true })
})
await step('boundary sizes quote and one millimetre over does not, with no invented price', async () => {
  for (const [w, h, ok] of [['2300', '2500', true], ['2501', '2400', false]]) {
    await go(customer, '/quote?category=garage-door')
    await customer.fill('#widthMm', w)
    await customer.fill('#heightMm', h)
    await customer.selectOption('#brand', 'DoorWorks')
    await customer.check('input[name=company] >> nth=0')
    await customer.click('button:has-text("Get my quotes")')
    await customer.waitForURL(/\/quotes\//)
    const t = await bodyText(customer)
    if (ok) assert.match(t, /\$3,300\.00/)
    else { assert.match(t, /are outside the sizes this company prices automatically/); assert.doesNotMatch(t, /\$\d/) }
  }
})
await step('gate with a motor the company has not priced is unavailable; the priced motor quotes with installation extra', async () => {
  for (const [motor, expect] of [['FAAC', /no automated price with a FAAC motor/], ['BFT', /\$5,115\.00/]]) {
    await go(customer, '/quote?category=sliding-gate')
    await customer.fill('#widthMm', '4000')
    await customer.fill('#heightMm', '1800')
    await customer.locator('label', { hasText: new RegExp(`^${motor}$`) }).click()
    await customer.locator('label', { hasText: 'Demo Door Services' }).locator('input[name=company]').check()
    await customer.click('button:has-text("Get my quotes")')
    await customer.waitForURL(/\/quotes\//)
    assert.match(await bodyText(customer), expect)
  }
  assert.match(await bodyText(customer), /Installation \(ex GST\)\s+\$450\.00/)
})
await step('window shutter options show the five shutter motors; fences show no motor', async () => {
  await go(customer, '/quote?category=window-shutter')
  const t = await bodyText(customer)
  for (const m of ['CWB', 'Maximum', 'Somfy', 'Simu', 'Nice']) assert.match(t, new RegExp(`\\b${m}\\b`))
  await go(customer, '/quote?category=fence')
  assert.doesNotMatch(await bodyText(customer), /Motor, any brand/)
  assert.match(await bodyText(customer), /No participating company offers automated quotes for fences yet/)
})
await step('invalid measurements are explained and nothing is saved', async () => {
  const before = await prisma.quoteRequest.count({ where: { customerId: users[CUSTOMER].id } })
  await go(customer, '/quote?category=garage-door')
  await customer.fill('#widthMm', 'wide')
  await customer.fill('#heightMm', '0')
  await customer.check('input[name=company] >> nth=0')
  await customer.click('button:has-text("Get my quotes")')
  await customer.getByText(/opening width in whole millimetres/).waitFor()
  assert.match(await bodyText(customer), /opening height in whole millimetres/)
  assert.equal(await prisma.quoteRequest.count({ where: { customerId: users[CUSTOMER].id } }), before)
})
await step('each company sees only its own quote on a shared request, without contact details unless shared', async () => {
  await go(tech, doorQuoteUrl)
  const t = await bodyText(tech)
  assert.match(t, /You are seeing your own quote only/)
  assert.match(t, /did not share their contact details/)
  assert.match(t, /\$3,300\.00/)
  assert.doesNotMatch(t, /3,100\.00|Demo Door Supplies/)
  await go(supplier, doorQuoteUrl)
  assert.doesNotMatch(await bodyText(supplier), /3,300\.00|Demo Door Services/)
  const admin = await as(ADMIN)
  assert.equal((await go(admin, doorQuoteUrl)).status(), 404)
  const anon = await as(null)
  await go(anon, doorQuoteUrl)
  assert.match(anon.url(), /\/sign-in/)
})
await step('company profiles show genuine data and say when ratings are missing', async () => {
  const org = await prisma.organization.findFirst({ where: { name: 'Demo Door Services' } })
  await go(customer, `/companies/${org.id}`)
  const t = await bodyText(customer)
  assert.match(t, /Garage doors and gates, supplied and fitted/)
  assert.match(t, /No reviews yet/)
  assert.match(t, /Phone\s+Not provided/)
  const job = await prisma.job.create({ data: { reference: `DL-JOB-E2E${Date.now()}`, description: 'E2E fixture: completed job', customerId: users[CUSTOMER].id, workerId: users[TECH].id, status: 'COMPLETED' } })
  await prisma.workerReview.create({ data: { jobId: job.id, authorId: users[CUSTOMER].id, workerId: users[TECH].id, rating: 5, body: 'Fitted on time.' } })
  await go(customer, `/companies/${org.id}`)
  assert.match(await bodyText(customer), /5\.0\s*\(1 review\)/)
  assert.match(await bodyText(customer), /Fitted on time\./)
  await prisma.job.delete({ where: { id: job.id } })
  assert.equal((await go(customer, '/companies/not-a-company')).status(), 404)
})
await step('a signed-out visitor can design but must sign in to get quotes', async () => {
  const anon = await as(null)
  await go(anon, '/quote?category=swing-gate')
  assert.match(await bodyText(anon), /Sign in to get quotes/)
  assert.equal(await anon.locator('button:has-text("Get my quotes")').count(), 0)
})
await step('the customer quote list and the business quote list both show the quotes', async () => {
  await go(customer, '/quotes')
  assert.match(await bodyText(customer), /From \$3,100\.00 inc GST/)
  await go(tech, '/pricing')
  assert.match(await bodyText(tech), /Quotes you have given[\s\S]*Garage door, 2400 × 2400 mm/)
})
await step('existing pages still load without errors and no page uses the prohibited word', async () => {
  const p = await as(CUSTOMER)
  for (const url of ['/', '/configure', '/find', '/manuals', '/tools', '/marketplace', '/request-technician', '/quote', '/quotes', '/account', '/my-requests', '/saved']) {
    const r = await go(p, url)
    assert.equal(r.status(), 200, url)
    assert.doesNotMatch((await bodyText(p)).toLowerCase(), /security/, url)
  }
  for (const url of ['/pricing', '/pricing/rules/new']) { await go(tech, url); assert.doesNotMatch((await bodyText(tech)).toLowerCase(), /security/, url) }
  assert.deepEqual(p.errors, [])
})
await step('no sideways scrolling on a phone', async () => {
  for (const url of ['/quote?category=sliding-gate', doorQuoteUrl, '/pricing']) {
    const p = await as(url === '/pricing' ? TECH : CUSTOMER, 390)
    await go(p, url)
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert.ok(over <= 0, `${url} overflows by ${over}px`)
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/phone-${url.split('?')[0].replace(/\W+/g, '_')}.png`, fullPage: true })
  }
})

await browser.close()
await prisma.$disconnect()
console.log(`${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
