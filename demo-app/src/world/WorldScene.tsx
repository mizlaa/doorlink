import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SceneMaterialsProvider } from '@/components/three/SceneMaterials'
import { useSceneTextures } from '../three/assets'
import { useHouseMaterials, type HouseMaterials } from '../three/materials'
import { House, houseLayout, NeighbourHouse } from '../three/House'
import { FRONT_BOUNDARY, Landscape } from '../three/Landscape'
import { Interior } from '../three/Interior'
import { SectionalDoor, type Travel } from '../three/Doors'
import { FenceRun, Pillar, SlidingGate, SwingGate, usePanelMaterial, type GateInfill, type GateLook } from '../three/GateScene'
import { DEFAULT_LOOK, type DoorLook } from '../three/GarageScene'
import { addGumTree, addShrub, emptyPlantSet, Plants } from '../three/Plants'
import { Stage } from '../three/Stage'
import type { CameraBus, CameraView } from '../three/CameraRig'
import { TIERS, type Tier } from '../three/quality'
import { MergeStatic } from '../three/merge'
import { seeded } from '../three/geometry'
import { wakeShadows } from '../three/shadows'

/**
 * Doorlink World: one suburban block with every product on it — the
 * sectional garage door, a sliding driveway gate, a pedestrian gate, the
 * perimeter fence and window roller shutters — built from the designer's
 * own house, landscape, door and gate parts. Products install with short
 * "fitted in place" moves, then operate when tapped.
 */

export type Product = 'garage' | 'gate' | 'pedestrian' | 'shutters' | 'fence'

export interface FenceStyle {
  id: string
  label: string
  infill: GateInfill
  color: string
  finish: 'satin' | 'woodgrain'
}

export const FENCE_STYLES: FenceStyle[] = [
  { id: 'charcoal', label: 'Charcoal slats', infill: 'slats', color: '#2d3236', finish: 'satin' },
  { id: 'timber', label: 'Timber-look slats', infill: 'spaced-slats', color: '#7a5536', finish: 'woodgrain' },
  { id: 'pickets', label: 'Pale pickets', infill: 'pickets', color: '#e4e1d9', finish: 'satin' },
  { id: 'solid', label: 'Solid grey', infill: 'solid', color: '#6c7175', finish: 'satin' },
]

export interface WorldState {
  /** Bumped to snap every animation straight to its target (replay, skip). */
  epoch: number
  upgraded: { garage: boolean; gate: boolean; fence: boolean; shutters: boolean }
  open: { garage: boolean; gate: boolean; pedestrian: boolean; shutters: boolean }
  night: boolean
  fence: FenceStyle
  selected: Product | null
  inspect: Product | null
  interactive: boolean
}

export const BEFORE: Omit<WorldState, 'epoch' | 'night' | 'fence' | 'selected' | 'inspect'> = {
  upgraded: { garage: false, gate: false, fence: false, shutters: false },
  open: { garage: false, gate: false, pedestrian: false, shutters: true },
  interactive: false,
}
export const AFTER: typeof BEFORE = {
  upgraded: { garage: true, gate: true, fence: true, shutters: true },
  open: { garage: true, gate: true, pedestrian: true, shutters: true },
  interactive: true,
}

const W = 2.4
const H = 2.1
const layout = houseLayout(W, H)
const FB = FRONT_BOUNDARY
const houseX0 = -layout.garageW / 2 - layout.houseW
const rightFence = layout.garageW / 2 + 1.35
const leftFence = houseX0 - 1.6
const GATE_W = 3.2
const P1 = GATE_W / 2 + 0.2
const PED_X = -6.3
const PED_W = 1.0
const P3 = PED_X + PED_W / 2 + 0.2
const P4 = PED_X - PED_W / 2 - 0.2
const FENCE_H = 1.5
const win1 = { x: houseX0 + 1.3, y: 0.95, w: 2.1, h: 1.5 }
const win2 = { x: houseX0 + 4.3, y: 0.65, w: 2.6, h: 1.8 }
const entryX = houseX0 + layout.houseW - 2.55 + 0.725
const across = [-15, -1, 13]

const OLD_DOOR: DoorLook = { ...DEFAULT_LOOK, color: '#e2ddd1', profile: 'ribbed', windows: 'none', finish: 'satin', roughness: 0.6, metalness: 0.1 }
const NEW_DOOR: DoorLook = { ...DEFAULT_LOOK, color: '#6b4a33', profile: 'flush', windows: 'none', finish: 'woodgrain', roughness: 0.5, metalness: 0.05 }

