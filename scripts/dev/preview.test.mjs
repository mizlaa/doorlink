import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquirePreviewLock } from './preview.mjs'

const dirs = []
function lockPath() {
  const dir = mkdtempSync(join(tmpdir(), 'doorlink-preview-'))
  dirs.push(dir)
  return join(dir, 'preview.lock')
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('preview lifecycle lock', () => {
  it('blocks a second startup while the first preview owns its assets', () => {
    const path = lockPath()
    const release = acquirePreviewLock(path)
    assert.throws(() => acquirePreviewLock(path), /already running/)
    release()
    assert.equal(existsSync(path), false)
    acquirePreviewLock(path)()
  })
  it('recovers a lock left behind by a terminated process', () => {
    const path = lockPath()
    writeFileSync(path, '2147483647')
    acquirePreviewLock(path)()
    assert.equal(existsSync(path), false)
  })
  it('does not remove an ambiguous lock or kill its owner', () => {
    const path = lockPath()
    writeFileSync(path, 'not-a-pid')
    assert.throws(() => acquirePreviewLock(path), /Invalid preview lock/)
    assert.equal(existsSync(path), true)
  })
})
