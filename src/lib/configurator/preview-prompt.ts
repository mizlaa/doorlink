import { describeSpec, type DoorSpec } from './options'

/** Extra instructions the customer can add to a photo preview. */
export const PREVIEW_NOTE_MAX_WORDS = 200

export function previewNoteWordCount(note: string): number {
  const trimmed = note.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Text sent to the image edit API. Built from the same labels as the
 * specification summary so a roller door never mentions windows.
 */
export function doorPreviewPrompt(spec: DoorSpec, note?: string): string {
  const summary = describeSpec(spec)
    .map((row) => `${row.label}: ${row.value}`)
    .join('; ')

  const lines = [
    'Edit this photo of a residential garage or building front.',
    'Replace or add the garage door to match this generic specification (not any real manufacturer product):',
    summary + '.',
    'Keep the house, driveway, lighting, and camera angle realistic.',
    'Photorealistic result. Do not add logos or brand names.',
  ]

  const extra = note?.trim()
  if (extra && previewNoteWordCount(extra) <= PREVIEW_NOTE_MAX_WORDS) {
    lines.push(`Also follow these notes from the customer: ${extra}`)
  }

  return lines.join(' ')
}
