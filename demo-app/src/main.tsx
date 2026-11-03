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