export const WORLD_VIEWS: Record<string, CameraView> = {
  start: { position: [0.3, 1.45, 5.4], target: [0, 1.15, 0] },
  overview: { position: [10.5, 7.5, 21.5], target: [-4.6, 0.8, 1.8] },
  hero: { position: [7.4, 2.6, 16.8], target: [-4.2, 1.2, 2.2] },
  garage: { position: [2.8, 1.7, 6.0], target: [0, 1.2, 0] },
  gate: { position: [2.8, 1.9, 13.4], target: [-1.4, 0.9, FB] },
  gateInside: { position: [-4.8, 2.1, 2.2], target: [-1.6, 0.5, FB - 0.3] },
  pedestrian: { position: [-4.2, 1.8, 10.8], target: [PED_X, 0.9, FB] },
  fence: { position: [-2.5, 3.8, 17.5], target: [-6.5, 0.8, 5] },
  shutters: { position: [-6.0, 1.9, 5.2], target: [-9.4, 1.6, -0.9] },
}
/**
 * Narrow (portrait) screens see far less across. They get a wider lens,
 * and every view pulls back by the remaining difference in horizontal
 * field of view, so the framing matches the desktop's.
 */
const DESKTOP_HALF = Math.atan(Math.tan((18 * Math.PI) / 180) * 1.68)
export function lensFor(aspect: number) {
  const fov = aspect < 1 ? 55 : 36
  const half = Math.atan(Math.tan(((fov / 2) * Math.PI) / 180) * aspect)
  return { fov, k: Math.min(2.4, Math.max(1, Math.tan(DESKTOP_HALF) / Math.tan(half))) }
}
function scaledViews(k: number, portrait: boolean): Record<string, CameraView> {
  if (k === 1) return WORLD_VIEWS
  // Portrait: look along the street, so the wide frontage fits a tall screen.
  // Only true portrait screens look along the street; landscape keeps the frontage view, pulled back.
  const base: Record<string, CameraView> = !portrait ? WORLD_VIEWS : {
    ...WORLD_VIEWS,
    overview: { position: [11, 8, 11], target: [-5.2, 0.6, 2.2] },
    hero: { position: [8.6, 2.4, 11.5], target: [-3.6, 1.5, 2.0] },
  }
  const out: Record<string, CameraView> = {}
  for (const [name, v] of Object.entries(base)) {
    const [px, py, pz] = v.position
    const [tx, ty, tz] = v.target
    // The along-street portrait views already fit; they need only a little extra distance.
    const f = name === 'start' ? Math.min(k, 1.4) : name === 'overview' || name === 'hero' ? Math.min(k, 1.35) : k
    out[name] = { target: v.target, position: [tx + (px - tx) * f, ty + (py - ty) * f, tz + (pz - tz) * f] }
  }
  return out
}

/** The portal arrival: the overview, a little closer in, so the camera can ease back out. */
function withArrival(views: Record<string, CameraView>): Record<string, CameraView> {
  const { position: p, target: t } = views.hero
  const k = 0.8
  const o = views.overview
  const reveal: CameraView = { target: o.target, position: [o.target[0] + (o.position[0] - o.target[0]) * 1.18, o.target[1] + (o.position[1] - o.target[1]) * 1.18, o.target[2] + (o.position[2] - o.target[2]) * 1.18] }
  return { ...views, reveal, arrive: { target: t, position: [t[0] + (p[0] - t[0]) * k, t[1] + (p[1] - t[1]) * k, t[2] + (p[2] - t[2]) * k] } }
}

export const PRODUCT_VIEW: Record<Product, string> = {
  garage: 'garage',
  gate: 'gate',
  pedestrian: 'pedestrian',
  shutters: 'shutters',
  fence: 'fence',
}

/** Buildings the camera may not enter. */
const box = (x0: number, z0: number, x1: number, z1: number, y1: number) =>
  new THREE.Box3(new THREE.Vector3(x0, -5, z0), new THREE.Vector3(x1, y1, z1))
export const WORLD_BLOCKERS = [
  box(houseX0 - 0.8, layout.houseFront - layout.houseD - 0.8, layout.garageW / 2 + 0.8, 0.8, 7.5),
  box(rightFence + 1, -16.2, rightFence + 14.2, -1, 5),
  box(leftFence - 14, -16.8, leftFence - 0.8, -1.6, 5),
  ...across.map((x) => box(x - 6.6, 23.4, x + 6.6, 37.6, 5)),
]

const HOTSPOTS: Array<{ id: Product; label: string; at: [number, number, number] }> = [
  { id: 'garage', label: 'Garage door', at: [0, 2.35, 0.35] },
  { id: 'gate', label: 'Sliding gate', at: [0.4, 1.95, FB] },
  { id: 'pedestrian', label: 'Pedestrian gate', at: [PED_X, 1.9, FB] },
  { id: 'shutters', label: 'Roller shutters', at: [win2.x + win2.w / 2, 1.7, layout.houseFront + 0.3] },
  { id: 'fence', label: 'Fencing', at: [-10.5, 1.8, FB] },
]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeIn = (t: number) => t * t * t

