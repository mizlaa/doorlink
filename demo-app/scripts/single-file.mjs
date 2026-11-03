// Folds dist-single/ (built with DEMO_SINGLE=1) into one self-contained
// HTML file, demo-app/doorlink-demo.html. Script, styles, fonts and
// pictures are all inside it, so it opens from anywhere, including a phone.
//
//   DEMO_SINGLE=1 npx vite build --config demo-app/vite.config.mts
//   node demo-app/scripts/single-file.mjs
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve(import.meta.dirname, '../dist-single')
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')

const cssTag = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/)
const jsTag = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/)
if (!cssTag || !jsTag) throw new Error('Expected one stylesheet and one module script in dist-single/index.html')

const css = fs.readFileSync(path.join(dir, cssTag[1]), 'utf8')
// A literal "</script" inside the bundle would end the inline script early.
const js = fs.readFileSync(path.join(dir, jsTag[1]), 'utf8').replace(/<\/script/gi, '<\\/script')

const icon = fs.readFileSync(path.resolve(import.meta.dirname, '../public/apple-touch-icon.png')).toString('base64')

html = html
  .replace('href="./apple-touch-icon.png"', `href="data:image/png;base64,${icon}"`)
  .replace(cssTag[0], () => `<style>${css}</style>`)
  .replace(jsTag[0], '')
  .replace('</body>', () => `<script type="module">${js}</script>\n  </body>`)

const out = path.resolve(import.meta.dirname, '../doorlink-demo.html')
fs.writeFileSync(out, html)
console.log(`${path.relative(process.cwd(), out)}: ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`)
