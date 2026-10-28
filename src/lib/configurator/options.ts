/**
 * The door configurator's option vocabulary.
 *
 * An important boundary: these are **Doorlink's generic options**, not any
 * manufacturer's range. Nobody's real colour names, finish codes or panel
 * profiles are reproduced here, because inventing a manufacturer's
 * specification — or half-remembering one — would put a claim in front of
 * a customer that the manufacturer never made. Every surface that renders
 * this says so.
 *
 * It is data, not code: adding a style, a colour or a whole new product
 * type is an entry in this file (and later, a row in the database), not a
 * rewrite of the configurator. `ProductType` is what makes gates and
 * shutters additive rather than a second implementation.
 */

export type ProductType =
  | 'sectional'
  | 'roller'
  | 'tilt'
  | 'sliding-gate'
  | 'swing-gate'
  | 'pedestrian-gate'
  | 'fence'
  | 'window-shutter'

/** What the customer is designing, before which kind of it. */
export type ProductFamily = 'garage' | 'gate' | 'fence' | 'shutter'

export const PRODUCT_FAMILIES: Array<{ id: ProductFamily; label: string; types: ProductType[] }> = [
  { id: 'garage', label: 'Garage door', types: ['sectional', 'roller', 'tilt'] },
  { id: 'gate', label: 'Gate', types: ['sliding-gate', 'swing-gate', 'pedestrian-gate'] },
  { id: 'fence', label: 'Fence', types: ['fence'] },
  { id: 'shutter', label: 'Shutter', types: ['window-shutter'] },
]

export function familyOf(productType: ProductType): ProductFamily {
  return PRODUCT_FAMILIES.find((family) => family.types.includes(productType))?.id ?? 'garage'
}

const GARAGE: ProductType[] = ['sectional', 'roller', 'tilt']
const GATES: ProductType[] = ['sliding-gate', 'swing-gate', 'pedestrian-gate']
const MOTORISED_GATES: ProductType[] = ['sliding-gate', 'swing-gate', 'pedestrian-gate']

export interface OptionValue {
  id: string
  label: string
  /** Rendered as a swatch when present; also what the 3D preview uses. */
  hex?: string
  description?: string
  /** Which product types this value applies to. Absent means all of them. */
  only?: ProductType[]
}

export interface OptionGroup {
  id: string
  label: string
  help?: string
  values: OptionValue[]
  /** Absent means the group applies to every product type. */
  only?: ProductType[]
}

export const PRODUCT_TYPES: OptionValue[] = [
  {
    id: 'sectional',
    label: 'Sectional',
    description: 'Hinged panels that lift and run back along the ceiling. The most common on new homes.',
  },
  {
    id: 'roller',
    label: 'Roller',
    description: 'A single curtain that rolls into a drum above the opening. Good where headroom is tight.',
  },
  {
    id: 'tilt',
    label: 'Tilt',
    description: 'One rigid panel that tilts up and out. Common on older houses and single garages.',
  },
  {
    id: 'sliding-gate',
    label: 'Sliding gate',
    description: 'One leaf that runs sideways on a ground track. Needs clear wall alongside, not swing room.',
  },
  {
    id: 'swing-gate',
    label: 'Swing gate',
    description: 'One or two leaves on hinges. Needs clear, fairly level ground for the leaves to swing over.',
  },
  {
    id: 'pedestrian-gate',
    label: 'Pedestrian gate',
    description: 'A single walk-through leaf, usually 900–1100 mm wide. Pool gates must self-close.',
  },
  {
    id: 'fence',
    label: 'Fence',
    description: 'A run of panels between posts, in the same infill as the gate so the two match.',
  },
  {
    id: 'window-shutter',
    label: 'Roller shutter',
    description: 'An aluminium curtain that rolls into a box above the window, for security, shade and noise.',
  },
]