/** 0..1 towards a boolean target at a fixed rate; snaps when the epoch changes. */
function useProgress(target: boolean, seconds: number, epoch: number) {
  const p = useRef(target ? 1 : 0)
  const seen = useRef(epoch)
  useFrame((_, dt) => {
    if (seen.current !== epoch) {
      seen.current = epoch
      p.current = target ? 1 : 0
      return
    }
    const step = Math.min(dt, 0.1) / seconds
    p.current = target ? Math.min(1, p.current + step) : Math.max(0, p.current - step)
  })
  return p
}

/**
 * Pieces lowered into place one after another (install), or lifted out
 * into the ground (remove), following one shared progress value.
 */
function Sequence({ progress, mode, drop, children }: { progress: React.MutableRefObject<number>; mode: 'install' | 'remove'; drop: number; children: ReactNode[] }) {
  const refs = useRef<Array<THREE.Group | null>>([])
  const n = children.length
  useFrame(() => {
    const p = progress.current
    const span = Math.min(1, 2.5 / n + 0.2)
    refs.current.forEach((g, i) => {
      if (!g) return
      const local = clamp01((p - (n > 1 ? (i / (n - 1)) * (1 - span) : 0)) / span)
      if (mode === 'install') {
        g.visible = local > 0.001
        g.position.y = (1 - easeOut(local)) * drop
      } else {
        g.visible = local < 0.999
        g.position.y = -easeIn(local) * drop
      }
    })
  })
  return (
    <>
      {children.map((child, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)}>
          {child}
        </group>
      ))}
    </>
  )
}

/** An x-ray outline: a faint orange box with bright edges, drawn through everything. */
function Outline({ size, position }: { size: [number, number, number]; position: [number, number, number] }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size[0], size[1], size[2]])
  return (
    <group position={position}>
      <mesh renderOrder={20}>
        <boxGeometry args={size} />
        <meshBasicMaterial color="#1769D2" transparent opacity={0.16} depthTest={false} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} renderOrder={21}>
        <lineBasicMaterial color="#5BA0FF" transparent depthTest={false} />
      </lineSegments>
    </group>
  )
}

const ghost = new THREE.MeshStandardMaterial({ color: '#a9c6e4', transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.4 })

function gateLook(style: FenceStyle, kind: GateLook['kind'], widthM: number, heightM: number): GateLook {
  return {
    kind,
    widthM,
    heightM,
    color: style.color,
    hardwareColor: '#3a3f44',
    finish: style.finish,
    roughness: style.finish === 'woodgrain' ? 0.6 : 0.45,
    metalness: style.finish === 'woodgrain' ? 0.04 : 0.25,
    infill: style.infill,
    leaves: 1,
    swingMotor: 'ram',
    motorised: kind === 'sliding',
    slatM: 0.055,
  }
}

type Run = { at: [number, number]; rot: number; from: number; to: number }
/** Split runs into single panels no wider than 2.4 m, in installation order. */
function panels(runs: Run[]) {
  const out: Array<Run & { a: number; b: number }> = []
  for (const r of runs) {
    const lo = Math.min(r.from, r.to)
    const hi = Math.max(r.from, r.to)
    const n = Math.max(1, Math.ceil((hi - lo) / 2.4))
    for (let i = 0; i < n; i++) out.push({ ...r, a: lo + ((hi - lo) * i) / n, b: lo + ((hi - lo) * (i + 1)) / n })
  }
  return out
}
const NEW_RUNS = panels([
  { at: [0, FB], rot: 0, from: P1 + 0.2, to: rightFence },
  { at: [rightFence, FB], rot: Math.PI / 2, from: 0, to: FB + 0.4 },
  { at: [0, FB], rot: 0, from: -P1 - 0.2, to: P3 + 0.2 },
  { at: [0, FB], rot: 0, from: P4 - 0.2, to: leftFence },
  { at: [leftFence, FB], rot: Math.PI / 2, from: 0, to: FB - layout.houseFront + 0.5 },
])
const OLD_RUNS = panels([
  { at: [0, FB], rot: 0, from: GATE_W / 2, to: rightFence },
  { at: [rightFence, FB], rot: Math.PI / 2, from: 0, to: FB + 0.4 },
  { at: [0, FB], rot: 0, from: -GATE_W / 2, to: PED_X + PED_W / 2 },
  { at: [0, FB], rot: 0, from: PED_X - PED_W / 2, to: leftFence },
  { at: [leftFence, FB], rot: Math.PI / 2, from: 0, to: FB - layout.houseFront + 0.5 },
])
const OLD_FENCE: FenceStyle = { id: 'old', label: 'Old pickets', infill: 'pickets', color: '#ecebe6', finish: 'satin' }

