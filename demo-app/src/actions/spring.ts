import { getDemo, makeReference } from '../demo/store'

export type SaveState = { error?: string; reference?: string }

export async function saveCalculation(_input: unknown): Promise<SaveState> {
  if (!getDemo().session) return { error: 'Sign in to save a calculation.' }
  return { reference: makeReference('SPR', 6) }
}