export const OPTION_GROUPS: OptionGroup[] = [
  {
    id: 'colour',
    label: 'Colour',
    help: 'Indicative colours, not a manufacturer’s range.',
    values: [
      { id: 'charcoal', label: 'Charcoal', hex: '#2C3033' },
      { id: 'slate', label: 'Slate grey', hex: '#585E63' },
      { id: 'pewter', label: 'Pewter', hex: '#8A9098' },
      { id: 'chalk', label: 'Chalk white', hex: '#E8E6E1' },
      { id: 'sand', label: 'Sand', hex: '#C8BBA4' },
      { id: 'ironbark', label: 'Ironbark', hex: '#3E3A34' },
      { id: 'forest', label: 'Deep forest', hex: '#2E4034' },
      { id: 'oxide', label: 'Oxide red', hex: '#6E3A32' },
      { id: 'black', label: 'Satin black', hex: '#1F2124' },
    ],
  },
  {
    id: 'finish',
    label: 'Finish',
    values: [
      { id: 'matte', label: 'Matte', description: 'Low sheen. Hides marks and dust best.' },
      { id: 'satin', label: 'Satin', description: 'A soft sheen — the usual choice.' },
      { id: 'gloss', label: 'Gloss', description: 'High sheen. Shows the panel profile most.' },
      { id: 'woodgrain', label: 'Woodgrain', description: 'Textured, timber-look surface.' },
    ],
  },
  {
    id: 'panelProfile',
    label: 'Panel profile',
    only: ['sectional', 'tilt'],
    values: [
      { id: 'flush', label: 'Flush', description: 'Flat face, no stamping. The cleanest look.' },
      { id: 'raised', label: 'Raised panel', description: 'Classic stamped rectangles.' },
      { id: 'ribbed', label: 'Ribbed', description: 'Repeating horizontal lines.' },
    ],
  },
  {
    id: 'panelCount',
    label: 'Sections',
    only: ['sectional'],
    values: [
      { id: '3', label: '3 sections' },
      { id: '4', label: '4 sections' },
      { id: '5', label: '5 sections' },
    ],
  },
  {
    id: 'windows',
    label: 'Windows',
    only: ['sectional', 'tilt'],
    values: [
      { id: 'none', label: 'None' },
      { id: 'top-row', label: 'Top row', description: 'Glazing across the top section.' },
      { id: 'top-row-wide', label: 'Wide top row', description: 'Full-width glazing across the top.' },
    ],
  },
  {
    id: 'infill',
    label: 'Infill',
    only: [...GATES, 'fence'],
    values: [
      {
        id: 'slats',
        label: 'Horizontal slats',
        description: 'Closed-up slats. Private, and the usual modern look.',
      },
      {
        id: 'spaced-slats',
        label: 'Spaced slats',
        description: 'Slats with a gap between. Lets light and air through.',
      },
      { id: 'pickets', label: 'Vertical pickets', description: 'Tubular uprights. Open, and hard to climb.' },
      { id: 'solid', label: 'Solid sheet', description: 'One flat face. Most privacy, and most wind load.' },
    ],
  },
  {
    id: 'material',
    label: 'Material',
    help: 'Sets the weight estimate the motor is matched against.',
    only: [...GATES, 'fence'],
    values: [
      { id: 'aluminium', label: 'Aluminium', description: 'Light and rust-free. About 10–12 kg per m².' },
      {
        id: 'tubular-steel',
        label: 'Tubular steel',
        description: 'Stronger frame, heavier. About 15–25 kg per m².',
      },
      { id: 'solid-steel', label: 'Solid steel', description: 'Heaviest and toughest. About 40–50 kg per m².' },
    ],
  },
  {
    id: 'leaves',
    label: 'Leaves',
    only: ['swing-gate'],
    values: [
      {
        id: '2',
        label: 'Double',
        description: 'Two leaves meeting in the middle. Each swings half the width.',
      },
      { id: '1', label: 'Single', description: 'One leaf across the whole opening. Needs more swing room.' },
    ],
  },
  {
    id: 'slat',
    label: 'Slat size',
    only: ['window-shutter'],
    values: [
      { id: '39', label: '39 mm slats', description: 'Smaller box. Suits most house windows.' },
      { id: '55', label: '55 mm slats', description: 'Stronger curtain for wide windows and doors.' },
    ],
  },
  {
    id: 'hardware',
    label: 'Hardware',
    only: [...GARAGE, ...GATES],
    values: [
      { id: 'brushed', label: 'Brushed steel', hex: '#B7BBC0' },
      { id: 'black', label: 'Matte black', hex: '#2A2C2E' },
      { id: 'chrome', label: 'Chrome', hex: '#D8DCE0' },
    ],
  },
  {
    id: 'insulation',
    label: 'Insulation',
    only: GARAGE,
    values: [
      { id: 'none', label: 'None' },
      { id: 'backed', label: 'Backed', description: 'A bonded backing layer. Quieter, a little warmer.' },
      {
        id: 'insulated',
        label: 'Fully insulated',
        description: 'Foam-filled sections. Best for a garage you use as a room.',
      },
    ],
  },
  {
    id: 'opener',
    label: 'Opener',
    only: GARAGE,
    values: [
      { id: 'none', label: 'Keep my existing opener' },
      {
        id: 'belt',
        label: 'Belt drive',
        description: 'Quietest. Usual choice where a bedroom adjoins the garage.',
      },
      { id: 'chain', label: 'Chain drive', description: 'Cheaper and hard-wearing, but louder.' },
      { id: 'direct', label: 'Direct drive', description: 'Motor travels on the rail. Few moving parts.' },
    ],
  },
  {
    id: 'operation',
    label: 'Operation',
    only: MOTORISED_GATES,
    values: [
      { id: 'motorised', label: 'Motorised', description: 'Opens from a remote, keypad or phone.' },
      { id: 'manual', label: 'Manual', description: 'Opened by hand, with a latch or lock.' },
    ],
  },
  {
    id: 'swingMotor',
    label: 'Motor style',
    only: ['swing-gate', 'pedestrian-gate'],
    values: [
      { id: 'ram', label: 'Ram', description: 'A straight actuator from post to leaf. The usual choice.' },
      {
        id: 'arm',
        label: 'Articulated arm',
        description: 'Folding arm for wide pillars where a ram will not fit.',
      },
      {
        id: 'underground',
        label: 'Underground',
        description: 'Hidden in a box under the hinge. Nothing on show.',
      },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    only: ['window-shutter'],
    values: [
      {
        id: 'radio',
        label: 'Remote',
        description: 'A radio motor with a hand-held remote or wall transmitter.',
      },
      { id: 'switch', label: 'Wall switch', description: 'A wired motor on an up/down switch.' },
      { id: 'manual', label: 'Manual', description: 'A strap or crank winder. No motor.' },
    ],
  },
  {
    id: 'motorBrand',
    label: 'Motor brand',
    help: 'Matched against each motor’s published rating.',
    only: [...MOTORISED_GATES, 'window-shutter'],
    values: [
      { id: 'any', label: 'Best match' },
      { id: 'beninca', label: 'Benincà', only: GATES },
      { id: 'bft', label: 'BFT', only: GATES },
      { id: 'dea', label: 'DEA', only: GATES },
      { id: 'faac', label: 'FAAC', only: GATES },
      { id: 'grifco', label: 'Grifco', only: GATES },
      { id: 'merlin', label: 'Merlin', only: GATES },
      { id: 'nice', label: 'Nice' },
      { id: 'cw-products', label: 'CW Products', only: ['window-shutter'] },
      { id: 'maxim', label: 'Maxim', only: ['window-shutter'] },
      { id: 'simu', label: 'SIMU', only: ['window-shutter'] },
      { id: 'somfy', label: 'Somfy', only: ['window-shutter'] },
    ],
  },
]

export type DoorSpec = {
  productType: ProductType
  colour: string
  finish: string
  panelProfile: string
  panelCount: string
  windows: string
  hardware: string
  insulation: string
  opener: string
  infill: string
  material: string
  leaves: string
  slat: string
  operation: string
  swingMotor: string
  control: string
  motorBrand: string
  widthMm: number
  heightMm: number
}

export const DEFAULT_SPEC: DoorSpec = {
  productType: 'sectional',
  colour: 'charcoal',
  finish: 'satin',
  panelProfile: 'raised',
  panelCount: '4',
  windows: 'top-row',
  hardware: 'brushed',
  insulation: 'backed',
  opener: 'belt',
  infill: 'slats',
  material: 'aluminium',
  leaves: '2',
  slat: '39',
  operation: 'motorised',
  swingMotor: 'ram',
  control: 'radio',
  motorBrand: 'any',
  // A single-car opening, which is the most common thing to be
  // replacing. Millimetres because that is what the trade quotes in.
  widthMm: 2400,
  heightMm: 2100,
}

export const SIZE_LIMITS = {
  widthMm: { min: 1800, max: 6000, step: 10 },
  heightMm: { min: 1800, max: 3000, step: 10 },
} as const

type SizeRange = { min: number; max: number; step: number; default: number }

/**
 * Size ranges for everything that is not a garage door. Typical sizes are
 * a sliding gate 3–5 m wide and 1.8–2 m tall, a pair of swing leaves up to
 * about 3.6 m, a pedestrian gate 900–1100 mm wide (a pool gate at least
 * 1200 mm tall), and a window anywhere from a toilet to a sliding door.
 * The ranges are wider than typical so an unusual job can still be drawn.
 */
const SIZES: Record<
  Exclude<ProductType, 'sectional' | 'roller' | 'tilt'>,
  { widthMm: SizeRange; heightMm: SizeRange }
> = {
  'sliding-gate': {
    widthMm: { min: 2000, max: 12000, step: 10, default: 4000 },
    heightMm: { min: 900, max: 2400, step: 10, default: 1800 },
  },
  'swing-gate': {
    widthMm: { min: 1000, max: 8000, step: 10, default: 3600 },
    heightMm: { min: 900, max: 2400, step: 10, default: 1800 },
  },
  'pedestrian-gate': {
    widthMm: { min: 800, max: 1500, step: 10, default: 1000 },
    heightMm: { min: 900, max: 2400, step: 10, default: 1800 },
  },
  fence: {
    widthMm: { min: 1000, max: 30000, step: 100, default: 6000 },
    heightMm: { min: 600, max: 2400, step: 10, default: 1800 },
  },
  'window-shutter': {
    widthMm: { min: 400, max: 4000, step: 10, default: 1200 },
    heightMm: { min: 400, max: 3000, step: 10, default: 1500 },
  },
}

export function sizeLimitsFor(productType: ProductType): {
  widthMm: { min: number; max: number; step: number }
  heightMm: { min: number; max: number; step: number }
} {
  return familyOf(productType) === 'garage' ? SIZE_LIMITS : SIZES[productType as keyof typeof SIZES]
}

export function defaultSizeFor(productType: ProductType): { widthMm: number; heightMm: number } {
  if (familyOf(productType) === 'garage')
    return { widthMm: DEFAULT_SPEC.widthMm, heightMm: DEFAULT_SPEC.heightMm }
  const sizes = SIZES[productType as keyof typeof SIZES]
  return { widthMm: sizes.widthMm.default, heightMm: sizes.heightMm.default }
}

/** What a gate is usually bought as: a pedestrian gate on a latch, a drive gate motorised. */
const TYPE_DEFAULTS: Partial<Record<ProductType, Partial<DoorSpec>>> = {
  'pedestrian-gate': { operation: 'manual' },
  'sliding-gate': { operation: 'motorised' },
  'swing-gate': { operation: 'motorised' },
}

/**
 * Switches a spec to another product type. Within a family the size
 * carries over (clamped); across families it resets, because a garage
 * door's 2400 mm is not a sensible starting point for a window. Colour
 * and finish always carry over — they are the customer's taste, not the
 * product's.
 */
export function specForType(spec: DoorSpec, productType: ProductType): DoorSpec {
  const sameFamily = familyOf(spec.productType) === familyOf(productType)
  const limits = sizeLimitsFor(productType)
  const size = sameFamily
    ? {
        widthMm: Math.min(limits.widthMm.max, Math.max(limits.widthMm.min, spec.widthMm)),
        heightMm: Math.min(limits.heightMm.max, Math.max(limits.heightMm.min, spec.heightMm)),
      }
    : defaultSizeFor(productType)
  const next = { ...spec, ...TYPE_DEFAULTS[productType], productType, ...size }
  // A brand that does not make this kind of motor falls back to the best match.
  const brandFits = groupsFor(productType)
    .find((group) => group.id === 'motorBrand')
    ?.values.some((value) => value.id === next.motorBrand)
  return brandFits === false ? { ...next, motorBrand: 'any' } : next
}

export function groupsFor(productType: ProductType): OptionGroup[] {
  return OPTION_GROUPS.filter((group) => !group.only || group.only.includes(productType)).map((group) => ({
    ...group,
    values: group.values.filter((value) => !value.only || value.only.includes(productType)),
  }))
}

export function optionLabel(groupId: string, valueId: string): string {
  const group = OPTION_GROUPS.find((candidate) => candidate.id === groupId)
  return group?.values.find((value) => value.id === valueId)?.label ?? valueId
}

export function colourHex(colourId: string): string {
  return OPTION_GROUPS.find((g) => g.id === 'colour')?.values.find((v) => v.id === colourId)?.hex ?? '#2C3033'
}

export function hardwareHex(hardwareId: string): string {
  return (
    OPTION_GROUPS.find((g) => g.id === 'hardware')?.values.find((v) => v.id === hardwareId)?.hex ?? '#B7BBC0'
  )
}

/**
 * Reads a stored spec back, replacing anything unrecognised with the
 * default rather than trusting it. Stored specs are JSON and outlive the
 * option list that produced them: a colour retired next year must not
 * break a configuration somebody saved this year.
 */
export function parseSpec(raw: unknown): DoorSpec {
  const input = (raw ?? {}) as Partial<Record<keyof DoorSpec, unknown>>

  const productType = PRODUCT_TYPES.some((type) => type.id === input.productType)
    ? (input.productType as ProductType)
    : DEFAULT_SPEC.productType

  const pick = (groupId: string, fallback: string): string => {
    const group = OPTION_GROUPS.find((candidate) => candidate.id === groupId)
    const value = input[groupId as keyof DoorSpec]
    return typeof value === 'string' && group?.values.some((option) => option.id === value) ? value : fallback
  }

  const limits = sizeLimitsFor(productType)
  const defaults = defaultSizeFor(productType)

  const clamp = (value: unknown, limits: { min: number; max: number }, fallback: number) => {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.min(limits.max, Math.max(limits.min, Math.round(numeric)))
  }

  return {
    productType,
    colour: pick('colour', DEFAULT_SPEC.colour),
    finish: pick('finish', DEFAULT_SPEC.finish),
    panelProfile: pick('panelProfile', DEFAULT_SPEC.panelProfile),
    panelCount: pick('panelCount', DEFAULT_SPEC.panelCount),
    windows: pick('windows', DEFAULT_SPEC.windows),
    hardware: pick('hardware', DEFAULT_SPEC.hardware),
    insulation: pick('insulation', DEFAULT_SPEC.insulation),
    opener: pick('opener', DEFAULT_SPEC.opener),
    infill: pick('infill', DEFAULT_SPEC.infill),
    material: pick('material', DEFAULT_SPEC.material),
    leaves: pick('leaves', DEFAULT_SPEC.leaves),
    slat: pick('slat', DEFAULT_SPEC.slat),
    operation: pick('operation', TYPE_DEFAULTS[productType]?.operation ?? DEFAULT_SPEC.operation),
    swingMotor: pick('swingMotor', DEFAULT_SPEC.swingMotor),
    control: pick('control', DEFAULT_SPEC.control),
    motorBrand: pick('motorBrand', DEFAULT_SPEC.motorBrand),
    widthMm: clamp(input.widthMm, limits.widthMm, defaults.widthMm),
    heightMm: clamp(input.heightMm, limits.heightMm, defaults.heightMm),
  }
}

/** A spec written out the way a person would read it to a technician. */
export function describeSpec(spec: DoorSpec): Array<{ label: string; value: string }> {
  const family = familyOf(spec.productType)
  if (family !== 'garage') return describeOutdoor(spec, family)

  const type = PRODUCT_TYPES.find((candidate) => candidate.id === spec.productType)
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Door type', value: type?.label ?? spec.productType },
    { label: 'Opening', value: `${spec.widthMm} × ${spec.heightMm} mm` },
    { label: 'Colour', value: optionLabel('colour', spec.colour) },
    { label: 'Finish', value: optionLabel('finish', spec.finish) },
  ]

  if (spec.productType !== 'roller') {
    rows.push({ label: 'Panel profile', value: optionLabel('panelProfile', spec.panelProfile) })
    rows.push({ label: 'Windows', value: optionLabel('windows', spec.windows) })
  }
  if (spec.productType === 'sectional') {
    rows.push({ label: 'Sections', value: optionLabel('panelCount', spec.panelCount) })
  }

  rows.push({ label: 'Hardware', value: optionLabel('hardware', spec.hardware) })
  rows.push({ label: 'Insulation', value: optionLabel('insulation', spec.insulation) })
  rows.push({ label: 'Opener', value: optionLabel('opener', spec.opener) })
  return rows
}