/** Post positions in world space, for the fence's x-ray view. */
const POSTS = (() => {
  const list: Array<[number, number]> = []
  for (const p of NEW_RUNS) {
    for (const x of [p.a, p.b]) {
      const wx = p.at[0] + x * Math.cos(p.rot)
      const wz = p.at[1] - x * Math.sin(p.rot)
      if (!list.some(([u, v]) => Math.abs(u - wx) < 0.05 && Math.abs(v - wz) < 0.05)) list.push([wx, wz])
    }
  }
  return list
})()

function FencePanels({ runs, style, height }: { runs: typeof NEW_RUNS; style: FenceStyle; height: number }) {
  const look = useMemo(() => gateLook(style, 'fence', 2.4, height), [style, height])
  const material = usePanelMaterial(look)
  return runs.map((p, i) => (
    <group key={i} position={[p.at[0], 0, p.at[1]]} rotation={[0, p.rot, 0]}>
      <FenceRun fromX={p.a} toX={p.b} height={height} look={look} material={material} />
    </group>
  ))
}

function Fence({ state }: { state: WorldState }) {
  const p = useProgress(state.upgraded.fence, 3.4, state.epoch)
  const oldP = useRef(0)
  const newP = useRef(0)
  useFrame(() => {
    oldP.current = clamp01(p.current / 0.55)
    newP.current = clamp01((p.current - 0.3) / 0.7)
  })
  const oldPieces = OLD_RUNS.map((r, i) => <FencePanels key={i} runs={[r]} style={OLD_FENCE} height={0.95} />)
  const newPieces = NEW_RUNS.map((r, i) => <FencePanels key={i} runs={[r]} style={state.fence} height={FENCE_H} />)
  return (
    <group>
      <Sequence progress={oldP} mode="remove" drop={1.1}>{oldPieces}</Sequence>
      <Sequence progress={newP} mode="install" drop={1.3}>{newPieces}</Sequence>
      {state.inspect === 'fence' &&
        POSTS.map(([x, z], i) => (
          <group key={i}>
            <Outline size={[0.1, FENCE_H + 0.06, 0.1]} position={[x, (FENCE_H + 0.06) / 2, z]} />
            <Outline size={[0.3, 0.6, 0.3]} position={[x, -0.3, z]} />
          </group>
        ))}
    </group>
  )
}

function Gates({ state }: { state: WorldState }) {
  const gateP = useProgress(state.upgraded.gate, 1.6, state.epoch)
  const pedP = useProgress(state.upgraded.fence, 3.4, state.epoch)
  const pedLate = useRef(0)
  useFrame(() => (pedLate.current = clamp01((pedP.current - 0.75) / 0.25)))
  const slideLook = useMemo(() => gateLook(state.fence, 'sliding', GATE_W, 1.6), [state.fence])
  const pedLook = useMemo(() => gateLook(state.fence, 'pedestrian', PED_W, 1.5), [state.fence])
  const slideMat = usePanelMaterial(slideLook)
  const pedMat = usePanelMaterial(pedLook)
  useEffect(() => {
    for (const [mat, on] of [[slideMat, state.inspect === 'gate'], [pedMat, state.inspect === 'pedestrian']] as const) {
      mat.transparent = on
      mat.opacity = on ? 0.25 : 1
      mat.depthWrite = !on
      mat.needsUpdate = true
    }
  }, [slideMat, pedMat, state.inspect])
  return (
    <group>
      <Sequence progress={gateP} mode="install" drop={1.4}>
        {[
          <group key="p1" position={[P1, 0, FB]}><Pillar x={0} height={1.75} /></group>,
          <group key="p2" position={[-P1, 0, FB]}><Pillar x={0} height={1.75} /></group>,
          <group key="gate" position={[0, 0, FB]} rotation={[0, Math.PI, 0]}>
            <SlidingGate key={state.epoch} look={slideLook} isOpen={state.open.gate} material={slideMat} />
          </group>,
        ]}
      </Sequence>
      <Sequence progress={pedLate} mode="install" drop={1.2}>
        {[
          <group key="p3" position={[P3, 0, FB]}><Pillar x={0} height={1.65} /></group>,
          <group key="p4" position={[P4, 0, FB]}><Pillar x={0} height={1.65} /></group>,
          <group key="ped" position={[PED_X, 0, FB]} rotation={[0, Math.PI, 0]}>
            <SwingGate key={state.epoch} look={pedLook} isOpen={state.open.pedestrian} material={pedMat} posts={false} />
          </group>,
        ]}
      </Sequence>
      {state.inspect === 'gate' && (
        <>
          <Outline size={[0.46, 0.42, 0.32]} position={[-(GATE_W / 2 + 0.45), 0.21, FB - 0.52]} />
          <Outline size={[2 * GATE_W + 0.75, 0.05, 0.07]} position={[-(GATE_W / 2 - 0.05), 0.025, FB - 0.32]} />
          <Outline size={[0.08, 1.65, 0.08]} position={[-(GATE_W / 2 + 0.12), 0.83, FB - 0.44]} />
        </>
      )}
      {state.inspect === 'pedestrian' && (
        <>
          <Outline size={[0.08, 0.14, 0.08]} position={[PED_X + PED_W / 2, 0.3, FB - 0.14]} />
          <Outline size={[0.08, 0.14, 0.08]} position={[PED_X + PED_W / 2, 1.3, FB - 0.14]} />
          <Outline size={[0.1, 0.14, 0.1]} position={[PED_X - PED_W / 2 + 0.05, 1.0, FB - 0.14]} />
        </>
      )}
    </group>
  )
}

