'use client'

import { memo, useEffect, useState } from 'react'
import { GarageDoorScene, type DoorLook } from './GarageDoorScene'
import { supportsThreeWebGL } from './webgl'

/**
 * The configurator's preview.
 *
 * It reuses the homepage scene rather than a second renderer, so a colour
 * or profile added to the option list shows up in both places without
 * being implemented twice. The reveal text is empty here — this is a
 * product preview, not the marketing hero.
 */
export const ConfiguratorScene = memo(function ConfiguratorScene({ look, isOpen }: { look: DoorLook; isOpen: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    setSupported(supportsThreeWebGL())
  }, [])

  if (supported === false) {
    // Not a blank canvas and not a fake image: the chosen colour, said
    // plainly, on a device that cannot draw it.
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-rail p-6 text-center sm:aspect-[16/10]">
        <div
          aria-hidden="true"
          style={{ backgroundColor: look.color }}
          className="h-20 w-40 rounded border border-line"
        />
        <p className="text-sm text-graphite-soft">
          This device can&apos;t render the 3D preview. Your choices are still recorded below.
        </p>
      </div>
    )
  }

  return (
    <div className="relative aspect-[4/3] w-full touch-pan-y overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 via-slate-100 to-slate-200 sm:aspect-[16/10]">
      {supported === null ? (
        <div className="absolute inset-0 animate-pulse bg-slate-200/70" />
      ) : (
        <GarageDoorScene isOpen={isOpen} look={look} revealHeadline="" revealWordmark="" />
      )}
    </div>
  )
})
