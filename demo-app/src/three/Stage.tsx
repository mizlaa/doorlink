import { Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, PerformanceMonitor, Sky } from '@react-three/drei'
import { DepthOfField, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useParkEnvironment } from './assets'
import { CameraRig, type CameraBus, type CameraView, type ViewName } from './CameraRig'
import { prefersReducedMotion, stepDown, stepUp, TIERS, type Tier } from './quality'
import { windUniforms } from './wind'

/** Late-morning sun from the north-east, as an Australian street would get. */
export const SUN: [number, number, number] = [14, 17, 11]

function WindClock({ enabled }: { enabled: boolean }) {
  useFrame((_, delta) => {
    if (enabled) windUniforms.uTime.value += Math.min(delta, 0.05)
  })
  return null
}

function ToneMappingSwitch({ composer }: { composer: boolean }) {
  const { gl } = useThree()
  useEffect(() => {
    // With the effect composer the ToneMapping pass does it; without, the renderer.
    gl.toneMapping = composer ? THREE.NoToneMapping : THREE.AgXToneMapping
    gl.toneMappingExposure = 1
  }, [gl, composer])
  return null
}

function ParkLight({ intensity, rotation }: { intensity: number; rotation: number }) {
  const map = useParkEnvironment()
  if (!map) return null
  return <Environment map={map} environmentIntensity={intensity} environmentRotation={[0, rotation, 0]} />
}

export function Stage({
  tier,
  maxTier,
  onTier,
  paused,
  bus,
  views,
  initialView,
  minDistance,
  maxDistance,
  maxPolar,
  shadowSpan,
  onReady,
  focus,
  studio = false,
  children,
}: {
  tier: Tier
  maxTier: Tier
  onTier: (tier: Tier) => void
  paused: boolean
  bus: CameraBus
  views: Record<string, CameraView>
  initialView: ViewName
  minDistance: number
  maxDistance: number
  maxPolar?: number
  shadowSpan: number
  onReady?: () => void
  /** When set, a gentle depth of field keeps this point sharp and softens the background. */
  focus?: [number, number, number]
  /** A dark engineering-studio backdrop instead of the sky (the X-ray view). */
  studio?: boolean
  children: ReactNode
}) {
  const settings = TIERS[tier]
  const composer = settings.ambientOcclusion
  const reduced = useMemo(prefersReducedMotion, [])

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={settings.dpr}
      frameloop={paused ? 'never' : 'always'}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 36, near: 0.1, far: 260, position: views[initialView].position }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
      }}
    >
      <PerformanceMonitor
        flipflops={4}
        bounds={(refresh) => (refresh > 90 ? [50, 90] : [36, 55])}
        onDecline={() => onTier(stepDown(tier))}
        onIncline={() => onTier(stepUp(tier, maxTier))}
      />
      <ToneMappingSwitch composer={composer} />
      <WindClock enabled={settings.wind && !reduced} />
      <color attach="background" args={[studio ? '#0e1216' : '#cfe0ec']} />
      {!studio && <Sky sunPosition={SUN} turbidity={2.2} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.86} distance={4000} />}
      <fog attach="fog" args={studio ? ['#0e1216', 14, 34] : ['#d4e0e8', 45, 190]} />
      <ParkLight intensity={0.75} rotation={2.2} />
      <hemisphereLight args={['#e3edf5', '#5f6a4a', 0.32]} />
      <directionalLight
        key={settings.shadowMapSize}
        position={SUN}
        intensity={3.1}
        color="#fff2df"
        castShadow
        shadow-mapSize={[settings.shadowMapSize, settings.shadowMapSize]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.035}
        shadow-radius={3}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
      />
      <Suspense fallback={null}>
        {children}
        <Ready onReady={onReady} />
      </Suspense>
      {composer && (
        <EffectComposer multisampling={settings.multisampling} enableNormalPass={false}>
          <N8AO halfRes={settings.aoHalfRes} aoRadius={0.9} distanceFalloff={0.6} intensity={2.4} quality={settings.aoHalfRes ? 'performance' : 'medium'} />
          {settings.multisampling === 0 ? <SMAA /> : <></>}
          {focus ? <DepthOfField target={focus} worldFocusRange={6} bokehScale={1.6} /> : <></>}
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      )}
      <CameraRig
        bus={bus}
        views={views}
        initial={initialView}
        minDistance={minDistance}
        maxDistance={maxDistance}
        maxPolar={maxPolar}
      />
    </Canvas>
  )
}

/** Renders once everything inside the Suspense boundary has loaded. */
function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.()
  }, [onReady])
  return null
}
