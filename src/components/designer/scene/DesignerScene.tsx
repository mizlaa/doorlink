'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Preview } from '@/lib/configurator/look-v2'
import { GarageDoorFallback } from '@/components/three/GarageDoorFallback'
import { GatePreviewFallback } from '@/components/three/GatePreviewFallback'
import { supportsThreeWebGL } from '@/components/three/webgl'
import { useSceneTextures } from '@/components/three-v2/assets'
import { useHouseMaterials } from '@/components/three-v2/materials'
import { Landscape } from '@/components/three-v2/Landscape'
import { Interior } from '@/components/three-v2/Interior'
import { RollerDoor, SectionalDoor, TiltDoor } from '@/components/three-v2/Doors'
import { doorMetres, type DoorLook } from '@/components/three-v2/GarageScene'
import { GateScene } from '@/components/three-v2/GateScene'
import { Stage } from '@/components/three-v2/Stage'
import { CameraBus, type CameraView } from '@/components/three-v2/CameraRig'
import { detectTier, TIERS, type Tier } from '@/components/three-v2/quality'
import { ModernHome, modernLayout } from './ModernHome'
import { DesignerRig, RigBus, type ViewMode } from './DesignerRig'

export { RigBus, type ViewMode } from './DesignerRig'

/**
 * The designer's viewer: the customer's design on a house, in 3D or as a
 * 2D front elevation. One scene serves both modes, so what is selected is
 * what is drawn in either.
 */

const PLACEHOLDER_VIEWS: Record<string, CameraView> = { angle: { position: [3, 2, 11], target: [0, 1.2, 0] } }

function GarageContents({ look, isOpen, tier }: { look: DoorLook; isOpen: boolean; tier: Tier }) {
  const textures = useSceneTextures()
  const m = useHouseMaterials(textures)
  const settings = TIERS[tier]
  const { W, H } = doorMetres(look)
  const layout = useMemo(() => modernLayout(W, H), [W, H])
  const Door = look.kind === 'roller' ? RollerDoor : look.kind === 'tilt' ? TiltDoor : SectionalDoor
  return (
    <group>
      <ModernHome layout={layout} m={m} />
      <Interior layout={layout} m={m} />
      <Landscape layout={layout} m={m} tufts={settings.grassTufts} foliageShadows={settings.foliageShadows} bins={false} />
      <Door key={look.kind} look={look} W={W} H={H} isOpen={isOpen} t={textures} m={m} />
    </group>
  )
}

const GarageView = memo(function GarageView({
  look,
  isOpen,
  mode,
  rigBus,
  tier,
  maxTier,
  onTier,
  paused,
  onReady,
}: {
  look: DoorLook
  isOpen: boolean
  mode: ViewMode
  rigBus: RigBus
  tier: Tier
  maxTier: Tier
  onTier: (tier: Tier) => void
  paused: boolean
  onReady: () => void
}) {
  const { W, H } = doorMetres(look)
  const stageBus = useMemo(() => new CameraBus(), [])
  return (
    <Stage
      tier={tier}
      maxTier={maxTier}
      onTier={onTier}
      paused={paused}
      bus={stageBus}
      views={PLACEHOLDER_VIEWS}
      initialView="angle"
      minDistance={3}
      maxDistance={40}
      shadowSpan={17}
      onReady={onReady}
      rig={<DesignerRig mode={mode} doorW={W} doorH={H} bus={rigBus} />}
    >
      <GarageContents look={look} isOpen={isOpen} tier={tier} />
    </Stage>
  )
})

export const DesignerScene = memo(function DesignerScene({
  preview,
  isOpen,
  mode,
  rigBus,
  onToggle,
}: {
  preview: Preview
  isOpen: boolean
  mode: ViewMode
  rigBus: RigBus
  onToggle: () => void
}) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const maxTier = useMemo<Tier>(() => detectTier(), [])
  const [tier, setTier] = useState<Tier>(maxTier)
  const [visible, setVisible] = useState(true)
  const [ready, setReady] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const gateBus = useMemo(() => new CameraBus(), [])

  useEffect(() => {
    setSupported(supportsThreeWebGL())
  }, [])

  // Stop rendering when the viewer is scrolled away or the tab is hidden.
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    let onScreen = true
    const update = () => setVisible(onScreen && document.visibilityState === 'visible')
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      update()
    })
    observer.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [supported])

  const markReady = useCallback(() => setReady(true), [])
  const scene = preview.scene
  useEffect(() => {
    setReady(false)
  }, [scene])

  // Gates, fences and shutters keep their own scene; 2D there is its front view.
  useEffect(() => {
    if (scene !== 'gate') return
    gateBus.send({ type: 'view', name: mode === '2d' ? 'front' : 'angle', duration: 0.7 })
  }, [mode, scene, gateBus])
  useEffect(() => {
    if (scene !== 'gate') return
    return rigBus.listen((command) => {
      if (command === 'reset') gateBus.send({ type: 'view', name: mode === '2d' ? 'front' : 'angle' })
      else gateBus.send({ type: 'zoom', factor: command === 'zoom-in' ? 0.78 : 1.28 })
    })
  }, [scene, rigBus, gateBus, mode])

  if (supported === false) {
    return (
      <div ref={wrapper} className="dz-scene-fallback">
        {preview.scene === 'garage' ? (
          <GarageDoorFallback isOpen={isOpen} onToggle={onToggle} look={preview.look} showControls={false} />
        ) : (
          <GatePreviewFallback look={preview.look} isOpen={isOpen} onToggle={onToggle} />
        )}
      </div>
    )
  }

  return (
    <div ref={wrapper} className="dz-scene" data-ready={ready ? 'true' : 'false'} data-mode={mode}>
      {supported &&
        (preview.scene === 'garage' ? (
          <GarageView
            look={preview.look}
            isOpen={isOpen}
            mode={mode}
            rigBus={rigBus}
            tier={tier}
            maxTier={maxTier}
            onTier={setTier}
            paused={!visible}
            onReady={markReady}
          />
        ) : (
          <GateScene
            isOpen={isOpen}
            look={preview.look}
            bus={gateBus}
            tier={tier}
            maxTier={maxTier}
            onTier={setTier}
            paused={!visible}
            onReady={markReady}
          />
        ))}
      {!ready && (
        <div className="dz-scene-loading" role="status">
          <span className="dz-scene-loading-dot" /> Loading your home…
        </div>
      )}
    </div>
  )
})
