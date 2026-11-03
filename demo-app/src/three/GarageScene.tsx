import { memo, useMemo } from 'react'
import { useSceneTextures } from './assets'
import { useHouseMaterials } from './materials'
import { House, houseLayout, type HouseLayout } from './House'
import { Landscape } from './Landscape'
import { Interior } from './Interior'
import { RollerDoor, SectionalDoor, TiltDoor } from './Doors'
import { Stage } from './Stage'
import { CameraBus, type CameraView, type ViewName } from './CameraRig'
import { TIERS, type Tier } from './quality'

/**
 * Demo replacement for src/components/three/GarageDoorScene.tsx: the same
 * exports, a new scene. Everything is in metres at the configured size.
 */

export type DoorKind = 'sectional' | 'roller' | 'tilt'

export interface DoorLook {
  kind: DoorKind
  finish?: string
  /** Relative to the default 2400 mm opening width. */
  widthScale: number
  /** Relative to the default 2100 mm opening height. */
  heightScale: number
  color: string
  hardwareColor: string
  panelCount: number
  profile: string
  windows: string
  roughness: number
  metalness: number
  /** The configured opening, when known (the demo's look mapping adds it). */
  widthMm?: number
  heightMm?: number
  insulation?: string
  opener?: string
}

export const DEFAULT_LOOK: DoorLook = {
  kind: 'sectional',
  finish: 'satin',
  widthScale: 1,
  heightScale: 1,
  color: '#2C3033',
  hardwareColor: '#b7bbc0',
  panelCount: 4,
  profile: 'raised',
  windows: 'top-row',
  roughness: 0.55,
  metalness: 0.16,
  widthMm: 2400,
  heightMm: 2100,
  insulation: 'backed',
  opener: 'belt',
}

export function doorMetres(look: DoorLook): { W: number; H: number } {
  const W = (look.widthMm ?? 2400 * look.widthScale) / 1000
  const H = (look.heightMm ?? 2100 * look.heightScale) / 1000
  return { W: Math.min(6, Math.max(1.8, W)), H: Math.min(3, Math.max(1.8, H)) }
}

export function garageViews(layout: HouseLayout): Record<ViewName, CameraView> {
  const { doorW: W, doorH: H, garageD } = layout
  return {
    angle: { position: [4.4 + W * 0.85, 1.9, 7.2 + W * 0.75], target: [-1.4, 1.3, -0.6] },
    front: { position: [0, 1.45, 3.9 + W * 1.05 + H * 0.6], target: [0, H * 0.52, 0] },
    side: { position: [-9.5 - W * 0.4, 2.2, 7.6 + W * 0.4], target: [-2.4, 1.3, -0.6] },
    inside: { position: [0.35, 1.6, -garageD + 0.9], target: [0, 1.25, 3] },
  }
}

function GarageContents({ look, isOpen, layout, tier }: { look: DoorLook; isOpen: boolean; layout: HouseLayout; tier: Tier }) {
  const textures = useSceneTextures()
  const m = useHouseMaterials(textures)
  const settings = TIERS[tier]
  const { doorW: W, doorH: H } = layout
  const Door = look.kind === 'roller' ? RollerDoor : look.kind === 'tilt' ? TiltDoor : SectionalDoor
  return (
    <group>
      <House layout={layout} m={m} />
      <Interior layout={layout} m={m} />
      <Landscape layout={layout} m={m} tufts={settings.grassTufts} foliageShadows={settings.foliageShadows} />
      <Door key={look.kind} look={look} W={W} H={H} isOpen={isOpen} t={textures} m={m} />
    </group>
  )
}

export const GarageScene = memo(function GarageScene({
  isOpen,
  look,
  bus,
  tier,
  maxTier,
  onTier,
  paused,
  onReady,
}: {
  isOpen: boolean
  look: DoorLook
  bus: CameraBus
  tier: Tier
  maxTier: Tier
  onTier: (tier: Tier) => void
  paused: boolean
  onReady?: () => void
}) {
  const { W, H } = doorMetres(look)
  const layout = useMemo(() => houseLayout(W, H), [W, H])
  const views = useMemo(() => garageViews(layout), [layout])
  return (
    <Stage
      tier={tier}
      maxTier={maxTier}
      onTier={onTier}
      paused={paused}
      bus={bus}
      views={views}
      initialView="angle"
      minDistance={3.4}
      maxDistance={24}
      shadowSpan={15}
      onReady={onReady}
    >
      <GarageContents look={look} isOpen={isOpen} layout={layout} tier={tier} />
    </Stage>
  )
})

/** Compatibility export with the original component's props. */
export function GarageDoorScene({ isOpen, look = DEFAULT_LOOK }: { isOpen: boolean; look?: DoorLook; revealHeadline?: string; revealWordmark?: string }) {
  const bus = useMemo(() => new CameraBus(), [])
  return <GarageScene isOpen={isOpen} look={look} bus={bus} tier="medium" maxTier="medium" onTier={() => undefined} paused={false} />
}
