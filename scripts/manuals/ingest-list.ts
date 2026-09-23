import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { manufacturerFileSchema, type ManufacturerFile, type SeedModel } from './schema'
import { slugify } from '../../src/lib/manuals/slug'
import {
  LAST_RESORT_CATEGORY,
  categoryForModel,
  dominantCategory,
  kindFor,
  originFor,
  regionFor,
} from '../../src/lib/manuals/derive'

/**
 * Folds research lists in data/manuals/incoming/ into the seed files.
 *
 * The research step produces a flat, human-checkable line per document
 * — `Manufacturer | Model | Title | URL` — because that is the shape a
 * person can scan for nonsense. The catalogue wants manufacturers with
 * models with documents. This script is the join between the two, and
 * it exists as a script rather than a one-off conversion because the
 * list keeps growing: re-running has to be safe.
 *
 * Safe here means two things. Existing records are never rewritten — a
 * URL already in a seed file is skipped whole, so hand-written evidence
 * and corrected metadata survive a re-run. And everything it does write
 * is marked as what it is: unverified, link-only, with evidence saying
 * plainly that nobody opened the URL.
 *
 * It does not touch the database. Run `manuals:import` after.
 */

const DATA_DIR = join(process.cwd(), 'data', 'manuals')
const INCOMING_DIR = join(DATA_DIR, 'incoming')
const NOT_SEED_FILES = new Set(['portals.json'])

/**
 * Why a record written by this script is believed to exist.
 *
 * Deliberately unflattering. Every one of these came from a search
 * result naming the document, which is a real signal and not nothing —
 * but the URL was never opened, so the document's existence at that
 * address is unconfirmed. Saying so in the record itself is the only
 * thing stopping a bulk-imported guess from reading like a checked fact
 * later on.
 */
const INGEST_EVIDENCE_PREFIX = 'Recorded from a web search result naming this URL as'

function evidenceFor(title: string, host: string): string {
  return (
    `${INGEST_EVIDENCE_PREFIX} "${title}" (host: ${host}). ` +
    'Neither the document nor the page has been opened, so its presence at this URL, ' +
    'its edition and its contents are all unconfirmed. Treat as a lead, not a citation, ' +
    'until manuals:verify has run against it. Not fetched - egress blocked.'
  )
}

/**
 * The first word of a manufacturer's name that actually identifies it.
 *
 * Used only to flag a possible duplicate, never to merge one. Three times
 * now a research list has spelled a manufacturer differently from its
 * hand-written seed — "Automatic Technology (ATA)" against "Automatic
 * Technology", "ASSA ABLOY Besam" against "Besam", "Napoleon" against
 * "Napoleon / Lynx" — and each time ingest quietly created a second
 * manufacturer, splitting its manuals between two records. Merging on a
 * shared word would be wrong as often as right: Centurion Systems and
 * Centurion Garage Doors are two unrelated companies. So this flags and a
 * person decides.
 */
function identifyingWord(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !['the', 'assa', 'abloy'].includes(w))
  return words[0] ?? ''
}

type Row = { manufacturer: string; model: string; title: string; url: string }

function parseList(text: string, file: string): { rows: Row[]; bad: string[] } {
  const rows: Row[] = []
  const bad: string[] = []
  text.split('\n').forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const parts = trimmed.split(' | ').map((p) => p.trim())
    if (parts.length !== 4 || !/^https?:\/\//.test(parts[3])) {
      bad.push(`${file}:${i + 1}`)
      return
    }
    rows.push({ manufacturer: parts[0], model: parts[1], title: parts[2], url: parts[3] })
  })
  return { rows, bad }
}

