import { parseSpec } from '@/lib/configurator/options'
import { navigate } from '../router'
import { getDemo, makeId, update } from '../demo/store'

export type ConfigurationActionState = { error?: string; savedId?: string }
export type PreviewActionState = { error?: string; imageDataUrl?: string; cached?: boolean }

export async function saveConfigurationAction(
  _prev: ConfigurationActionState,
  formData: FormData
): Promise<ConfigurationActionState> {
  if (!getDemo().session) return { error: 'Sign in to save a design.' }
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Give it a name.' }
  let spec
  try {
    spec = parseSpec(JSON.parse(String(formData.get('spec') ?? '')))
  } catch {
    return { error: 'That configuration could not be read.' }
  }
  const id = makeId('cfg')
  update((s) => {
    s.savedDesigns.unshift({ id, name, spec, createdAt: new Date().toISOString() })
  })
  return { savedId: id }
}

/**
 * Demo stand-in for the AI image: no provider is called. It returns a
 * render of the customer's own 3D design, and the page labels it a demo image.
 */
export async function generateDesignImageAction(
  _prev: PreviewActionState,
  _formData: FormData
): Promise<PreviewActionState> {
  if (!getDemo().session) return { error: 'Sign in to generate a free AI image.' }
  await new Promise((resolve) => setTimeout(resolve, 900))
  const canvas = document.querySelector<HTMLCanvasElement>('[data-demo-scene] canvas, canvas')
  if (!canvas) return { error: 'The 3D view isn’t ready yet. Try again in a moment.' }
  try {
    return { imageDataUrl: canvas.toDataURL('image/jpeg', 0.92), cached: false }
  } catch {
    return { error: 'The demo couldn’t capture the 3D view on this device.' }
  }
}

export async function startCreditPackCheckout(): Promise<void> {
  navigate('/configure')
}

export async function startCreditPackCheckoutAction(): Promise<void> {
  navigate('/configure')
}
