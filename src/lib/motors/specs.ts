/**
 * The motor spec vocabulary, and the rules for matching a motor to a gate
 * or a shutter.
 *
 * Motor ratings are stored as ordinary ModelSpec rows (label, value, unit)
 * so the model page can show them without knowing anything about motors.
 * The labels below are the contract between the seed data that writes
 * them and the designer that reads them back: a motor whose spec rows use
 * these labels can be recommended; one that does not is simply listed in
 * the catalogue.
 *
 * Every figure comes from a published source (stored alongside as
 * SPEC_SOURCE_LABEL), and a recommendation only ever says a motor is
 * *rated* for the job. It is a shortlist to take to an installer, not an
 * engineering sign-off: real gates add slope, wind load, friction and
 * hinge condition, and each manual says so.
 */

export const SPEC = {
  operator: 'Operator',
  maxGateWeight: 'Max gate weight',
  maxGateLength: 'Max gate length',
  maxLeafLength: 'Max leaf length',
  maxLeafWeight: 'Max leaf weight',
  leafWeightByLength: 'Leaf weight by length',
  supply: 'Supply',
  torque: 'Torque',
  torqueOptions: 'Torque options',
  liftingCapacity: 'Lifting capacity',
  thrust: 'Thrust',
  speed: 'Speed',
  openingTime: 'Opening time',
  dutyCycle: 'Duty cycle',
  protection: 'Protection',
  control: 'Control',
  motorSize: 'Motor size',
  status: 'Status',
} as const

export const SPEC_SOURCE_LABEL = 'Spec source'
export const SPEC_NOTE_LABEL = 'Spec note'

/** The values the Operator spec may take, and what each means. */
export const OPERATORS = {
  sliding: 'Sliding gate',
  swingRam: 'Swing gate — ram',
  swingArm: 'Swing gate — articulated arm',
  swingUnderground: 'Swing gate — underground',
  tubular: 'Roller shutter — tubular',
} as const

export type OperatorKind = 'sliding' | 'swing-ram' | 'swing-arm' | 'swing-underground' | 'tubular'

const OPERATOR_KIND: Record<string, OperatorKind> = {
  [OPERATORS.sliding]: 'sliding',
  [OPERATORS.swingRam]: 'swing-ram',
  [OPERATORS.swingArm]: 'swing-arm',
  [OPERATORS.swingUnderground]: 'swing-underground',
  [OPERATORS.tubular]: 'tubular',
}

export type SpecRow = { label: string; value: string; unit?: string | null }

export interface MotorCandidate {
  id: string
  slug: string
  manufacturer: string
  manufacturerSlug: string
  modelCode: string
  name: string
  operator: OperatorKind
  supply?: string
  maxGateKg?: number
  maxGateLengthM?: number
  maxLeafLengthM?: number
  maxLeafKg?: number
  /** [leaf length m, max leaf weight kg], ascending by length. */
  leafWeightTable?: Array<[number, number]>
  torqueOptionsNm?: number[]
  liftingKg?: number
}

/** The first number in a value, or undefined. "250–400" reads as 250. */
export function firstNumber(value: string): number | undefined {
  const match = value.replace(',', '.').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

/** Every number in a value: "15, 25, 40, 50" or "10–50". */
export function allNumbers(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

/** "300 kg at 2 m, 250 kg at 2.5 m" → [[2, 300], [2.5, 250]]. */
export function parseLeafWeightTable(value: string): Array<[number, number]> {
  const rows: Array<[number, number]> = []
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*at\s*(\d+(?:\.\d+)?)\s*m/gi)) {
    rows.push([Number(match[2]), Number(match[1])])
  }
  return rows.sort((a, b) => a[0] - b[0])
}

/**
 * Reads a catalogue model's spec rows into a candidate, or null when the
 * model does not say what kind of operator it is.
 */
export function motorFromModel(model: {
  id: string
  slug: string
  name: string
  modelCode: string
  manufacturer: { name: string; slug: string }
  specs: SpecRow[]
}): MotorCandidate | null {
  const get = (label: string) => model.specs.find((row) => row.label === label)?.value
  const operator = OPERATOR_KIND[get(SPEC.operator) ?? '']
  if (!operator) return null

  const num = (label: string) => {
    const value = get(label)
    return value === undefined ? undefined : firstNumber(value)
  }

  const torqueValue = get(SPEC.torqueOptions) ?? get(SPEC.torque)
  const table = get(SPEC.leafWeightByLength)

  return {
    id: model.id,
    slug: model.slug,
    manufacturer: model.manufacturer.name,
    manufacturerSlug: model.manufacturer.slug,
    modelCode: model.modelCode,
    name: model.name,
    operator,
    supply: get(SPEC.supply),
    maxGateKg: num(SPEC.maxGateWeight),
    maxGateLengthM: num(SPEC.maxGateLength),
    maxLeafLengthM: num(SPEC.maxLeafLength),
    maxLeafKg: num(SPEC.maxLeafWeight),
    leafWeightTable: table ? parseLeafWeightTable(table) : undefined,
    torqueOptionsNm: torqueValue ? allNumbers(torqueValue) : undefined,
    liftingKg: num(SPEC.liftingCapacity),
  }
}

