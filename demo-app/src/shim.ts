// Runs before anything else in the demo.
//
// 1. A few shared modules read process.env; give them a browser-safe one.
// 2. Keep the 3D view's last frame readable, so the "AI photo" panel can
//    show a render of the customer's own design without calling any AI
//    service. The real app's components are not changed for this.
;(globalThis as unknown as { process: { env: Record<string, string> } }).process = {
  env: { NODE_ENV: 'production', DOORLINK_DEMO: 'true', NEXT_PUBLIC_SITE_URL: window.location.origin },
}

const originalGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attributes?: unknown) {
  if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
    const attrs = { ...((attributes as object | undefined) ?? {}), preserveDrawingBuffer: true }
    return (originalGetContext as (t: string, a?: unknown) => RenderingContext | null).call(this, type, attrs)
  }
  return (originalGetContext as (t: string, a?: unknown) => RenderingContext | null).call(this, type, attributes)
} as typeof HTMLCanvasElement.prototype.getContext

export {}
