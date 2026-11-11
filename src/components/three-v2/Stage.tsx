'use client'

import { memo, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, PerformanceMonitor, Sky } from '@react-three/drei'
import { DepthOfField, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useParkEnvironment } from './assets'
import { CameraRig, type CameraBus, type CameraView, type ViewName } from './CameraRig'
import { prefersReducedMotion, stepDown, TIERS, type Tier } from './quality'
import { windUniforms } from './wind'
import { ShadowsOnDemand, wakeShadows } from './shadows'

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
  night = false,
  blockers,
  fov = 36,
  onDemandShadows = false,
  focusFollow = false,
  haze,
  fitAspect = false,
  rig,
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
  /** Moonlight and a night sky; the scene adds its own warm lights. */
  night?: boolean
  blockers?: THREE.Box3[]
  /** Vertical field of view, set when the canvas is created. */
  fov?: number
  /** Redraw the shadow map only while the scene changes (see shadows.tsx). */
  onDemandShadows?: boolean
  /** Depth of field that keeps the orbit target sharp and softens what lies far beyond it. */
  focusFollow?: boolean
  /** Fog start and end, for a hazier, deeper background. */
  haze?: [number, number]
  fitAspect?: boolean
  /** A camera controller to use instead of the standard orbit rig (the designer's 2D/3D viewer). */
  rig?: ReactNode
  children: ReactNode
}) {
  const settings = TIERS[tier]
  // The composer stays mounted on every tier: removing it switches the
  // renderer's output path, which recompiles every material in the scene (a
  // visible freeze mid-animation). Quality tiers only toggle the AO pass.
  const composer = true
  const light = useRef<THREE.DirectionalLight>(null)
  useEffect(() => {
    // Resize the existing shadow map instead of remounting the light.
    const l = light.current
    if (!l) return
    l.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize)
    l.shadow.map?.dispose()
    ;(l.shadow as { map: THREE.WebGLRenderTarget | null }).map = null
    wakeShadows(1500)
  }, [settings.shadowMapSize])
  const reduced = useMemo(prefersReducedMotion, [])
  const dof = useRef<{ target: THREE.Vector3 | null } | null>(null)

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={settings.dpr}
      frameloop={paused ? 'never' : 'always'}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov, near: 0.1, far: 260, position: views[initialView].position }}
      onCreated={({ gl, camera }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        // Performance probe for the demo's own measurements (?perf in the URL only).
        if (window.location.search.includes('perf')) Object.assign(window, { __doorlinkGL: gl, __doorlinkCam: camera })
      }}
    >
      <PerformanceMonitor
        flipflops={4}
        bounds={(refresh) => (refresh > 90 ? [50, 90] : [36, 55])}
        onDecline={() => onTier(stepDown(tier))}
        // Quality only steps down: bouncing between tiers was itself a source of hitches.
      />
      <ToneMappingSwitch composer={composer} />
      <WindClock enabled={settings.wind && !reduced} />
      <color attach="background" args={[studio ? '#E9EEF3' : night ? '#0b1322' : '#cfe0ec']} />
      {!studio && !night && <Sky sunPosition={SUN} turbidity={2.2} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.86} distance={4000} />}
      <fog attach="fog" args={studio ? ['#E9EEF3', 14, 34] : night ? ['#0b1322', 30, 120] : ['#d9e3eb', haze?.[0] ?? 45, haze?.[1] ?? 190]} />
      <ParkLight intensity={night ? 0.07 : 0.75} rotation={2.2} />
      <hemisphereLight args={night ? ['#2c3c5c', '#0c0f12', 0.22] : ['#e3edf5', '#5f6a4a', 0.32]} />
      <directionalLight
        ref={light}
        position={night ? [-10, 18, 8] : SUN}
        intensity={night ? 0.32 : 3.1}
        color={night ? '#a9bde6' : '#fff2df'}
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
        {onDemandShadows && <ShadowsOnDemand tier={tier} />}
        <Ready onReady={onReady} />
      </Suspense>
      {composer && <Effects settings={settings} focus={focus} focusFollow={focusFollow} dof={dof} />}
      {focusFollow && <FollowFocus effect={dof} />}
      {rig ?? (
        <CameraRig
          bus={bus}
          views={views}
          initial={initialView}
          minDistance={minDistance}
          maxDistance={maxDistance}
          maxPolar={maxPolar}
          blockers={blockers}
          fitAspect={fitAspect}
        />
      )}
    </Canvas>
  )
}

/**
 * The post-processing chain, memoised: the scene's own state changes (every
 * intro scene, every door) re-render the Stage, and an unmemoised composer
 * would rebuild its effect pass each time — a hitch on every transition.
 */
const DOF_ORIGIN: [number, number, number] = [0, 0, 0]
const Effects = memo(function Effects({
  settings,
  focus,
  focusFollow,
  dof,
}: {
  settings: (typeof TIERS)[Tier]
  focus?: [number, number, number]
  focusFollow: boolean
  dof: React.MutableRefObject<{ target: THREE.Vector3 | null } | null>
}) {
  return (
    <EffectComposer multisampling={settings.multisampling} enableNormalPass={false}>
      {settings.ambientOcclusion ? <N8AO halfRes={settings.aoHalfRes} aoRadius={0.9} distanceFalloff={0.6} intensity={2.4} quality={settings.aoHalfRes ? 'performance' : 'medium'} /> : <></>}
      {settings.multisampling === 0 ? <SMAA /> : <></>}
      {focus ? (
        <DepthOfField target={focus} worldFocusRange={6} bokehScale={1.6} />
      ) : focusFollow && settings.ambientOcclusion ? (
        <DepthOfField ref={dof as never} target={DOF_ORIGIN} worldFocusRange={26} bokehScale={2.4} />
      ) : (
        <></>
      )}
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
})

/** Renders once everything inside the Suspense boundary has loaded. */
function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.()
  }, [onReady])
  return null
}

/** Keeps the depth-of-field focus on the orbit target as the camera moves. */
function FollowFocus({ effect }: { effect: React.MutableRefObject<{ target: THREE.Vector3 | null } | null> }) {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null
  useFrame(() => {
    const e = effect.current
    if (!e || !controls) return
    if (!e.target) e.target = new THREE.Vector3()
    e.target.copy(controls.target)
  })
  return null
}
