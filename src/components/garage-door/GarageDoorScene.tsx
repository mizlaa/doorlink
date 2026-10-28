'use client'

import { AutomatedDoorsIntro } from './AutomatedDoorsIntro'
import { GarageDoorPanels } from './GarageDoorPanels'

interface GarageDoorSceneProps {
  progress: number
  /** Shown behind the door once it opens; nothing when signed out. */
  poweredBy: string | null
  isDragging: boolean
  dragHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
  }
}

/**
 * The house is a photograph; the door is not. The plate supplies the
 * architecture, planting, sky and driveway, and the four panels are real
 * elements laid over the door's exact position in it, each textured with
 * its own slice of the same photograph — so closed, the scene reads as a
 * single photo, and opening it reveals a garage behind rather than a
 * picture of a door sliding about.
 *
 * Everything sits on a stage with the plate's own aspect ratio, scaled to
 * cover the scene, so the door overlay stays registered with the photo at
 * any width; on narrow screens the sides of the plate are cropped and the
 * door stays centred.
 */
export function GarageDoorScene({ progress, isDragging, dragHandlers, poweredBy }: GarageDoorSceneProps) {
  return (
    <div
      className={`garage-door-scene ${isDragging ? 'is-dragging' : ''}`}
      {...dragHandlers}
      role="group"
      aria-label="Interactive automated garage door"
    >
      <div className="garage-door-stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, pre-sized plate; the overlay is registered to its exact pixels */}
        <img
          className="garage-door-plate"
          src="/images/simulator/exterior-1534.webp"
          srcSet="/images/simulator/exterior-960.webp 960w, /images/simulator/exterior-1534.webp 1534w"
          sizes="(min-width: 1280px) 1248px, 100vw"
          width={1534}
          height={686}
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority="high"
        />
        <div className="garage-door-opening">
          <div className="garage-door-interior" aria-hidden="true" />
          {poweredBy && <AutomatedDoorsIntro progress={progress} name={poweredBy} />}
          <GarageDoorPanels progress={progress} />
        </div>
      </div>
      <div className="garage-door-fade" aria-hidden="true" />
    </div>
  )
}