function main() {
  // Existing seed files are both the destination and the duplicate
  // check. Loading them first means a URL that is already catalogued —
  // with evidence someone wrote by hand — is left exactly as it is.
  const seedFiles = readdirSync(DATA_DIR).filter(
    (f) => f.endsWith('.json') && !NOT_SEED_FILES.has(f),
  )
  const bySlug = new Map<string, { file: string; data: ManufacturerFile }>()
  const byName = new Map<string, string>()
  const knownUrls = new Set<string>()

  for (const file of seedFiles) {
    const parsed = manufacturerFileSchema.safeParse(
      JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')),
    )
    if (!parsed.success) {
      console.error(`${file} is not valid — fix it before ingesting, or its records will be duplicated.`)
      process.exit(1)
    }
    bySlug.set(parsed.data.manufacturer.slug, { file, data: parsed.data })
    byName.set(parsed.data.manufacturer.name.toLowerCase(), parsed.data.manufacturer.slug)
    for (const model of parsed.data.models) {
      for (const doc of model.documents) knownUrls.add(doc.sourceUrl)
    }
  }

  let listFiles: string[]
  try {
    listFiles = readdirSync(INCOMING_DIR).filter((f) => f.endsWith('.txt'))
  } catch {
    console.log('No data/manuals/incoming directory — nothing to ingest.')
    return
  }
  if (listFiles.length === 0) {
    console.log('No research lists in data/manuals/incoming — nothing to ingest.')
    return
  }

  const rows: Row[] = []
  const malformed: string[] = []
  for (const file of listFiles) {
    const parsed = parseList(readFileSync(join(INCOMING_DIR, file), 'utf8'), file)
    rows.push(...parsed.rows)
    malformed.push(...parsed.bad)
  }

  let added = 0
  let skipped = 0
  let refreshed = 0
  const touched = new Set<string>()
  const newManufacturers: string[] = []
  const suspectSplits: string[] = []

  // Records this script wrote before, indexed so a re-run can correct
  // them. Kind, category, region and origin are all *derived* from the
  // title and URL rather than observed, so when a derivation rule
  // improves the old records are simply wrong and recomputing them is
  // always right. Hand-written records are excluded by checking the
  // evidence text: someone who wrote evidence by hand may well have set
  // these fields deliberately, and overwriting that would lose the only
  // judgement in the file.
  const ownRecords = new Map<string, { model: SeedModel; slug: string; index: number }>()
  for (const [slug, entry] of bySlug) {
    for (const model of entry.data.models) {
      model.documents.forEach((doc, index) => {
        if (doc.evidence.startsWith(INGEST_EVIDENCE_PREFIX)) {
          ownRecords.set(doc.sourceUrl, { model, slug, index })
        }
      })
    }
  }

  for (const row of rows) {
    const own = ownRecords.get(row.url)
    if (own) {
      let host: string
      try {
        host = new URL(row.url).hostname
      } catch {
        skipped++
        continue
      }
      const entry = bySlug.get(own.slug)!
      const doc = own.model.documents[own.index]
      const kind = kindFor(row.title)
      const origin = originFor(host, entry.data.manufacturer.website)
      if (doc.kind !== kind || doc.origin !== origin) {
        doc.kind = kind as never
        doc.origin = origin as never
        touched.add(own.slug)
        refreshed++
      }
      skipped++
      continue
    }
    if (knownUrls.has(row.url)) {
      skipped++
      continue
    }
    // Within one run the list itself can repeat a URL across two
    // manufacturers; first write wins and the rest are duplicates.
    knownUrls.add(row.url)

    let host: string
    try {
      host = new URL(row.url).hostname
    } catch {
      malformed.push(row.url)
      continue
    }

    const slug = byName.get(row.manufacturer.toLowerCase()) ?? slugify(row.manufacturer)
    let entry = bySlug.get(slug)
    if (!entry) {
      entry = {
        file: `${slug}.json`,
        data: {
          manufacturer: {
            name: row.manufacturer,
            slug,
            note:
              'Added by ingest-list from research findings. Country, website and support URL ' +
              'are unset because they were not established at the time — fill them in when ' +
              'this manufacturer is next looked at directly.',
          },
          models: [],
        },
      }
      const word = identifyingWord(row.manufacturer)
      const lookalikes = word
        ? [...bySlug.values()]
            .map((e) => e.data.manufacturer.name)
            .filter((n) => identifyingWord(n) === word)
        : []
      if (lookalikes.length > 0) {
        suspectSplits.push(`${row.manufacturer}  ~  ${lookalikes.join(', ')}`)
      }
      bySlug.set(slug, entry)
      byName.set(row.manufacturer.toLowerCase(), slug)
      newManufacturers.push(row.manufacturer)
    }

    const { manufacturer, models } = entry.data
    // Case-insensitively, because the research list and the
    // hand-written seeds disagree about capitalisation constantly —
    // "SupraMatic E2" against "SUPRAMATIC E2" — and treating those as
    // two models splits one product's documents across two records that
    // then fight over the same URL slug.
    let model: SeedModel | undefined = models.find(
      (m) => m.modelCode.toLowerCase() === row.model.toLowerCase(),
    )
    if (!model) {
      model = {
        modelCode: row.model,
        name: `${manufacturer.name} ${row.model}`,
        category: categoryForModel(row.model, [row.title]) ?? LAST_RESORT_CATEGORY,
        region: regionFor(host, manufacturer.country) as SeedModel['region'],
        aliases: [],
        documents: [],
      }
      models.push(model)
    }

    model.documents.push({
      kind: kindFor(row.title) as never,
      title: row.title,
      sourceUrl: row.url,
      origin: originFor(host, manufacturer.website) as never,
      publisher: host.replace(/^www\./, ''),
      region: regionFor(host, manufacturer.country) as never,
      rights: 'LINK_ONLY',
      language: 'en',
      evidence: evidenceFor(row.title, host),
      altSources: [],
    })
    touched.add(slug)
    added++
  }

  // Models that differ only by capitalisation are the same model. Any
  // written before the match above became case-insensitive are merged
  // back here rather than left as split records; the spelling that keeps
  // its documents is the one carrying hand-written evidence, since that
  // is the one a person chose.
  let merged = 0
  for (const [slug, entry] of bySlug) {
    const groups = new Map<string, SeedModel[]>()
    for (const model of entry.data.models) {
      const key = model.modelCode.toLowerCase()
      groups.set(key, [...(groups.get(key) ?? []), model])
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const handWritten = (m: SeedModel) =>
        m.documents.filter((d) => !d.evidence.startsWith(INGEST_EVIDENCE_PREFIX)).length
      const keep = [...group].sort((a, b) => handWritten(b) - handWritten(a))[0]
      for (const other of group) {
        if (other === keep) continue
        keep.documents.push(...other.documents)
        keep.aliases = [...new Set([...keep.aliases, ...other.aliases, other.modelCode])]
        entry.data.models.splice(entry.data.models.indexOf(other), 1)
        merged++
      }
      touched.add(slug)
    }
  }

  // Categories are settled last, once every document is in place: a
  // model's category depends on its siblings' titles and on what the
  // manufacturer mostly makes, and neither is known while rows are
  // still arriving.
  let recategorised = 0
  for (const [slug, entry] of bySlug) {
    const dominant = dominantCategory(entry.data.models)
    for (const model of entry.data.models) {
      const matched = categoryForModel(
        model.modelCode,
        model.documents.map((d) => d.title),
      )
      const settled = matched ?? dominant ?? LAST_RESORT_CATEGORY
      // Only models this script owns end to end get recategorised; a
      // model with any hand-written document may have had its category
      // set deliberately.
      const ownedOutright = model.documents.every((d) =>
        d.evidence.startsWith(INGEST_EVIDENCE_PREFIX),
      )
      if (ownedOutright && model.category !== settled) {
        model.category = settled
        touched.add(slug)
        recategorised++
      }
    }
  }

  for (const slug of touched) {
    const entry = bySlug.get(slug)!
    // Sorting keeps the diff of a re-run readable: a new document lands
    // next to its siblings instead of at the end of whatever file it
    // happened to be appended to.
    entry.data.models.sort((a, b) => a.modelCode.localeCompare(b.modelCode))
    writeFileSync(join(DATA_DIR, entry.file), `${JSON.stringify(entry.data, null, 2)}\n`, 'utf8')
  }

  console.log(`Read ${rows.length} rows from ${listFiles.length} list(s).`)
  console.log(`Added ${added} documents across ${touched.size} manufacturer file(s).`)
  console.log(`Skipped ${skipped} already present.`)
  if (merged > 0) {
    console.log(`Merged ${merged} model(s) that differed only by capitalisation.`)
  }
  if (recategorised > 0) {
    console.log(`Recategorised ${recategorised} model(s).`)
  }
  if (refreshed > 0) {
    console.log(`Refreshed derived fields on ${refreshed} previously ingested document(s).`)
  }
  if (newManufacturers.length > 0) {
    console.log(`New manufacturers (${newManufacturers.length}): ${newManufacturers.join(', ')}`)
  }
  if (suspectSplits.length > 0) {
    console.error(
      `\n${suspectSplits.length} new manufacturer(s) resemble one that already exists:`,
    )
    for (const s of suspectSplits) console.error(`  ${s}`)
    console.error(
      'If these are the same company, make the research list use the existing spelling, ' +
        'delete the new seed file, and re-run. If they are different companies, ignore this.',
    )
  }
  if (malformed.length > 0) {
    console.error(`\nSkipped ${malformed.length} malformed line(s): ${malformed.slice(0, 10).join(', ')}`)
    process.exitCode = 1
  }
}

main()
