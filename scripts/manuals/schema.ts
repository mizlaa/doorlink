import { z } from 'zod'

// The shape of a seed file in data/manuals/.
//
// Parsed rather than trusted. A hand-written JSON file is exactly where
// a wrong enum value or a typo'd URL gets in, and a malformed record
// that reaches the database becomes a manual a technician cannot find.

const kinds = [
  'INSTALL_MANUAL',
  'USER_MANUAL',
  'WIRING_DIAGRAM',
  'PARTS_LIST',
  'SPEC_SHEET',
  'WARRANTY',
  'SERVICE_BULLETIN',
  'PROGRAMMING_GUIDE',
  'TROUBLESHOOTING_GUIDE',
  'TECHNICAL_DOCUMENT',
  'SAFETY_DOCUMENT',
  'QUICK_START',
  'DECLARATION_OF_CONFORMITY',
] as const

const regions = ['AU', 'NZ', 'UK', 'US', 'CA', 'EU', 'ASIA', 'GLOBAL', 'UNKNOWN'] as const
const origins = [
  'MANUFACTURER_ORIGINAL',
  'THIRD_PARTY_GUIDE',
  'COMMUNITY_CONTRIBUTED',
  'DOORLINK_AUTHORED',
  'UNKNOWN',
] as const
const rights = ['LINK_ONLY', 'REDISTRIBUTABLE', 'OWN_CONTENT', 'UNCLEAR'] as const
const authorities = [
  'MANUFACTURER_OFFICIAL',
  'AUTHORISED_DISTRIBUTOR',
  'THIRD_PARTY_MIRROR',
  'UNKNOWN',
] as const

const altSourceSchema = z.object({
  url: z.string().url(),
  authority: z.enum(authorities).default('UNKNOWN'),
  label: z.string().optional(),
})

const documentSchema = z.object({
  kind: z.enum(kinds),
  title: z.string().min(1),
  description: z.string().optional(),
  sourceUrl: z.string().url(),
  origin: z.enum(origins).default('UNKNOWN'),
  publisher: z.string().optional(),
  region: z.enum(regions).default('UNKNOWN'),
  rights: z.enum(rights).default('LINK_ONLY'),
  rightsNote: z.string().optional(),
  language: z.string().default('en'),
  version: z.string().optional(),
  documentCode: z.string().optional(),
  revision: z.string().optional(),
  // Why this record is believed to exist. Required: a document with no
  // stated provenance is the thing this whole file exists to prevent.
  evidence: z.string().min(1),
  altSources: z.array(altSourceSchema).default([]),
})

const specSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  unit: z.string().optional(),
})

const modelSchema = z.object({
  modelCode: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  region: z.enum(regions).default('UNKNOWN'),
  aliases: z.array(z.string()).default([]),
  // A one-line description shown on the model page.
  summary: z.string().optional(),
  // Rated specifications. When present they replace the model's spec rows
  // on import; when absent the rows are left alone, so specs entered by
  // hand in admin survive a re-import. Every set must say where it came
  // from, for the same reason a document must.
  specs: z.array(specSchema).optional(),
  specSource: z
    .object({ url: z.string().url(), note: z.string().min(1) })
    .optional(),
  // An empty array is meaningful: the model was looked for and no
  // documentation was located. That is a recorded gap, not an omission.
  documents: z.array(documentSchema),
  note: z.string().optional(),
})

const sourcedModelSchema = modelSchema.refine((m) => !m.specs || m.specs.length === 0 || m.specSource, {
  message: 'specs need a specSource saying where they came from',
  path: ['specSource'],
})

export const manufacturerFileSchema = z.object({
  manufacturer: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
    country: z.string().optional(),
    website: z.string().url().nullable().optional(),
    supportUrl: z.string().url().nullable().optional(),
    note: z.string().optional(),
  }),
  models: z.array(sourcedModelSchema),
})

export type ManufacturerFile = z.infer<typeof manufacturerFileSchema>
export type SeedDocument = z.infer<typeof documentSchema>
export type SeedModel = z.infer<typeof modelSchema>
export type SeedSpec = z.infer<typeof specSchema>
