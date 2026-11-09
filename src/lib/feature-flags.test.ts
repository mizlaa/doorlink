import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

describe('3D experience flag', () => {
  it('is off unless explicitly switched on', () => {
    // The flag is read at build time; the test build runs without it.
    expect(process.env.NEXT_PUBLIC_FEATURE_3D_V2 === '1').toBe(false)
  })
})

/**
 * The demo's fictional businesses, reviews and demo-only paths must never
 * reach the live app. This fails the build's tests if any of them appear.
 */
describe('no demo data in the live app', () => {
  const forbidden = ['demo-app', '../demo/data', 'Kestrel Lane', 'Tallowood', 'Redgum Ridge', 'Harbourline Doors']
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(tsx?|css)$/.test(name) && !name.endsWith('.test.ts')) files.push(path)
    }
  }
  walk(join(process.cwd(), 'src'))

  it.each(files.map((f) => [f.replace(process.cwd() + '/', '')]))('%s', (file) => {
    const text = readFileSync(join(process.cwd(), file), 'utf8')
    for (const term of forbidden) expect(text.includes(term), `${file} mentions ${term}`).toBe(false)
  })
})
