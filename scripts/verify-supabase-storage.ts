/**
 * Optional live check after Supabase storage secrets are set locally or in Replit.
 * Skips quietly when secrets are absent. Does not print keys.
 *
 * Loads `.env` from the project root (same as Next/Prisma). Replit Secrets are
 * already in process.env and are left unchanged.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { signedFileUrl, uploadFile } from '../src/lib/storage'

function loadProjectEnv(): void {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue

    const key = trimmed.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadProjectEnv()

async function main() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_STORAGE_BUCKET',
  ] as const
  const missing = required.filter((name) => !process.env[name]?.length)
  if (missing.length > 0) {
    console.log(
      `skip: missing Supabase storage env (${missing.join(', ')}). Set them in .env or Replit Secrets.`
    )
    return
  }

  const key = `manual-submissions/_doorlink_verify_${Date.now()}.txt`
  await uploadFile({
    key,
    body: new TextEncoder().encode('doorlink storage verify'),
    contentType: 'text/plain',
  })

  const signed = await signedFileUrl(key, 120)
  if (!signed) {
    throw new Error('signedFileUrl returned null after upload')
  }

  const probe = await fetch(signed)
  if (!probe.ok) {
    throw new Error(`Signed URL fetch failed with HTTP ${probe.status}`)
  }

  console.log('ok: manual-submissions upload and signed preview URL')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
