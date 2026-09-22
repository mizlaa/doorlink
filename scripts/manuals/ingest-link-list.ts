import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { manufacturerFileSchema, type ManufacturerFile, type SeedDocument } from './schema'

// Turns a pipe-separated link list into data/manuals JSON.
//
// Only direct PDF URLs are kept. Index pages and aggregator hosts
// (Manualslib and the like) are not manufacturer documents, and the
// importer would present them as if they were.

const DATA_DIR = join(process.cwd(), 'data', 'manuals')
const SOURCE_NOTE =
  'Client link list (doorlink-manuals-combined.txt). Direct PDF URL. Not fetched.'

const SAME_MANUFACTURER: Record<string, string> = {
  'assa-abloy-besam': 'besam',
  'automatic-technology-ata': 'automatic-technology',
  'marantec-america': 'marantec',
  'nice-apollo': 'nice',
  'came-bpt': 'came',
  'genius-faac': 'faac',
  'hansa-nice': 'nice',
}

function fold(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

function slugifyName(value: string): string {
  return fold(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function isPdf(url: string): boolean {
  const path = url.split(/[?#]/)[0] ?? ''
  return path.toLowerCase().endsWith('.pdf')
}

function isIndex(title: string): boolean {
  return /\bindex\b/i.test(title)
}

function kindFor(title: string): SeedDocument['kind'] {
  const text = title.toLowerCase()
  if (/wiring/.test(text)) return 'WIRING_DIAGRAM'
  if (/parts list|spare parts/.test(text)) return 'PARTS_LIST'
  if (/spec(ification)? sheet|data\s?sheet/.test(text)) return 'SPEC_SHEET'
  if (/warranty/.test(text)) return 'WARRANTY'
  if (/programming/.test(text)) return 'PROGRAMMING_GUIDE'
  if (/troubleshoot/.test(text)) return 'TROUBLESHOOTING_GUIDE'
  if (/quick\s?start/.test(text)) return 'QUICK_START'
  if (/declaration of conformity|\bdoc\b/.test(text)) return 'DECLARATION_OF_CONFORMITY'
  if (/safety/.test(text)) return 'SAFETY_DOCUMENT'
  if (/service bulletin/.test(text)) return 'SERVICE_BULLETIN'
  if (/install/.test(text)) return 'INSTALL_MANUAL'
  if (/user|owner|homeowner|operating|operation/.test(text)) return 'USER_MANUAL'
  return 'TECHNICAL_DOCUMENT'
}

function categoryFor(model: string, title: string): string {
  const text = `${model} ${title}`.toLowerCase()
  if (/remote|transmitter|receiver|accessory|keypad/.test(text)) return 'remotes-accessories'
  if (/high-?speed|rapid roll/.test(text)) return 'industrial-high-speed-doors'
  if (/shutter|roller/.test(text)) return 'roller-shutter-motors'
  if (/sliding door|swing door|pedestrian|automatic door/.test(text)) return 'automatic-pedestrian-doors'
  if (/gate/.test(text)) return 'gate-motors'
  if (/garage|sectional|overhead/.test(text)) return 'garage-door-openers'
  return 'gate-motors'
}

function originFor(url: string, slug: string): SeedDocument['origin'] {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'UNKNOWN'
  }
  const token = slug.replace(/-/g, '')
  const hostFlat = host.replace(/[^a-z0-9]/g, '')
  if (token.length >= 4 && hostFlat.includes(token)) return 'MANUFACTURER_ORIGINAL'
  return 'THIRD_PARTY_GUIDE'
}

function normalName(value: string): string {
  return fold(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function resolveSlug(
  manufacturer: string,
  aliased: string,
  existing: Map<string, { file: string; data: ManufacturerFile }>
): string {
  if (existing.has(aliased)) return aliased
  const wanted = normalName(manufacturer)
  for (const [slug, held] of existing) {
    if (normalName(held.data.manufacturer.name) === wanted) return slug
  }
  return aliased
}

function loadExisting(): Map<string, { file: string; data: ManufacturerFile }> {
  const bySlug = new Map<string, { file: string; data: ManufacturerFile }>()
  for (const name of readdirSync(DATA_DIR)) {
    if (!name.endsWith('.json') || name === 'portals.json') continue
    const raw = JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'))
    const parsed = manufacturerFileSchema.safeParse(raw)
    if (!parsed.success) continue
    bySlug.set(parsed.data.manufacturer.slug, { file: name, data: parsed.data })
  }
  return bySlug
}

function parseList(path: string): Array<{ manufacturer: string; modelCode: string; title: string; url: string }> {
  const rows = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(' | ')
    if (parts.length !== 4) continue
    const [manufacturer, modelCode, title, url] = parts.map((part) => part.trim())
    if (!manufacturer || !modelCode || !title || !url) continue
    if (!isPdf(url) || isIndex(title)) continue
    rows.push({ manufacturer, modelCode, title, url })
  }
  return rows
}

function main() {
  const listPath = process.argv[2] ?? join(process.cwd(), 'doorlink-manuals-combined.txt')
  const rows = parseList(listPath)
  const existing = loadExisting()
  const drafts = new Map<string, ManufacturerFile>()

  let added = 0
  let skippedDuplicate = 0

  for (const row of rows) {
    const generated = slugifyName(row.manufacturer)
    const aliased = SAME_MANUFACTURER[generated] ?? generated
    const slug = resolveSlug(row.manufacturer, aliased, existing)
    let file = drafts.get(slug)
    if (!file) {
      const held = existing.get(slug)?.data
      file = held ?? {
        manufacturer: {
          name: row.manufacturer,
          slug,
          note: 'Added from the client PDF link list. Links are unverified.',
        },
        models: [],
      }
      drafts.set(slug, file)
    }

    const seen = new Set(file.models.flatMap((item) => item.documents.map((doc) => doc.sourceUrl)))
    if (seen.has(row.url)) {
      skippedDuplicate += 1
      continue
    }

    const modelKey = row.modelCode.toLowerCase()
    let model = file.models.find((item) => item.modelCode.toLowerCase() === modelKey)
    if (!model) {
      model = {
        modelCode: row.modelCode,
        name: row.modelCode,
        category: categoryFor(row.modelCode, row.title),
        region: 'UNKNOWN',
        aliases: [],
        documents: [],
      }
      file.models.push(model)
    }

    model.documents.push({
      kind: kindFor(row.title),
      title: row.title,
      sourceUrl: row.url,
      origin: originFor(row.url, slug),
      region: 'UNKNOWN',
      rights: 'LINK_ONLY',
      language: 'en',
      evidence: SOURCE_NOTE,
      altSources: [],
    })
    added += 1
  }

  let filesWritten = 0
  for (const [slug, data] of drafts) {
    const parsed = manufacturerFileSchema.safeParse(data)
    if (!parsed.success) {
      console.error(`\n${slug} is not valid:`)
      for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`)
      process.exitCode = 1
      continue
    }
    const held = existing.get(slug)
    const filename = held?.file ?? `${slug}.json`
    writeFileSync(join(DATA_DIR, filename), `${JSON.stringify(parsed.data, null, 2)}\n`)
    filesWritten += 1
  }

  console.log(
    `Kept ${rows.length} PDF rows. Added ${added} documents, skipped ${skippedDuplicate} duplicate URLs, wrote ${filesWritten} manufacturer files.`
  )
}

main()