/** Slat grooves for a shutter curtain, repeated per slat. */
function useSlatTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 32
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 32)
    grad.addColorStop(0, '#9aa0a6')
    grad.addColorStop(0.45, '#ffffff')
    grad.addColorStop(0.9, '#c9cdd1')
    grad.addColorStop(1, '#5d6266')
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 32)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

const SLAT = 0.055
function HouseShutter({ win, state, m }: { win: typeof win1; state: WorldState; m: HouseMaterials }) {
  const installed = useProgress(state.upgraded.shutters, 1.0, state.epoch)
  const up = useProgress(state.open.shutters, 2.2, state.epoch)
  const fitted = useRef<THREE.Group>(null)
  const curtain = useRef<THREE.Mesh>(null)
  const rail = useRef<THREE.Mesh>(null)
  const map = useSlatTexture()
  const inspect = state.inspect === 'shutters'
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b4045', roughness: 0.42, metalness: 0.35 }), [])
  const slats = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a5056', map, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }), [map])
  const face = layout.houseFront
  // Face-fixed: the housing overlaps the top of the window frame, below the gutter line.
  const top = win.y + win.h - 0.06
  useFrame(() => {
    const k = easeOut(installed.current)
    if (fitted.current) {
      fitted.current.visible = installed.current > 0.001
      fitted.current.position.z = -(1 - k) * 0.28
    }
    const bottom = win.y + easeOut(up.current) * win.h
    const visibleH = top - bottom
    if (curtain.current) {
      curtain.current.visible = visibleH > 0.01 && installed.current > 0.99
      curtain.current.scale.y = Math.max(0.001, visibleH)
      curtain.current.position.y = bottom + visibleH / 2
      map.repeat.set(1, visibleH / SLAT)
    }
    if (rail.current) {
      rail.current.visible = installed.current > 0.99
      rail.current.position.y = bottom + 0.02
    }
  })
  const cx = win.x + win.w / 2
  return (
    <group>
      <group ref={fitted}>
        <mesh position={[cx, top + 0.09, face + 0.11]} material={inspect ? ghost : metal} castShadow receiveShadow>
          <boxGeometry args={[win.w + 0.14, 0.18, 0.22]} />
        </mesh>
        {[win.x - 0.03, win.x + win.w + 0.03].map((x) => (
          <mesh key={x} position={[x, win.y + win.h / 2, face + 0.04]} material={metal} castShadow>
            <boxGeometry args={[0.05, win.h + 0.02, 0.07]} />
          </mesh>
        ))}
        {inspect && (
          <>
            <mesh position={[cx, top + 0.09, face + 0.11]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.045, 0.045, win.w, 20]} />
              <meshStandardMaterial color="#1769D2" emissive="#1769D2" emissiveIntensity={0.5} />
            </mesh>
            <Outline size={[0.06, win.h, 0.08]} position={[win.x - 0.03, win.y + win.h / 2, face + 0.04]} />
            <Outline size={[0.06, win.h, 0.08]} position={[win.x + win.w + 0.03, win.y + win.h / 2, face + 0.04]} />
          </>
        )}
      </group>
      <mesh ref={curtain} position={[cx, top, face + 0.045]} material={inspect ? ghost : slats} castShadow>
        <planeGeometry args={[win.w, 1]} />
      </mesh>
      <mesh ref={rail} position={[cx, win.y, face + 0.05]} material={m.darkSteel}>
        <boxGeometry args={[win.w, 0.04, 0.035]} />
      </mesh>
    </group>
  )
}

