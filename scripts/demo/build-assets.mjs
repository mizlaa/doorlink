// Builds the bundled demo images in public/demo/. Run: npm run demo:assets
// SVGs are written directly. The AI samples are PNGs rendered from the same
// SVG art through a local Chromium (set CHROMIUM_PATH if it is not on the default path).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = (p) => path.join(root, 'public', p)

const svg = (w, h, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function logo(name, color, initials) {
  return svg(
    200, 200,
    `<rect width="200" height="200" rx="28" fill="${color}"/>` +
      `<text x="100" y="122" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="78" font-weight="700" fill="#fff">${esc(initials)}</text>` +
      `<text x="100" y="180" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#ffffffcc">DEMO LOGO</text>`
  )
}

// A house facade with an opening filled by the product. `product(x, y, w, h)` returns SVG.
function facade(product, { sky = '#cfe3ee', wall = '#e9e2d6', trim = '#8a8f96' } = {}) {
  return (
    `<rect width="800" height="600" fill="${sky}"/>` +
    `<rect y="470" width="800" height="130" fill="#b9b3a7"/>` +
    `<rect x="60" y="150" width="680" height="330" fill="${wall}"/>` +
    `<polygon points="40,160 400,60 760,160" fill="#6d6259"/>` +
    product(150, 210, 500, 270) +
    `<rect x="60" y="150" width="680" height="10" fill="${trim}"/>`
  )
}

function sectional(x, y, w, h, color = '#3b4a57', panels = 6) {
  let inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`
  for (let i = 1; i < panels; i++) {
    const py = y + (h / panels) * i
    inner += `<line x1="${x}" y1="${py}" x2="${x + w}" y2="${py}" stroke="#00000044" stroke-width="3"/>`
  }
  inner += `<rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h / panels - 28}" fill="#ffffff22"/>`
  inner += `<rect x="${x + w / 2 - 40}" y="${y + h - 26}" width="80" height="8" rx="4" fill="#d9d9d9"/>`
  return inner
}

function slatGate(x, y, w, h, color = '#55606b') {
  let inner = `<rect x="${x - 14}" y="${y - 10}" width="14" height="${h + 20}" fill="#444"/>`
  inner += `<rect x="${x + w}" y="${y - 10}" width="14" height="${h + 20}" fill="#444"/>`
  for (let i = 0; i < Math.floor(w / 18); i++) {
    inner += `<rect x="${x + i * 18}" y="${y}" width="10" height="${h}" fill="${color}"/>`
  }
  return inner
}

function swingGate(x, y, w, h, color = '#2f3b46') {
  const half = w / 2 - 4
  let inner = ''
  for (const leafX of [x, x + half + 8]) {
    inner += `<rect x="${leafX}" y="${y}" width="${half}" height="${h}" fill="none" stroke="${color}" stroke-width="10"/>`
    for (let i = 1; i < 6; i++) {
      inner += `<line x1="${leafX}" y1="${y + (h / 6) * i}" x2="${leafX + half}" y2="${y + (h / 6) * i}" stroke="${color}" stroke-width="5"/>`
    }
  }
  return inner
}

function pedestrianGate(x, y, w, h, color = '#7c8691') {
  let inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="12"/>`
  for (let i = 1; i < 8; i++) inner += `<line x1="${x + (w / 8) * i}" y1="${y}" x2="${x + (w / 8) * i}" y2="${y + h}" stroke="${color}" stroke-width="4"/>`
  inner += `<circle cx="${x + w - 26}" cy="${y + h / 2}" r="7" fill="#d9c27a"/>`
  return inner
}

function windowShutter(x, y, w, h, color = '#4f6b52') {
  let inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dfeaf2"/>`
  for (const sx of [x - 70, x + w + 10]) {
    inner += `<rect x="${sx}" y="${y}" width="60" height="${h}" fill="${color}"/>`
    for (let i = 1; i < 10; i++) inner += `<line x1="${sx}" y1="${y + (h / 10) * i}" x2="${sx + 60}" y2="${y + (h / 10) * i}" stroke="#00000033" stroke-width="3"/>`
  }
  return inner
}

function rollerShutter(x, y, w, h, color = '#8c7f6d', closedFraction = 1) {
  let inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2a2f35"/>`
  const slatH = 12
  const drop = h * closedFraction
  for (let sy = y; sy < y + drop; sy += slatH) inner += `<rect x="${x}" y="${sy}" width="${w}" height="${slatH - 2}" fill="${color}"/>`
  inner += `<rect x="${x}" y="${y + drop}" width="${w}" height="${h - drop}" fill="#2a2f35"/>`
  return inner
}

function fence(x, y, w, h, color = '#6d7a86') {
  let inner = ''
  for (let i = 0; i < Math.floor(w / 26); i++) inner += `<rect x="${x + i * 26}" y="${y}" width="22" height="${h}" fill="${color}"/>`
  inner += `<rect x="${x}" y="${y + h * 0.2}" width="${w}" height="8" fill="#3d4650"/>`
  return inner
}

