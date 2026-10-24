'use client'

const PANEL_COUNT = 4

/**
 * How far each panel travels when fully open, as a share of the door's
 * height. These are the original pixel travels (230px, then 12px more per
 * panel below it, over a 264px door) restated relative to the door, so
 * the motion is unchanged and the door still clears the opening at any
 * size the scene is drawn.
 */
const BASE_TRAVEL = 87.1
const TRAVEL_STEP = 4.55

interface GarageDoorPanelsProps {
  progress: number
}

export function GarageDoorPanels({ progress }: GarageDoorPanelsProps) {
  return (
    <div className="garage-door-panels" aria-hidden="true">
      {Array.from({ length: PANEL_COUNT }, (_, index) => {
        const articulation = progress * (index + 1) * 8
        const lift = progress * (BASE_TRAVEL + index * TRAVEL_STEP)
        return (
          <div
            key={index}
            className="garage-door-panel"
            style={{
              transform: `translate3d(0, -${lift.toFixed(3)}cqh, 0) rotateX(${articulation}deg)`,
            }}
          />
        )
      })}
    </div>
  )
}
