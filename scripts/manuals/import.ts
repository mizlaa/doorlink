import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, DataSource } from '@prisma/client'
import { manufacturerFileSchema } from './schema'
import { aliasSpellings, normaliseModel } from '../../src/lib/manuals/normalise'
import { documentSlug, modelSlug } from '../../src/lib/manuals/slug'
import { reportFailure } from './db-guard'

// Imports data/manuals/*.json into the catalogue.
//
// Idempotent by natural key — manufacturer slug, then (manufacturer,
// modelCode), then (model, sourceUrl). Re-running updates in place
// rather than duplicating, so the seed files stay the source of truth
// and a corrected URL is one edit plus one re-run.
//
// It never marks anything verified. Verification is a separate step
// that has to actually fetch the URL (see verify.ts), and conflating
// the two is how an unchecked link starts looking official.

const prisma = new PrismaClient()
const DATA_DIR = join(process.cwd(), 'data', 'manuals')

async function main() {
  // portals.json shares this directory but is a registry of harvest
  // targets, not a seed file. Letting it fall through printed a
  // "not valid" warning on every run, which is exactly the warning a
  // genuinely malformed seed file needs to stand out with.
  const NOT_SEED_FILES = new Set(['portals.json'])
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && !NOT_SEED_FILES.has(f))
  if (files.length === 0) {
    console.log('No seed files in data/manuals — nothing to import.')
    return
  }

  let manufacturers = 0
  let models = 0
  let documents = 0
  let aliases = 0
  let altSources = 0
  const gaps: string[] = []

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
    const parsed = manufacturerFileSchema.safeParse(raw)
    if (!parsed.success) {
      // Loud and specific. A silently skipped file is a manufacturer
      // that quietly never appears in search.
      console.error(`\n${file} is not valid:`)
      for (const issue of parsed.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`)
      }
      process.exitCode = 1
      continue
    }

    // Two models sharing a modelCode is not a schema error, so zod lets
    // it through — and the upsert below is keyed on (manufacturer,
    // modelCode), so the second silently overwrites the first's name
    // and category and pools its documents. The result imports cleanly
    // and looks right in the count, which is how it goes unnoticed.
    // Worth failing on: it is always either a mistake or two things
    // that should have been one record.
    const seenCodes = new Set<string>()
    const repeated = new Set<string>()
    for (const model of parsed.data.models) {
      if (seenCodes.has(model.modelCode)) repeated.add(model.modelCode)
      seenCodes.add(model.modelCode)
    }
    if (repeated.size > 0) {
      console.error(`\n${file} repeats a model code:`)
      for (const code of repeated) {
        console.error(`  ${code} — merge these into one model, or give them distinct codes.`)
      }
      process.exitCode = 1
      continue
    }

    const { manufacturer, models: modelSeeds } = parsed.data

    const mfr = await prisma.manufacturer.upsert({
      where: { slug: manufacturer.slug },
      update: {
        country: manufacturer.country ?? null,
        website: manufacturer.website ?? null,
        supportUrl: manufacturer.supportUrl ?? null,
      },
      create: {
        name: manufacturer.name,
        slug: manufacturer.slug,
        country: manufacturer.country ?? null,
        website: manufacturer.website ?? null,
        supportUrl: manufacturer.supportUrl ?? null,
        // IMPORTED, not ADMIN_VERIFIED: nobody has checked these by hand.
        dataSource: DataSource.IMPORTED,
      },
    })
    manufacturers += 1

    for (const seed of modelSeeds) {
      const category = await prisma.category.upsert({
        where: { slug: seed.category },
        update: {},
        create: {
          slug: seed.category,
          name: seed.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        },
      })

      const model = await prisma.model.upsert({
        where: { manufacturerId_modelCode: { manufacturerId: mfr.id, modelCode: seed.modelCode } },
        // The slug is rewritten on update, not just on insert. It is a
        // pure function of the natural key, so restating it is a no-op
        // for a row already in the current format and a repair for one
        // written before the format changed — which is what stops a
        // format change from needing the table emptied first.
        update: {
          name: seed.name,
          categoryId: category.id,
          slug: modelSlug(manufacturer.slug, seed.modelCode),
        },
        create: {
          manufacturerId: mfr.id,
          categoryId: category.id,
          name: seed.name,
          modelCode: seed.modelCode,
          slug: modelSlug(manufacturer.slug, seed.modelCode),
          dataSource: DataSource.IMPORTED,
        },
      })
      models += 1

      if (seed.documents.length === 0) {
        gaps.push(`${manufacturer.name} ${seed.modelCode} — ${seed.note ?? 'no documentation located'}`)
      }

      // Aliases: the spellings generated from the code, plus any the
      // seed file states explicitly.
      const wanted = new Set([...aliasSpellings(seed.modelCode), ...seed.aliases])
      for (const alias of wanted) {
        const normalised = normaliseModel(alias)
        if (!normalised) continue
        await prisma.modelAlias.upsert({
          where: { modelId_normalised: { modelId: model.id, normalised } },
          update: { alias },
          create: { modelId: model.id, alias, normalised, source: 'seed' },
        })
        aliases += 1
      }

      for (const doc of seed.documents) {
        const existing = await prisma.document.findFirst({
          where: { modelId: model.id, sourceUrl: doc.sourceUrl },
          select: { id: true },
        })

        const data = {
          manufacturerId: mfr.id,
          categoryId: category.id,
          kind: doc.kind,
          title: doc.title,
          description: doc.description ?? null,
          sourceUrl: doc.sourceUrl,
          origin: doc.origin,
          publisher: doc.publisher ?? null,
          region: doc.region,
          rights: doc.rights,
          rightsNote: doc.rightsNote ?? null,
          language: doc.language,
          documentCode: doc.documentCode ?? null,
          revision: doc.revision ?? null,
          provenanceNote: doc.evidence,
          dataSource: DataSource.IMPORTED,
        }

        // version is spread in rather than sitting in `data` because the
        // column is non-nullable with a default: a seed file that states
        // no version must leave the existing value alone, not overwrite
        // it with null. It belongs on both paths — this ran on create
        // only, so correcting a version in a seed file and re-importing
        // silently did nothing.
        const versionPatch = doc.version ? { version: doc.version } : {}

        const record = existing
          ? await prisma.document.update({
              where: { id: existing.id },
              data: { ...data, ...versionPatch },
            })
          : await prisma.document.create({
              data: {
                ...data,
                ...versionPatch,
                modelId: model.id,
                slug: documentSlug(
                  `${manufacturer.slug}-${seed.modelCode}-${doc.kind}-${doc.title}`,
                  doc.sourceUrl
                ),
              },
            })
        documents += 1

        for (const alt of doc.altSources) {
          await prisma.documentSource.upsert({
            where: { documentId_url: { documentId: record.id, url: alt.url } },
            update: { authority: alt.authority, label: alt.label ?? null },
            create: {
              documentId: record.id,
              url: alt.url,
              authority: alt.authority,
              label: alt.label ?? null,
            },
          })
          altSources += 1
        }
      }
    }
  }

  // Withdrawing a document the seed files no longer contain.
  //
  // Everything above is an upsert, which makes the seed files the source
  // of truth for what exists but not for what has stopped existing: a
  // record deleted from a seed file lived on in the database, invisible
  // to the files and still served to anyone searching. That mattered the
  // first time a link was removed for being broken — the audit pruned it
  // from the seeds, the import reported success, and the dead link was
  // still there to be clicked.
  //
  // Scoped to IMPORTED so the demo fixtures in prisma/seed.ts and
  // anything a user submitted are untouched; this only withdraws what
  // this script put there.
  const seededUrls = new Set<string>()
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
    const parsed = manufacturerFileSchema.safeParse(raw)
    if (!parsed.success) continue
    for (const model of parsed.data.models) {
      for (const doc of model.documents) seededUrls.add(doc.sourceUrl)
    }
  }
  const orphans = await prisma.document.findMany({
    where: { dataSource: DataSource.IMPORTED, sourceUrl: { notIn: [...seededUrls] } },
    select: { id: true, title: true, sourceUrl: true },
  })
  if (orphans.length > 0) {
    await prisma.document.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } })
  }

  console.log(
    `\nImported ${manufacturers} manufacturers, ${models} models, ${documents} documents, ` +
      `${aliases} aliases, ${altSources} alternate sources.`
  )
  console.log('Every document is UNVERIFIED. Run `npm run manuals:verify` where the network allows.')

  if (orphans.length > 0) {
    console.log(`\nWithdrew ${orphans.length} document(s) no longer in any seed file:`)
    for (const o of orphans) console.log(`  ${o.title}`)
  }

  if (gaps.length > 0) {
    console.log(`\n${gaps.length} model(s) recorded with no documentation:`)
    for (const gap of gaps) console.log(`  ${gap}`)
  }
}

main()
  .catch(reportFailure)
  .finally(() => prisma.$disconnect())
