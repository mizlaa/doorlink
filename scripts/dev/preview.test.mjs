import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquirePreviewLock, isPreviewBuildCurrent, previewFingerprint } from './preview.mjs'

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

describe('preview build reuse', () => {
  it('reuses a build only while all app source and dependency inputs match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doorlink-fingerprint-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'src/app'), { recursive: true })
    writeFileSync(join(dir, 'src/app/page.tsx'), 'initial page')
    const fingerprint = previewFingerprint(dir)
    const dist = join(dir, '.next-preview')
    mkdirSync(dist)
    writeFileSync(join(dist, 'BUILD_ID'), 'build-id')
    writeFileSync(join(dist, 'source-fingerprint'), fingerprint)
    assert.equal(isPreviewBuildCurrent(dir), true)

    writeFileSync(join(dir, 'src/app/page.tsx'), 'updated page')
    assert.notEqual(previewFingerprint(dir), fingerprint)
    assert.equal(isPreviewBuildCurrent(dir), false)
  })
})