export type MotorRequirement =
  | { kind: 'sliding'; gateKg: number; gateLengthM: number }
  | { kind: 'swing'; leafKg: number; leafLengthM: number; style: 'ram' | 'arm' | 'underground' }
  | { kind: 'tubular'; torqueNm: number; curtainKg: number }

export interface MotorMatch {
  motor: MotorCandidate
  /** Rating ÷ requirement. 1.0 is exactly at the limit. */
  headroom: number
  /** What the motor is rated for, in the terms of the requirement. */
  rating: string
  /** Set when the motor fits on length but publishes no weight rating. */
  caveat?: string
}

const STYLE_OPERATOR: Record<'ram' | 'arm' | 'underground', OperatorKind> = {
  ram: 'swing-ram',
  arm: 'swing-arm',
  underground: 'swing-underground',
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function match(requirement: MotorRequirement, motor: MotorCandidate): MotorMatch | null {
  if (requirement.kind === 'sliding') {
    if (motor.operator !== 'sliding' || motor.maxGateKg === undefined) return null
    if (motor.maxGateKg < requirement.gateKg) return null
    if (motor.maxGateLengthM !== undefined && motor.maxGateLengthM < requirement.gateLengthM) return null
    return {
      motor,
      headroom: motor.maxGateKg / requirement.gateKg,
      rating: `up to ${fmt(motor.maxGateKg)} kg`,
    }
  }

  if (requirement.kind === 'swing') {
    if (motor.operator !== STYLE_OPERATOR[requirement.style]) return null
    if (motor.maxLeafLengthM === undefined || motor.maxLeafLengthM < requirement.leafLengthM) return null

    // A weight-by-length table wins over a single figure: the rating that
    // applies is the one for the shortest listed leaf at least this long.
    let allowedKg = motor.maxLeafKg
    if (motor.leafWeightTable && motor.leafWeightTable.length > 0) {
      const row = motor.leafWeightTable.find(([length]) => length >= requirement.leafLengthM)
      if (!row) return null
      allowedKg = row[1]
    }

    if (allowedKg !== undefined) {
      if (allowedKg < requirement.leafKg) return null
      return {
        motor,
        headroom: allowedKg / requirement.leafKg,
        rating: `leaves up to ${fmt(motor.maxLeafLengthM)} m, ${fmt(allowedKg)} kg`,
      }
    }
    return {
      motor,
      headroom: motor.maxLeafLengthM / requirement.leafLengthM,
      rating: `leaves up to ${fmt(motor.maxLeafLengthM)} m`,
      caveat: 'No leaf weight rating published — confirm with the installer.',
    }
  }

  if (motor.operator !== 'tubular') return null
  const options = motor.torqueOptionsNm ?? []
  const fitting = options.filter((nm) => nm >= requirement.torqueNm).sort((a, b) => a - b)
  if (fitting.length > 0) {
    if (motor.liftingKg !== undefined && motor.liftingKg < requirement.curtainKg) return null
    return {
      motor,
      headroom: fitting[0] / requirement.torqueNm,
      rating: `${fmt(fitting[0])} Nm version`,
    }
  }
  return null
}

/**
 * Motors rated for the job, best fit first. "Best" means rated with some
 * margin but not grossly oversized: a 1500 kg operator on a 300 kg gate
 * works, but it is the wrong thing to quote first. Motors that publish a
 * weight rating rank ahead of ones that only publish a length.
 */
export function recommendMotors(
  requirement: MotorRequirement,
  motors: MotorCandidate[],
  options: { brand?: string; limit?: number } = {}
): MotorMatch[] {
  const matches = motors
    .filter((motor) => !options.brand || motor.manufacturerSlug === options.brand)
    .map((motor) => match(requirement, motor))
    .filter((m): m is MotorMatch => m !== null)

  const comfortable = (m: MotorMatch) => (m.headroom >= 1.2 ? 0 : 1)
  matches.sort(
    (a, b) =>
      Number(Boolean(a.caveat)) - Number(Boolean(b.caveat)) ||
      comfortable(a) - comfortable(b) ||
      a.headroom - b.headroom ||
      a.motor.manufacturer.localeCompare(b.motor.manufacturer) ||
      a.motor.modelCode.localeCompare(b.motor.modelCode)
  )
  return matches.slice(0, options.limit ?? 6)
}
