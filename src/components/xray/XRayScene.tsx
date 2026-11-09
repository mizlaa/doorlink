'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useSceneTextures } from '@/components/three-v2/assets'
import { useHouseMaterials } from '@/components/three-v2/materials'
import { houseLayout, WALL_T } from '@/components/three-v2/House'
import { HIGHLIGHT, SectionalDoor, sectionalLayout, type DoorPart, type Travel } from '@/components/three-v2/Doors'
import { hipRoof, wallWithOpenings, worldBox } from '@/components/three-v2/geometry'
import { Stage } from '@/components/three-v2/Stage'
import type { CameraBus, CameraView } from '@/components/three-v2/CameraRig'
import type { Tier } from '@/components/three-v2/quality'
import type { DoorLook } from '@/components/three-v2/GarageScene'

/**
 * The X-ray garage: a ghosted garage shell around the real sectional door
 * mechanism from the designer, with labelled stations and a controller
 * for the demonstrations. Illustrative, not engineering-accurate.
 */

export const W = 2.4
export const H = 2.1
const layout = houseLayout(W, H)
export const mech = sectionalLayout(W, H)
const BEAM_Z = mech.doorZ - 0.06
const BEAM_Y = 0.14

export type Demo = 'none' | 'cycle' | 'obstruction'

export interface XRayControl {
  travel: Travel
  target: number
  playing: boolean
  demo: Demo
  phase: number
  clock: number
  obstacleZ: number
  beamBroken: boolean
  moving: boolean
}

export function newControl(): XRayControl {
  return { travel: { t: 1, eased: 1 }, target: 1, playing: true, demo: 'none', phase: 0, clock: 0, obstacleZ: 2.2, beamBroken: false, moving: false }
}

const SPEED = 1 / 4.2

export const STATION_VIEWS: Record<string, CameraView> = {
  exterior: { position: [0.4, 1.6, 7.2], target: [0, 1.2, -0.6] },
  overview: { position: [4.3, 2.5, 3.9], target: [0, 1.25, -1.5] },
  springs: { position: [1.0, mech.shaftY - 0.45, mech.shaftZ - 1.7], target: [0, mech.shaftY, mech.shaftZ] },
  opener: { position: [1.9, mech.railY - 0.95, mech.railFront - mech.railLength * 0.2], target: [0, mech.railY - 0.1, mech.railFront - mech.railLength * 0.85] },
  tracks: { position: [mech.doorWidth / 2 - 1.6, mech.verticalH - 0.2, mech.doorZ - 1.7], target: [mech.doorWidth / 2, mech.verticalH + 0.15, mech.doorZ - 0.25] },
  sensors: { position: [1.5, 0.75, 1.9], target: [0.3, 0.25, BEAM_Z] },
  panels: { position: [1.3, 1.35, 3.3], target: [0, 1.05, mech.doorZ] },
}

const HOTSPOTS: Array<{ part: DoorPart; label: string; at: [number, number, number] }> = [
  { part: 'springs', label: 'Torsion springs', at: [0, mech.shaftY + 0.14, mech.shaftZ] },
  { part: 'opener', label: 'Motor & opener', at: [0, mech.railY + 0.02, mech.railFront - mech.railLength - 0.2] },
  { part: 'tracks', label: 'Tracks & rollers', at: [mech.doorWidth / 2 + 0.05, mech.verticalH + 0.25, mech.doorZ - 0.35] },
  { part: 'sensors', label: 'Safety sensors', at: [mech.doorWidth / 2 + 0.06, 0.42, BEAM_Z] },
  { part: 'panels', label: 'Door panels', at: [-mech.doorWidth / 4, 1.55, mech.doorZ + 0.06] },
]

const ghost = new THREE.MeshStandardMaterial({
  color: '#a9bdd1',
  transparent: true,
  opacity: 0.07,
  depthWrite: false,
  side: THREE.DoubleSide,
  roughness: 0.4,
})
const edgeMaterial = new THREE.LineBasicMaterial({ color: '#5A6A80', transparent: true, opacity: 0.42 })

function GhostMesh({ geometry, position, rotation }: { geometry: THREE.BufferGeometry; position: [number, number, number]; rotation?: [number, number, number] }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry])
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry} material={ghost} />
      <lineSegments geometry={edges} material={edgeMaterial} />
    </group>
  )
}

