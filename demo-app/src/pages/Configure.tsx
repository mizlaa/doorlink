import { useMemo } from 'react'
import { Configurator } from '@/app/configure/Configurator'
import { parseSpec } from '@/lib/configurator/options'
import { useSearchParams } from 'next/navigation'
import { useDemo } from '../demo/store'
import { SEED_MOTORS } from '../demo/data'

// src/app/configure/page.tsx: the real Configurator and 3D scenes, with
// demo motors and the demo session.
export function ConfigurePage() {
  const params = useSearchParams()
  const session = useDemo((s) => s.session)
  const raw = params.get('spec')
  const initialSpec = useMemo(() => {
    if (!raw) return undefined
    try {
      return parseSpec(JSON.parse(raw))
    } catch {
      return undefined
    }
  }, [raw])

  return (
    <div className="mx-auto w-full min-w-0 max-w-shell overflow-x-clip px-4 py-10 sm:py-14" data-demo-scene>
      <header className="mb-6 max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Design</h1>
        <p className="mt-1 text-graphite-soft">Pick a style and size, then get quotes.</p>
      </header>

      <Configurator
        key={raw ?? 'default'}
        signedIn={Boolean(session)}
        motors={SEED_MOTORS}
        initialSpec={initialSpec}
        previewAvailable
      />
    </div>
  )
}
