import { navigate } from '../router'
import { getDemo, makeReference, update } from '../demo/store'

export type RequestFormState = { error?: string }

const URGENCIES = ['EMERGENCY', 'URGENT', 'STANDARD', 'FLEXIBLE'] as const

// Demo stand-in for createLeadAction: the same checks, saved locally.
export async function createLeadAction(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const get = (k: string) => String(formData.get(k) ?? '').trim()
  if (!get('name')) return { error: 'Enter your name.' }
  if (!/^\S+@\S+\.\S+$/.test(get('email'))) return { error: 'Enter a valid email address.' }
  if (!get('title')) return { error: 'Give the job a short title.' }
  if (get('message').length < 20) return { error: 'Describe the problem in a bit more detail (at least 20 characters).' }
  const min = get('budgetMin') ? Number(get('budgetMin')) : null
  const max = get('budgetMax') ? Number(get('budgetMax')) : null
  if (min !== null && max !== null && max < min) return { error: 'The top of your budget must be at least the bottom of it.' }
  const urgency = (URGENCIES as readonly string[]).includes(get('urgency')) ? get('urgency') : 'STANDARD'
  const reference = makeReference('REQ', 6)
  const session = getDemo().session
  update((s) => {
    s.leads.unshift({
      reference,
      title: get('title'),
      description: get('message'),
      category: get('serviceCategoryId') || 'Garage doors',
      urgency: urgency === 'EMERGENCY' ? 'URGENT' : (urgency as 'STANDARD' | 'URGENT' | 'FLEXIBLE'),
      budgetFromAUD: min,
      budgetToAUD: max,
      suburb: get('suburb') || 'Liverpool',
      state: get('state') || 'NSW',
      postcode: get('postcode') || '2170',
      contactName: get('name'),
      status: 'Open',
      customerId: session?.userId ?? null,
      createdAt: new Date().toISOString(),
      responses: [],
    })
  })
  navigate(`/request-technician/thanks?ref=${encodeURIComponent(reference)}`)
  return {}
}
