/**
 * Three.js r186 renders with WebGL 2. Probe the same context the scene needs,
 * then release it so the actual Canvas can create its own context.
 */
export function supportsThreeWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    if (!context) {
      console.info('[Doorlink 3D] WebGL 2 probe returned no context.')
      return false
    }

    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch (error) {
    console.warn('[Doorlink 3D] WebGL 2 probe failed.', error)
    return false
  }
}