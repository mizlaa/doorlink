'use client'

interface AutomatedDoorsIntroProps {
  progress: number
  /** The signed-in business or person who runs this app. */
  name: string
}

export function AutomatedDoorsIntro({ progress, name }: AutomatedDoorsIntroProps) {
  const revealProgress = Math.max(0, Math.min(1, (progress - 0.54) / 0.32))

  return (
    <div
      className="garage-door-intro"
      style={{
        opacity: revealProgress,
        transform: `translate3d(0, ${12 - revealProgress * 12}px, 0)`,
      }}
      aria-hidden={revealProgress < 0.2}
    >
      <p>POWERED BY</p>
      <h2>{name.toUpperCase()}</h2>
    </div>
  )
}
