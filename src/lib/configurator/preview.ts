import { isDemo } from '@/lib/demo/mode'
/** OpenAI door photo preview — separate from Anthropic `isConnected('ai')`. */
export function doorPreviewAvailable(): boolean {
  // Demo: available, answered by a bundled sample image (see openai-preview).
  if (isDemo()) return true
  const key = process.env.OPENAI_API_KEY
  return !!key && key.length > 0
}
