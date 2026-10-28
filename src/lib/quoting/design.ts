/**
 * Design choices for products the 3D door configurator does not cover.
 * Like the configurator's options these are Doorlink's own generic
 * choices, not any manufacturer's range, and they do not change an
 * automated price: companies price by product, brand, size, motor and
 * installation. Garage doors keep using the existing configurator, whose
 * spec is stored as-is.
 */
import type { QuoteProductCategory } from '@prisma/client'
import { OPTION_GROUPS, parseSpec, describeSpec, type DoorSpec } from '@/lib/configurator/options'

export interface DesignChoice {
  id: string
  label: string
}
export interface DesignGroup {
  id: 'style' | 'leaves' | 'colour'
  label: string
  values: DesignChoice[]
}

const COLOURS: DesignChoice[] = (OPTION_GROUPS.find((g) => g.id === 'colour')?.values ?? []).map((v) => ({ id: v.id, label: v.label }))
export const colourHexFor = (id: string) => OPTION_GROUPS.find((g) => g.id === 'colour')?.values.find((v) => v.id === id)?.hex ?? '#2C3033'

const GATE_STYLES: DesignChoice[] = [
  { id: 'horizontal-slats', label: 'Horizontal slats' },
  { id: 'vertical-pickets', label: 'Vertical pickets' },
  { id: 'flat-sheet', label: 'Flat sheet' },
  { id: 'mesh', label: 'Mesh' },
]

const GROUPS: Record<Exclude<QuoteProductCategory, 'GARAGE_DOOR'>, DesignGroup[]> = {
  SLIDING_GATE: [{ id: 'style', label: 'Style', values: GATE_STYLES }],
  SWING_GATE: [
    { id: 'style', label: 'Style', values: GATE_STYLES },
    { id: 'leaves', label: 'Leaves', values: [{ id: 'double', label: 'Double (two leaves)' }, { id: 'single', label: 'Single leaf' }] },
  ],
  PEDESTRIAN_GATE: [{ id: 'style', label: 'Style', values: GATE_STYLES }],
  FENCE: [{ id: 'style', label: 'Style', values: GATE_STYLES }],
  WINDOW_SHUTTER: [{ id: 'style', label: 'Slats', values: [{ id: 'solid', label: 'Solid slats' }, { id: 'vented', label: 'Vented slats' }] }],
  SHOP_SHUTTER: [{ id: 'style', label: 'Curtain', values: [{ id: 'solid', label: 'Solid' }, { id: 'perforated', label: 'Perforated' }, { id: 'grille', label: 'Open grille' }] }],
}

export function designGroupsFor(category: QuoteProductCategory): DesignGroup[] {
  if (category === 'GARAGE_DOOR') return []
  return [...GROUPS[category], { id: 'colour', label: 'Colour', values: COLOURS }]
}

export type Design =
  | { kind: 'door'; spec: DoorSpec }
  | { kind: 'simple'; style: string; leaves?: string; colour: string }

/** Reads a design from untrusted input, falling back to defaults for anything unknown. */
export function parseDesign(category: QuoteProductCategory, raw: unknown): Design {
  if (category === 'GARAGE_DOOR') {
    const r = (raw ?? {}) as { kind?: unknown; spec?: unknown }
    return { kind: 'door', spec: parseSpec(r.kind === 'door' ? r.spec : raw) }
  }
  const r = (raw ?? {}) as Record<string, unknown>
  const groups = designGroupsFor(category)
  const pick = (id: DesignGroup['id']) => {
    const g = groups.find((x) => x.id === id)
    if (!g) return undefined
    return g.values.some((v) => v.id === r[id]) ? (r[id] as string) : g.values[0].id
  }
  const out: Design = { kind: 'simple', style: pick('style')!, colour: pick('colour') ?? 'charcoal' }
  const leaves = pick('leaves')
  if (leaves) out.leaves = leaves
  return out
}

/** The design as label/value rows, for quotes. */
export function describeDesign(category: QuoteProductCategory, raw: unknown): Array<{ label: string; value: string }> {
  const d = parseDesign(category, raw)
  if (d.kind === 'door') return describeSpec(d.spec).filter((row) => row.label !== 'Opening' && row.label !== 'Opener')
  return designGroupsFor(category).map((g) => ({ label: g.label, value: g.values.find((v) => v.id === (d as Record<string, unknown>)[g.id])?.label ?? '' }))
}
