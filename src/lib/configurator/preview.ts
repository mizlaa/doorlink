/** OpenAI door photo preview — separate from Anthropic `isConnected('ai')`. */
export function doorPreviewAvailable(): boolean {
  const key = process.env.OPENAI_API_KEY
  return !!key && key.length > 0
}