function Garage({ state, t, m }: { state: WorldState; t: ReturnType<typeof useSceneTextures>; m: HouseMaterials }) {
  const travel = useRef<Travel>({ t: state.open.garage ? 1 : 0, eased: state.open.garage ? 1 : 0 })
  const [shown, setShown] = useState(state.upgraded.garage)
  const seen = useRef(state.epoch)
  const pending = useRef(false)
  pending.current = shown !== state.upgraded.garage
  useFrame((_, dt) => {
    const tr = travel.current
    if (seen.current !== state.epoch) {
      seen.current = state.epoch
      tr.t = state.open.garage ? 1 : 0
      if (shown !== state.upgraded.garage) setShown(state.upgraded.garage)
    } else {
      // A new door is fitted while the old one is up out of sight.
      const target = pending.current ? 1 : state.open.garage ? 1 : 0
      const step = Math.min(dt, 0.1) / 2.6
      tr.t = target > tr.t ? Math.min(target, tr.t + step) : Math.max(target, tr.t - step)
      if (pending.current && tr.t >= 0.999) {
        pending.current = false
        setShown(state.upgraded.garage)
      }
    }
    tr.eased = (1 - Math.cos(Math.PI * tr.t)) / 2
  })
  const inspect = state.inspect === 'garage'
  return (
    <SectionalDoor
      look={shown ? NEW_DOOR : OLD_DOOR}
      W={W}
      H={H}
      isOpen={state.open.garage}
      t={t}
      m={m}
      travelRef={travel}
      highlight={inspect ? 'opener' : null}
      panelMaterial={inspect ? ghost : null}
    />
  )
}

/** Warm lights after dark: lanterns, gate pillars, the path and the tree. */
function NightLights({ night, gate, m }: { night: boolean; gate: boolean; m: HouseMaterials }) {
  const lamp = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f3e3c3', emissive: '#ffc06a', emissiveIntensity: 0 }), [])
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#25292d', roughness: 0.5, metalness: 0.4 }), [])
  useEffect(() => {
    lamp.emissiveIntensity = night ? 2.2 : 0
    m.curtain.emissive.set(night ? '#ffb45e' : '#000000')
    m.curtain.emissiveIntensity = night ? 0.9 : 0
  }, [night, lamp, m])
  const on = (v: number) => (night ? v : 0)
  const path = [0.2, 0.5, 0.8].map((k) => [THREE.MathUtils.lerp(PED_X, entryX, k) - 0.55, THREE.MathUtils.lerp(FB - 0.6, 0.8, k)] as const)
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.5, 1.95, 0.06]}>
          <mesh material={body}><boxGeometry args={[0.13, 0.28, 0.1]} /></mesh>
          <mesh position={[0, 0, 0.051]} material={lamp}><planeGeometry args={[0.09, 0.22]} /></mesh>
        </group>
      ))}
      {gate &&
        [P1, -P1].map((x) => (
          <mesh key={x} position={[x, 1.84, FB + 0.21]} material={lamp}>
            <boxGeometry args={[0.16, 0.05, 0.01]} />
          </mesh>
        ))}
      {path.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.3, 0]} material={body}><cylinderGeometry args={[0.05, 0.06, 0.6, 12]} /></mesh>
          <mesh position={[0, 0.56, 0]} material={lamp}><cylinderGeometry args={[0.055, 0.055, 0.06, 12]} /></mesh>
        </group>
      ))}
      <pointLight position={[-1.5, 1.9, 0.5]} intensity={on(2.4)} distance={6} decay={2} color="#ffc27a" />
      <pointLight position={[1.5, 1.9, 0.5]} intensity={on(2.4)} distance={6} decay={2} color="#ffc27a" />
      <pointLight position={[0, 1.9, FB - 0.3]} intensity={on(gate ? 2 : 0)} distance={6} decay={2} color="#ffc98a" />
      <pointLight position={[entryX, 2.2, 0.4]} intensity={on(2.6)} distance={6} decay={2} color="#ffc27a" />
      <pointLight position={[houseX0 + 2.6, 0.35, 4.5]} intensity={on(3.4)} distance={7} decay={2} color="#ffd9a0" />
    </group>
  )
}

const Street = memo(function Street({ m, shadows }: { m: HouseMaterials; shadows: boolean }) {
  const plants = useMemo(() => {
    const set = emptyPlantSet()
    ;[-23, -10].forEach((x, i) => addGumTree(set, new THREE.Vector3(x, 0, 20.3), 7.5 + (i % 2) * 1.6, 60 + i))
    ;[-9, -10.6, -12.2, -13.6].forEach((x, i) => addShrub(set, i % 2 ? 'bottlebrush' : 'shrub', new THREE.Vector3(x, 0, FB - 0.6), 0.5, 210 + i))
    addShrub(set, 'shrub', new THREE.Vector3(P4 - 0.6, 0, FB - 0.55), 0.45, 230)
    addShrub(set, 'bottlebrush', new THREE.Vector3(P1 + 0.55, 0, FB - 0.6), 0.5, 231)
    return set
  }, [])
  const pavers = useMemo(
    () => Array.from({ length: 7 }, (_, i) => [THREE.MathUtils.lerp(PED_X, entryX, i / 6), THREE.MathUtils.lerp(FB - 0.45, 0.75, i / 6)] as const),
    []
  )
  return (
    <group>
      <MergeStatic>
      <mesh position={[0, -0.075, 19.75]} material={m.concrete} receiveShadow><boxGeometry args={[200, 0.15, 0.3]} /></mesh>
      <mesh position={[0, -0.02, 21.3]} material={m.concrete} receiveShadow><boxGeometry args={[200, 0.06, 1.2]} /></mesh>
      {across.map((x, i) => (
        <group key={x}>
          <group position={[x, 0, 24]} rotation={[0, Math.PI, 0]}>
            <NeighbourHouse position={[0, 0, 0]} width={12} depth={13} m={m} doorColor={['#4b4f53', '#e6e2d8', '#7a6a58'][i]} />
          </group>
          <mesh position={[x + 3.2, -0.012, 22.9]} material={m.concrete} receiveShadow><boxGeometry args={[4.4, 0.05, 2.1]} /></mesh>
        </group>
      ))}
      {pavers.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.012, z]} material={m.concrete} receiveShadow><boxGeometry args={[0.62, 0.05, 0.62]} /></mesh>
      ))}
      </MergeStatic>
      <Plants set={plants} m={m} shadows={shadows} />
    </group>
  )
})

