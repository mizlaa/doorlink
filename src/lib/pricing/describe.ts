import type { RuleTerms } from './engine'
import { motorLabel, productLabel, styleLabel } from './products'

/** "2300–2500 × 2300–2500 mm" */
export function sizeRangeLabel(
  rule: Pick<RuleTerms, 'minWidthMm' | 'maxWidthMm' | 'minHeightMm' | 'maxHeightMm'>
) {
  return `${rule.minWidthMm}–${rule.maxWidthMm} × ${rule.minHeightMm}–${rule.maxHeightMm} mm`
}

/** "Gliderol sectional garage door, motor included" — a business's own rule, in a line. */
export function describeRule(rule: RuleTerms): string {
  const style = styleLabel(rule.productStyle)
  const product = productLabel(rule.product).toLowerCase()
  const head = [rule.productBrand, style?.toLowerCase(), product].filter(Boolean).join(' ')
  const motor = rule.motorIncluded
    ? `motor included${rule.motorBrand ? ` (${motorLabel(rule.product, rule.motorBrand)})` : ''}`
    : 'no motor'
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}, ${sizeRangeLabel(rule)}, ${motor}`
}
