import { describeSpec, type DoorSpec } from './options'

/**
 * Text sent to the image edit API. Built from the same labels as the
 * specification summary so a roller door never mentions windows.
 */
export function doorPreviewPrompt(spec: DoorSpec): string {
  const summary = describeSpec(spec)
    .map((row) => `${row.label}: ${row.value}`)
    .join('; ')

  return [
    'Edit this photo of a residential garage or building front.',
    'Replace or add the garage door to match this generic specification (not any real manufacturer product):',
    summary + '.',
    'Keep the house, driveway, lighting, and camera angle realistic.',
    'Photorealistic result. Do not add logos or brand names.',
  ].join(' ')
}