/**
 * The wider suburb: rows of houses beyond the neighbours, drawn as two
 * instanced meshes (walls and hipped roofs, about 30 houses in 2 draw
 * calls). Far enough out that haze and depth of field soften them.
 */
const Suburb = memo(function Suburb() {
  const { walls, roofs } = useMemo(() => {
    const rand = seeded(901)
    const spots: Array<[number, number, number, number, number]> = []
    for (const z of [-38, -55]) for (let x = -64; x <= 58; x += 16) spots.push([x + rand() * 4, z + rand() * 4, 11 + rand() * 3, 12, 0])
    for (const z of [50, 67]) for (let x = -60; x <= 60; x += 16) spots.push([x + rand() * 4, z + rand() * 4, 11 + rand() * 3, 12, Math.PI])
    for (const x of [-37, -52, 26, 40, 54]) spots.push([x, -2.5, 12, 13, 0])
    for (const x of [-30, -45, 27, 41, 55]) spots.push([x, 24, 12, 13, Math.PI])
    const wallColours = ['#b98a6e', '#cbbb9f', '#e2dccf', '#a7725a', '#d6d0c4', '#c4a488']
    const roofColours = ['#3d4246', '#5b6064', '#86583f', '#2f3337', '#6d6f6e']
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, -0.5)
    const cone = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
    cone.rotateY(Math.PI / 4)
    cone.translate(0, 0.5, -0.5)
    const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 })
    const walls = new THREE.InstancedMesh(box, material, spots.length)
    const roofs = new THREE.InstancedMesh(cone, material.clone(), spots.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const colour = new THREE.Color()
    spots.forEach(([x, z, w, d, rot], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot)
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, 2.7, d))
      walls.setMatrixAt(i, m)
      walls.setColorAt(i, colour.set(wallColours[i % wallColours.length]))
      const zr = z + (rot ? -1 : 1) * 0.45
      m.compose(new THREE.Vector3(x, 2.7, zr), q, new THREE.Vector3(w + 0.9, 2.3, d + 0.9))
      roofs.setMatrixAt(i, m)
      roofs.setColorAt(i, colour.set(roofColours[(i * 3) % roofColours.length]))
    })
    return { walls, roofs }
  }, [])
  return (
    <>
      <primitive object={walls} />
      <primitive object={roofs} />
    </>
  )
})

function Hotspots({ state, onPick }: { state: WorldState; onPick: (p: Product) => void }) {
  if (!state.interactive) return null
  return (
    <>
      {HOTSPOTS.map((h) => (
        <Html key={h.id} position={h.at} center zIndexRange={[30, 0]}>
          <button
            type="button"
            onClick={() => onPick(h.id)}
            className={`xray-hotspot ${state.selected === h.id ? 'is-active' : ''}`}
            aria-label={`Operate the ${h.label.toLowerCase()}`}
          >
            <span className="xray-hotspot-dot" aria-hidden="true" />
            <span className="xray-hotspot-label">{h.label}</span>
          </button>
        </Html>
      ))}
    </>
  )
}

/** Tapping a product operates it (a drag that turns the camera does not). */
function Pick({ id, state, onPick, children }: { id: Product; state: WorldState; onPick: (p: Product) => void; children: ReactNode }) {
  if (!state.interactive) return <>{children}</>
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 6) return
        e.stopPropagation()
        onPick(id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {children}
    </group>
  )
}

/**
 * Compiles every shader and uploads every texture once the property has
 * mounted — including products still hidden until their scene (shutters,
 * the new fence, the pedestrian gate). Without this the GPU compiles them
 * the first frame they appear, which stalled the fence → shutter move. Runs
 * while the portal still covers the screen.
 */
function Precompile() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const hidden: THREE.Object3D[] = []
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o)
          o.visible = true
        }
      })
      // compileAsync hands the work to the driver's parallel compiler and
      // returns at once, so arrival never freezes; it only reads which
      // materials exist, so visibility can be restored straight away.
      try {
        void gl.compileAsync(scene, camera).catch(() => undefined)
      } finally {
        for (const o of hidden) o.visible = false
      }
    })
    return () => cancelAnimationFrame(id)
  }, [gl, scene, camera])
  return null
}