function describeOutdoor(
  spec: DoorSpec,
  family: Exclude<ProductFamily, 'garage'>
): Array<{ label: string; value: string }> {
  const type = PRODUCT_TYPES.find((candidate) => candidate.id === spec.productType)
  const typeLabel = type?.label ?? spec.productType
  const has = (groupId: string) => groupsFor(spec.productType).some((group) => group.id === groupId)
  const rows: Array<{ label: string; value: string }> = []

  if (family === 'fence') {
    rows.push({ label: 'Fence', value: typeLabel })
    rows.push({ label: 'Run', value: `${spec.widthMm} mm long × ${spec.heightMm} mm high` })
  } else if (family === 'shutter') {
    rows.push({ label: 'Shutter', value: typeLabel })
    rows.push({ label: 'Window', value: `${spec.widthMm} × ${spec.heightMm} mm` })
  } else {
    rows.push({ label: 'Gate type', value: typeLabel })
    rows.push({ label: 'Opening', value: `${spec.widthMm} × ${spec.heightMm} mm` })
  }

  rows.push({ label: 'Colour', value: optionLabel('colour', spec.colour) })
  rows.push({ label: 'Finish', value: optionLabel('finish', spec.finish) })

  const groupRow = (groupId: keyof DoorSpec, label: string) => {
    if (has(groupId)) rows.push({ label, value: optionLabel(groupId, String(spec[groupId])) })
  }
  groupRow('leaves', 'Leaves')
  groupRow('infill', 'Infill')
  groupRow('material', 'Material')
  groupRow('slat', 'Slat size')
  groupRow('hardware', 'Hardware')
  groupRow('operation', 'Operation')
  groupRow('control', 'Control')

  if (isMotorised(spec)) {
    if (has('swingMotor'))
      rows.push({ label: 'Motor style', value: optionLabel('swingMotor', spec.swingMotor) })
    rows.push({ label: 'Motor brand', value: optionLabel('motorBrand', spec.motorBrand) })
  }
  return rows
}

/** Whether this spec needs a motor at all. */
export function isMotorised(spec: DoorSpec): boolean {
  const family = familyOf(spec.productType)
  if (family === 'gate') return spec.operation === 'motorised'
  if (family === 'shutter') return spec.control !== 'manual'
  return false
}

/** The same thing as a paragraph, for prefilling a job request. */
export function specAsBrief(spec: DoorSpec): string {
  return describeSpec(spec)
    .map((row) => `${row.label}: ${row.value}`)
    .join('\n')
}
