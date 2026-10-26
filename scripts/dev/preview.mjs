import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Hold the lock through both build AND serving. A second startup must not
// rebuild assets beneath a live server. Never stop another process by PID.
export function acquirePreviewLock(path) {
  try {
    const fd = openSync(path, 'wx')
    writeFileSync(fd, String(process.pid))
    closeSync(fd)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const pid = Number(readFileSync(path, 'utf8'))
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid preview lock; refusing to overwrite it.')
    try {
      process.kill(pid, 0)
    } catch (probeError) {
      if (probeError.code !== 'ESRCH') throw probeError
      unlinkSync(path)
      return acquirePreviewLock(path)
    }
    throw new Error('The optimized preview is already running. Stop it before restarting.')
  }
  return () => {
    if (readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path)
  }
}

const BUILD_INPUTS = [
  'src',
  'public',
  'prisma',
  'data',
  'scripts',
  'package.json',
  'package-lock.json',
  'next.config.mjs',
  'next-env.d.ts',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'tailwind.config.js',
  'tsconfig.json',
  'tsconfig.preview.json',
]

export function previewFingerprint(root = process.cwd()) {
  const hash = createHash('sha256')
  const visit = (relativePath) => {
    const absolutePath = resolve(root, relativePath)
    if (!existsSync(absolutePath)) return
    if (statSync(absolutePath).isDirectory()) {
      for (const entry of readdirSync(absolutePath).sort()) visit(`${relativePath}/${entry}`)
      return
    }
    hash.update(relativePath)
    hash.update('\0')
    hash.update(readFileSync(absolutePath))
    hash.update('\0')
  }
  for (const input of BUILD_INPUTS) visit(input)
  return hash.digest('hex')
}

export function isPreviewBuildCurrent(root = process.cwd()) {
  const dist = resolve(root, '.next-preview')
  const stamp = resolve(dist, 'source-fingerprint')
  const buildId = resolve(dist, 'BUILD_ID')
  return existsSync(buildId) && existsSync(stamp) && readFileSync(stamp, 'utf8') === previewFingerprint(root)
}

function recordPreviewBuild(root = process.cwd()) {
  const dist = resolve(root, '.next-preview')
  mkdirSync(dist, { recursive: true })
  const temporaryStamp = resolve(dist, `source-fingerprint-${process.pid}.tmp`)
  writeFileSync(temporaryStamp, previewFingerprint(root))
  renameSync(temporaryStamp, resolve(dist, 'source-fingerprint'))
}

async function main() {
  const release = acquirePreviewLock(resolve('.next-preview.lock'))
  let child
  let stopping = false
  let killTimer
  const killGroup = (signal) => {
    if (!child?.pid) return
    try { process.kill(-child.pid, signal) } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  const stop = () => {
    if (stopping) return
    stopping = true
    killGroup('SIGTERM')
    killTimer = setTimeout(() => killGroup('SIGKILL'), 10000)
    killTimer.unref()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  const run = (command, args) => new Promise((resolveRun, reject) => {
    child = spawn(command, args, {
      stdio: 'inherit',
      detached: true,
      env: { ...process.env, DOORLINK_PREVIEW: 'true' },
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      // npm may exit before its descendants; also clean up those children.
      killGroup('SIGTERM')
      child = undefined
      resolveRun(code ?? 1)
    })
  })
  try {
    if (!isPreviewBuildCurrent()) {
      const buildCode = await run('npm', ['run', 'build'])
      if (stopping || buildCode !== 0) {
        process.exitCode = stopping ? 0 : buildCode
        return
      }
      recordPreviewBuild()
    } else {
      console.log('App unchanged; starting the existing optimized build.')
    }
    process.exitCode = await run('npm', ['run', 'start', '--', ...process.argv.slice(2)])
    if (stopping) process.exitCode = 0
  } finally {
    clearTimeout(killTimer)
    process.off('SIGTERM', stop)
    process.off('SIGINT', stop)
    release()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
