import './shim'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts/plex.css'
import '@/app/globals.css'
import './demo.css'
import { App } from './App'
import { installFinderApi } from './demo/catalogue'

installFinderApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Once the first page is up, fetch the 3D designer and its textures in the
// background so opening Design is quick.
window.setTimeout(() => {
  const start = () => {
    void import('@/components/three/ConfiguratorScene')
    void import('./three/assets').then((m) => m.preloadSceneAssets())
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 })
  else start()
}, 2500)