const sets = {
  logos: {
    'harbourline-doors': ['#1f4e79', 'HD'],
    'parramatta-gate-works': ['#5a3d2b', 'PG'],
    'westbrook-roller-co': ['#2d6a4f', 'WR'],
    'ridgeline-shutter-studio': ['#6b4f8a', 'RS'],
    'blue-mountain-automation': ['#1d4e89', 'BM'],
    'coastal-crest-garage-doors': ['#0f766e', 'CC'],
    'kingsford-gate-and-fence': ['#8a4b2a', 'KG'],
  },
  portfolio: {
    'sectional-timber-look': svg(800, 600, facade((x, y, w, h) => sectional(x, y, w, h, '#9a6b43'))),
    'sectional-charcoal': svg(800, 600, facade((x, y, w, h) => sectional(x, y, w, h, '#3b4a57', 5))),
    'sliding-gate-slat': svg(800, 600, facade((x, y, w, h) => slatGate(x, y + 40, w, h - 80, '#55606b'))),
    'swing-gate-steel': svg(800, 600, facade((x, y, w, h) => swingGate(x, y + 40, w, h - 80))),
    'pedestrian-gate-aluminium': svg(800, 600, facade((x, y, w, h) => pedestrianGate(x + 120, y + 30, 260, h - 60))),
    'window-shutter-plantation': svg(800, 600, facade((x, y, w, h) => windowShutter(x, y, w, h, '#f1efe9'))),
    'window-shutter-roller': svg(800, 600, facade((x, y, w, h) => windowShutter(x, y, w, h, '#4f6b52'))),
    'shop-shutter-roller': svg(800, 600, facade((x, y, w, h) => rollerShutter(x, y, w, h, '#8c7f6d', 0.55))),
    'fence-slat-privacy': svg(800, 600, `<rect width="800" height="600" fill="#cfe3ee"/><rect y="470" width="800" height="130" fill="#b9b3a7"/>` + fence(60, 180, 680, 290)),
  },
  reviews: {
    'review-photo-1': svg(800, 600, facade((x, y, w, h) => sectional(x, y, w, h, '#2f5d62', 4))),
    'review-photo-2': svg(800, 600, facade((x, y, w, h) => slatGate(x, y + 40, w, h - 80, '#8c8f94'))),
  },
  jobs: {
    'progress-1': svg(800, 600, facade((x, y, w, h) => sectional(x, y, w, h, '#7d8a96', 6) + '<rect x="150" y="200" width="500" height="20" fill="#e8c46b" opacity="0.7"/>')),
    'progress-2': svg(800, 600, facade((x, y, w, h) => rollerShutter(x, y, w, h, '#8c7f6d', 0.5))),
    'progress-3': svg(800, 600, facade((x, y, w, h) => swingGate(x, y + 40, w, h - 80, '#495866'))),
    'progress-4': svg(800, 600, facade((x, y, w, h) => sectional(x, y, w, h, '#3b4a57', 6))),
  },
}

const aiDesigns = {
  'design-1': facade((x, y, w, h) => sectional(x, y, w, h, '#9a6b43')),
  'design-2': facade((x, y, w, h) => slatGate(x, y + 40, w, h - 80, '#55606b')),
  'design-3': facade((x, y, w, h) => windowShutter(x, y, w, h, '#4f6b52')),
  'design-4': facade((x, y, w, h) => rollerShutter(x, y, w, h, '#8c7f6d', 0.6)),
}

const write = (rel, content) => {
  const file = out(rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

for (const [name, [color, initials]] of Object.entries(sets.logos)) write(`demo/logos/${name}.svg`, logo(name, color, initials))
for (const [name, content] of Object.entries(sets.portfolio)) write(`demo/portfolio/${name}.svg`, content)
for (const [name, content] of Object.entries(sets.reviews)) write(`demo/reviews/${name}.svg`, content)
for (const [name, content] of Object.entries(sets.jobs)) write(`demo/jobs/${name}.svg`, content)

// AI samples: PNG, rendered from SVG. Labelled "Demo image" wherever they appear.
const aiSvgs = Object.entries(aiDesigns).map(([name, inner]) => [name, svg(800, 600, inner)])
mkdirSync(out('demo/ai'), { recursive: true })
let renderer
try {
  // Playwright is installed globally in the sandbox image; fall back to the project copy.
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  let playwright
  try {
    playwright = require('playwright')
  } catch {
    playwright = require(path.join(process.env.NPM_GLOBAL_ROOT || '/opt/node22/lib/node_modules', 'playwright'))
  }
  const { chromium } = playwright
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
  renderer = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
} catch (error) {
  console.warn('Playwright is not available; PNG samples were not rendered:', error.message)
}
if (renderer) {
  const page = await renderer.newPage({ viewport: { width: 800, height: 600 } })
  for (const [name, markup] of aiSvgs) {
    await page.setContent(`<html><body style="margin:0">${markup}</body></html>`)
    await page.screenshot({ path: out(`demo/ai/${name}.png`), type: 'png' })
  }
  await renderer.close()
  console.log(`Rendered ${aiSvgs.length} AI sample PNGs.`)
}
console.log('Demo assets written to public/demo.')