/**
 * The products only re-render when their own part of the world state
 * changes. Every intro scene and every tap patches the state; without this
 * each change re-reconciled hundreds of fence and gate parts at once, a
 * small hitch exactly at each scene change.
 */
type St = { state: WorldState }
const same = (a: WorldState, b: WorldState, keys: Array<(s: WorldState) => unknown>) => keys.every((k) => k(a) === k(b))
const FenceM = memo(Fence, (a: St, b: St) => same(a.state, b.state, [(s) => s.upgraded.fence, (s) => s.epoch, (s) => s.fence, (s) => s.inspect]))
const GatesM = memo(Gates, (a: St, b: St) =>
  same(a.state, b.state, [(s) => s.upgraded.gate, (s) => s.upgraded.fence, (s) => s.open.gate, (s) => s.open.pedestrian, (s) => s.epoch, (s) => s.fence, (s) => s.inspect])
)
const ShutterM = memo(HouseShutter, (a, b) => a.win === b.win && a.m === b.m && same(a.state, b.state, [(s) => s.upgraded.shutters, (s) => s.open.shutters, (s) => s.epoch, (s) => s.inspect]))
const GarageM = memo(Garage, (a, b) => a.t === b.t && a.m === b.m && same(a.state, b.state, [(s) => s.upgraded.garage, (s) => s.open.garage, (s) => s.epoch, (s) => s.inspect]))
const NightLightsM = memo(NightLights)

function Property({ state, tier, onPick }: { state: WorldState; tier: Tier; onPick: (p: Product) => void }) {
  const textures = useSceneTextures()
  const m = useHouseMaterials(textures)
  const settings = TIERS[tier]
  useEffect(() => () => void (document.body.style.cursor = ''), [])
  // Anything that changes sets things moving: keep shadows live until it settles.
  useEffect(() => wakeShadows(6500), [state])
  return (
    <group>
      <House layout={layout} m={m} />
      <Interior layout={layout} m={m} />
      <Landscape layout={layout} m={m} tufts={settings.grassTufts} foliageShadows={settings.foliageShadows} letterbox={false} />
      <Street m={m} shadows={settings.foliageShadows} />
      <Suburb />
      <Pick id="garage" state={state} onPick={onPick}>
        <GarageM state={state} t={textures} m={m} />
      </Pick>
      <Pick id="fence" state={state} onPick={onPick}>
        <FenceM state={state} />
      </Pick>
      <GatesM state={state} />
      <Pick id="gate" state={state} onPick={onPick}>
        <mesh position={[0, 0.85, FB - 0.3]}>
          <boxGeometry args={[GATE_W + 0.4, 1.7, 0.6]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      </Pick>
      <Pick id="pedestrian" state={state} onPick={onPick}>
        <mesh position={[PED_X, 0.8, FB - 0.3]}>
          <boxGeometry args={[PED_W + 0.3, 1.6, 0.8]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      </Pick>
      <Pick id="shutters" state={state} onPick={onPick}>
        <ShutterM win={win1} state={state} m={m} />
        <ShutterM win={win2} state={state} m={m} />
      </Pick>
      <NightLightsM night={state.night} gate={state.upgraded.gate} m={m} />
      <Hotspots state={state} onPick={onPick} />
      <Precompile />
    </group>
  )
}

export function WorldScene({
  bus,
  tier,
  maxTier,
  onTier,
  paused,
  onReady,
  state,
  onPick,
  aspect,
  initialView = 'start',
}: {
  aspect: number
  initialView?: string
  bus: CameraBus
  tier: Tier
  maxTier: Tier
  onTier: (t: Tier) => void
  paused: boolean
  onReady: () => void
  state: WorldState
  onPick: (p: Product) => void
}) {
  // The lens is fixed when the canvas is created; views follow later resizes.
  const [fov] = useState(() => lensFor(aspect).fov)
  const k = lensFor(aspect).k
  const portrait = aspect < 1
  const views = useMemo(() => withArrival(scaledViews(k, portrait)), [k, portrait])
  return (
    <Stage
      tier={tier}
      maxTier={maxTier}
      onTier={onTier}
      paused={paused}
      bus={bus}
      views={views}
      initialView={initialView}
      minDistance={4}
      maxDistance={34 * k}
      maxPolar={1.48}
      shadowSpan={22}
      onReady={onReady}
      night={state.night}
      blockers={WORLD_BLOCKERS}
      fov={fov}
      onDemandShadows
      focusFollow
      haze={[34, 150]}
    >
      <SceneMaterialsProvider>
        <Property state={state} tier={tier} onPick={onPick} />
      </SceneMaterialsProvider>
    </Stage>
  )
}
