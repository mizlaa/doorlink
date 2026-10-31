'use client'

import { memo, useEffect, useState } from 'react'
import type { Preview } from '@/lib/configurator/look'
import { GarageDoorScene } from './GarageDoorScene'
import { GarageDoorFallback } from './GarageDoorFallback'
import { GateScene } from './GateScene'
import { GatePreviewFallback } from './GatePreviewFallback'
import { supportsThreeWebGL } from './webgl'

/**
 * The configurator's preview.
 *
 * It reuses the homepage scene rather than a second renderer, so a colour
 * or profile added to the option list shows up in both places without
 * being implemented twice. The reveal text is empty here — this is a
 * product preview, not the marketing hero. Gates, fences and shutters
 * get their own scene, drawn at real size.
 */
export const ConfiguratorScene = memo(function ConfiguratorScene({
  preview,
  isOpen,
  onToggle,
}: {
  preview: Preview
  isOpen: boolean
  onToggle: () => void
}) {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    setSupported(supportsThreeWebGL())
  }, [])

  if (supported === false) {
    // Keep the configurator useful on browsers that cannot create WebGL2:
    // use the same live product preview, driven by the selected options.
    return preview.scene === 'garage' ? (
      <GarageDoorFallback
        isOpen={isOpen}
        onToggle={onToggle}
        look={preview.look}
        showControls={false}
        className="rounded-2xl border border-line"
      />
    ) : (
      <GatePreviewFallback look={preview.look} isOpen={isOpen} onToggle={onToggle} />
    )
  }

  return (
    <div className="relative aspect-[4/3] w-full touch-pan-y overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 via-slate-100 to-slate-200 sm:aspect-[16/10]">
      {supported === null ? (
        <div className="absolute inset-0 animate-pulse bg-slate-200/70" />
      ) : preview.scene === 'garage' ? (
        <GarageDoorScene isOpen={isOpen} look={preview.look} revealHeadline="" revealWordmark="" />
      ) : (
        <GateScene isOpen={isOpen} look={preview.look} />
      )}
    </div>
  )
})