/** The garage walls and roof as glass, so the mechanism shows through. */
function GhostShell() {
  const { garageW, garageD, garageH } = layout
  const parts = useMemo(
    () => ({
      front: wallWithOpenings(garageW, garageH, WALL_T, [{ x: (garageW - W) / 2, y: 0, w: W, h: H }]),
      side: worldBox(WALL_T, garageH, garageD - WALL_T),
      back: worldBox(garageW, garageH, WALL_T),
      roof: hipRoof(garageW + 0.9, garageD + 0.9, 22.5).geometry,
    }),
    [garageW, garageD, garageH]
  )
  return (
    <group>
      <GhostMesh geometry={parts.front} position={[-garageW / 2, 0, -WALL_T]} />
      <GhostMesh geometry={parts.side} position={[garageW / 2 - WALL_T / 2, garageH / 2, -WALL_T - (garageD - WALL_T) / 2]} />
      <GhostMesh geometry={parts.side} position={[-garageW / 2 + WALL_T / 2, garageH / 2, -WALL_T - (garageD - WALL_T) / 2]} />
      <GhostMesh geometry={parts.back} position={[0, garageH / 2, -garageD + WALL_T / 2]} />
      <GhostMesh geometry={parts.roof} position={[0, garageH, -garageD / 2]} />
    </group>
  )
}

/** Photo-eye sensors either side of the opening and the beam between them. */
function Sensors({ control, highlighted }: { control: React.MutableRefObject<XRayControl>; highlighted: boolean }) {
  const beam = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    const b = beam.current
    if (!b) return
    const broken = control.current.beamBroken
    b.color.set(broken ? '#ff5a3c' : '#ffb27a')
    b.emissive.set(broken ? '#ff3b1f' : '#ff9a52')
    b.emissiveIntensity = broken ? 2.2 + Math.sin(clock.elapsedTime * 14) * 0.8 : highlighted ? 1.6 : 0.9
    b.opacity = broken ? 0.95 : highlighted ? 0.85 : 0.45
  })
  const x = mech.doorWidth / 2 + 0.06
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * x, BEAM_Y, BEAM_Z]}>
          <mesh castShadow material={highlighted ? HIGHLIGHT : undefined}>
            <boxGeometry args={[0.05, 0.07, 0.06]} />
            {!highlighted && <meshStandardMaterial color="#2b2e31" roughness={0.4} metalness={0.3} />}
          </mesh>
          <mesh position={[-side * 0.026, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.004, 16]} />
            <meshStandardMaterial color="#111" emissive="#ff6a3d" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, BEAM_Y, BEAM_Z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.004, 0.004, x * 2 - 0.05, 8]} />
        <meshStandardMaterial ref={beam} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

/** The cardboard box that wanders into the doorway in the obstruction test. */
function Obstacle({ control }: { control: React.MutableRefObject<XRayControl> }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (ref.current) {
      ref.current.position.z = control.current.obstacleZ
      ref.current.visible = control.current.obstacleZ < 2.1
    }
  })
  return (
    <mesh ref={ref} position={[0.2, 0.17, 2.2]} castShadow>
      <boxGeometry args={[0.42, 0.34, 0.36]} />
      <meshStandardMaterial color="#b98b5a" roughness={0.9} />
    </mesh>
  )
}

/** Runs the door and the demonstrations, frame by frame. */
function Driver({
  control,
  part,
  onStatus,
}: {
  control: React.MutableRefObject<XRayControl>
  part: DoorPart | null
  onStatus: (text: string) => void
}) {
  const say = useRef(onStatus)
  say.current = onStatus
  useFrame(({ clock }, delta) => {
    const c = control.current
    const dt = Math.min(delta, 0.25)
    // Selected parts glow gently; the motor glows harder while it drives.
    HIGHLIGHT.emissiveIntensity = 0.3 + Math.sin(clock.elapsedTime * 2.2) * 0.08 + (part === 'opener' && c.moving ? 0.5 : 0)
    if (!c.playing) {
      c.moving = false
      return
    }
    const before = c.travel.t
    c.travel.t += THREE.MathUtils.clamp(c.target - c.travel.t, -SPEED * dt, SPEED * dt)
    c.travel.eased = 0.5 - 0.5 * Math.cos(Math.PI * c.travel.t)
    c.moving = c.travel.t !== before
    c.clock += dt

    if (c.demo === 'cycle' && !c.moving && c.clock > 1.4) {
      c.target = c.travel.t > 0.5 ? 0 : 1
      c.clock = 0
    }

    if (c.demo === 'obstruction') {
      const next = (phase: number, text?: string) => {
        c.phase = phase
        c.clock = 0
        if (text) say.current(text)
      }
      switch (c.phase) {
        case 0: // make sure the door starts open
          c.target = 1
          if (c.travel.t >= 1 && c.clock > 0.4) {
            c.target = 0
            next(1, 'The door starts to close…')
          }
          break
        case 1: // part-way down, something rolls into the doorway
          if (c.travel.t < 0.62) next(2, 'A box is pushed into the doorway…')
          break
        case 2:
          c.obstacleZ = Math.max(-0.2, c.obstacleZ - dt * 1.9)
          if (c.obstacleZ < BEAM_Z + 0.2 && !c.beamBroken) {
            c.beamBroken = true
            c.target = c.travel.t
            next(3, 'Beam broken: the opener stops the door…')
          }
          break
        case 3: // stop, then reverse to open
          if (c.clock > 0.7) {
            c.target = 1
            next(4, '…and reverses it back to fully open. (Illustration: behaviour varies by opener.)')
          }
          break
        case 4:
          if (c.travel.t >= 1 && c.clock > 1.6) next(5, 'Clear the doorway and the beam is restored.')
          break
        case 5:
          c.obstacleZ = Math.min(2.2, c.obstacleZ + dt * 1.6)
          if (c.obstacleZ > BEAM_Z + 0.25) c.beamBroken = false
          if (c.obstacleZ >= 2.2) {
            c.demo = 'none'
            next(0)
          }
          break
      }
    }
  })
  return null
}

