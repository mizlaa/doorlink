import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { manufacturerFileSchema } from './schema'
import { deadLinkReason } from '../../src/lib/manuals/dead-link'

/**
 * Finds links that cannot possibly resolve, without fetching anything.
 *
 * `manuals:verify` is the real answer to "is this link alive", but it
 * needs the network, and until it can run there is still a class of dead
 * link that is provable from the string alone. A URL copied out of a
 * search result carrying the display ellipsis — "…-owner-s-..." — is not
 * a link that might 404, it is a link that cannot be anything else.
 *
 * Worth a script rather than an eye: the defect is invisible at a glance
 * in a 1,400-line file, it arrives silently through bulk ingest, and it
 * is indistinguishable from a healthy record in every count and every
 * listing. Three were sitting in the catalogue when this was written.
 *
 * Reports by default. `--prune` removes the offending documents and says
 * which models were left with none, because a model with no documents is
 * a recorded gap and deserves to be noticed rather than discovered.
 */

const DATA_DIR = join(process.cwd(), 'data', 'manuals')
const NOT_SEED_FILES = new Set(['portals.json'])

type Defect = { reason: string; url: string; file: string; modelCode: string; title: string }

function main() {
  const prune = process.argv.includes('--prune')
  const files = readdirSync(DATA_DIR).filter(
    (f) => f.endsWith('.json') && !NOT_SEED_FILES.has(f),
  )

  const defects: Defect[] = []
  const emptied: string[] = []
  let checked = 0

  for (const file of files) {
    const parsed = manufacturerFileSchema.safeParse(
      JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')),
    )
    if (!parsed.success) {
      console.error(`${file} is not valid — run manuals:import to see why.`)
      process.exitCode = 1
      continue
    }

    let changed = false
    for (const model of parsed.data.models) {
      const keep = []
      for (const doc of model.documents) {
        checked++
        const reason = deadLinkReason(doc.sourceUrl)
        if (!reason) {
          keep.push(doc)
          continue
        }
        defects.push({
          reason,
          url: doc.sourceUrl,
          file,
          modelCode: model.modelCode,
          title: doc.title,
        })
        if (!prune) keep.push(doc)
      }
      if (keep.length !== model.documents.length) {
        model.documents = keep
        changed = true
        if (keep.length === 0) {
          emptied.push(`${parsed.data.manufacturer.name} ${model.modelCode}`)
        }
      }
    }

    if (prune && changed) {
      writeFileSync(
        join(DATA_DIR, file),
        `${JSON.stringify(parsed.data, null, 2)}\n`,
        'utf8',
      )
    }
  }

  console.log(`Checked ${checked} links in ${files.length} seed file(s).`)
  if (defects.length === 0) {
    console.log('No structurally dead links.')
    return
  }

  console.log(`\n${defects.length} link(s) that cannot resolve:`)
  for (const d of defects) {
    console.log(`  ${d.file} — ${d.modelCode}`)
    console.log(`    ${d.title}`)
    console.log(`    ${d.url}`)
    console.log(`    ${d.reason}`)
  }

  if (!prune) {
    console.log('\nRe-run with --prune to remove them.')
    // Not a failure when only reporting: this is the state of the data,
    // and a non-zero exit here would make every audit look like a crash.
    return
  }

  console.log(`\nRemoved ${defects.length} document(s).`)
  if (emptied.length > 0) {
    console.log(`\n${emptied.length} model(s) now have no documentation:`)
    for (const m of emptied) console.log(`  ${m}`)
    console.log('Find a replacement URL for these, or the model is a dead end in search.')
  }
}

main()