const thermalWarm = new THREE.MeshStandardMaterial({ color: '#e0632a', emissive: '#c2410c', emissiveIntensity: 0.55, roughness: 0.6 })
const thermalCool = new THREE.MeshStandardMaterial({ color: '#2f6fb5', emissive: '#1e4f8c', emissiveIntensity: 0.45, roughness: 0.6 })

function Contents({
  control,
  part,
  look,
  thermal,
  onSelect,
  onStatus,
}: {
  control: React.MutableRefObject<XRayControl>
  part: DoorPart | null
  look: DoorLook
  thermal: boolean
  onSelect: (part: DoorPart) => void
  onStatus: (text: string) => void
}) {
  const textures = useSceneTextures()
  const m = useHouseMaterials(textures)
  const travelRef = useMemo(() => ({ get current() { return control.current.travel }, set current(v) { control.current.travel = v } }), [control])
  const slab = useMemo(() => worldBox(layout.garageW - 0.02, 0.04, layout.garageD + 3.2), [])
  const insulated = look.insulation === 'insulated'
  return (
    <group>
      <Grid
        position={[0, 0.001, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#CFD9E3"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#B3C2D1"
        fadeDistance={22}
        fadeStrength={1.4}
        infiniteGrid
      />
      <mesh geometry={slab} material={m.slab} position={[0, -0.01, -layout.garageD / 2 + 1.6]} receiveShadow />
      <GhostShell />
      <SectionalDoor
        look={look}
        W={W}
        H={H}
        isOpen
        t={textures}
        m={m}
        travelRef={travelRef as React.MutableRefObject<Travel>}
        highlight={part}
        panelMaterial={thermal ? (insulated ? thermalCool : thermalWarm) : null}
      />
      <Sensors control={control} highlighted={part === 'sensors'} />
      <Obstacle control={control} />
      <pointLight position={[0, layout.ceiling - 0.3, -2.4]} intensity={4} distance={8} color="#fff1df" />
      <Driver control={control} part={part} onStatus={onStatus} />
      {HOTSPOTS.map((h) => (
        <Html key={h.part} position={h.at} center zIndexRange={[30, 0]}>
          <button
            type="button"
            onClick={() => onSelect(h.part)}
            className={`xray-hotspot ${part === h.part ? 'is-active' : ''}`}
            aria-label={`Show ${h.label}`}
          >
            <span className="xray-hotspot-dot" aria-hidden="true" />
            <span className="xray-hotspot-label">{h.label}</span>
          </button>
        </Html>
      ))}
    </group>
  )
}

export function XRayScene({
  bus,
  tier,
  maxTier,
  onTier,
  onReady,
  ...rest
}: {
  bus: CameraBus
  tier: Tier
  maxTier: Tier
  onTier: (tier: Tier) => void
  onReady: () => void
  control: React.MutableRefObject<XRayControl>
  part: DoorPart | null
  look: DoorLook
  thermal: boolean
  onSelect: (part: DoorPart) => void
  onStatus: (text: string) => void
}) {
  useEffect(() => () => {
    HIGHLIGHT.emissiveIntensity = 0.55
  }, [])
  return (
    <Stage
      tier={tier}
      maxTier={maxTier}
      onTier={onTier}
      paused={false}
      bus={bus}
      views={STATION_VIEWS}
      initialView="exterior"
      minDistance={0.9}
      maxDistance={11}
      shadowSpan={8}
      onReady={onReady}
      studio
    >
      <Contents {...rest} />
    </Stage>
  )
}
