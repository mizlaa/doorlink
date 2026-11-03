'use client'

import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { SceneMaterialsProvider, useSceneTextures } from '@/components/three/SceneMaterials'
import { useSceneTextures as usePbrTextures } from './assets'
import { useHouseMaterials } from './materials'
import { worldBox, seeded } from './geometry'
import { NeighbourHouse, TileRoofBlock } from './House'
import { ColorbondFence } from './Landscape'
import { addDistantTree, addGumTree, addShrub, addTuft, emptyPlantSet, Plants } from './Plants'
import { Stage } from './Stage'
import { CameraBus, type CameraView, type ViewName } from './CameraRig'
import { TIERS, type Tier } from './quality'

/**
 * Demo copy of src/components/three/GateScene.tsx. The gates, fences and
 * shutters (geometry and mechanisms) are the app's own; the ground,
 * surroundings, lighting and camera are the demo's upgraded stage.
 */
/**
 * Gates, fences and window shutters, drawn at real size in metres.
 *
 * The garage scene scales a nominal door to fit a fixed house; here the
 * size *is* the design — a 4 m sliding gate and a 1 m pedestrian gate are
 * different products, not one product zoomed — so the geometry is built
 * from the specified millimetres and the camera backs off to fit.
 *
 * The camera stands on the property side, because that is where the
 * motor, track and hinges are: a gate seen from the street is just its
 * infill. Motors are drawn generically on purpose. The shortlist next to
 * the preview names real models; drawing one of them would imply a
 * product the customer has not chosen.
 */

export type GateKind = 'sliding' | 'swing' | 'pedestrian' | 'fence' | 'shutter' | 'shop'

/** Window and shop shutters share the wall-and-curtain scene. */
function isShutterKind(kind: GateKind): boolean {
  return kind === 'shutter' || kind === 'shop'
}
export type GateInfill = 'slats' | 'spaced-slats' | 'pickets' | 'solid'
export type SwingMotorStyle = 'ram' | 'arm' | 'underground'

export interface GateLook {
  kind: GateKind
  widthM: number
  heightM: number
  color: string
  hardwareColor: string
  finish?: string
  roughness: number
  metalness: number
  infill: GateInfill
  leaves: 1 | 2
  swingMotor: SwingMotorStyle
  motorised: boolean
  /** Shutter slat height, metres. */
  slatM: number
}

const FRAME = 0.05
const PANEL_DEPTH = 0.05
const PILLAR = 0.4
const GROUND_CLEARANCE = 0.06
const MOTOR_GREY = '#d4d7da'
const MOTOR_DARK = '#3a3f44'
const STEEL = '#9aa0a6'
const UP = new THREE.Vector3(0, 1, 0)

/** One shared material per look, so a 60-slat fence is not 60 materials. */
function usePanelMaterial(look: GateLook): THREE.MeshStandardMaterial {
  const textures = useSceneTextures()
  const material = useMemo(() => {
    const woodgrain = look.finish === 'woodgrain'
    const surface = woodgrain ? textures.wood : textures.paint
    return new THREE.MeshStandardMaterial({
      color: look.color,
      roughness: look.roughness,
      metalness: look.metalness,
      envMapIntensity: 0.55,
      map: surface.map,
      bumpMap: surface.detail,
      bumpScale: woodgrain ? 0.02 : 0.004,
    })
  }, [look.color, look.roughness, look.metalness, look.finish, textures])
  useEffect(() => () => material.dispose(), [material])
  return material
}

function Box({
  args,
  position,
  material,
  color,
  roughness = 0.6,
  metalness = 0.2,
}: {
  args: [number, number, number]
  position: [number, number, number]
  material?: THREE.Material
  color?: string
  roughness?: number
  metalness?: number
}) {
  return (
    <mesh position={position} material={material} castShadow receiveShadow>
      <boxGeometry args={args} />
      {!material && <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />}
    </mesh>
  )
}

/**
 * A framed panel with its infill, built from its bottom-left corner so a
 * swing leaf can rotate about x = 0 without an offset.
 */
function InfillPanel({
  width,
  height,
  infill,
  material,
  framed = true,
}: {
  width: number
  height: number
  infill: GateInfill
  material: THREE.Material
  framed?: boolean
}) {
  const frame = framed ? FRAME : 0
  const innerW = Math.max(0.05, width - frame * 2)
  const innerH = Math.max(0.05, height - frame * 2)
  const items: ReactElement[] = []

  if (framed) {
    items.push(
      <Box
        key="t"
        args={[width, FRAME, PANEL_DEPTH]}
        position={[width / 2, height - FRAME / 2, 0]}
        material={material}
      />,
      <Box
        key="b"
        args={[width, FRAME, PANEL_DEPTH]}
        position={[width / 2, FRAME / 2, 0]}
        material={material}
      />,
      <Box
        key="l"
        args={[FRAME, innerH, PANEL_DEPTH]}
        position={[FRAME / 2, height / 2, 0]}
        material={material}
      />,
      <Box
        key="r"
        args={[FRAME, innerH, PANEL_DEPTH]}
        position={[width - FRAME / 2, height / 2, 0]}
        material={material}
      />
    )
  }

  if (infill === 'slats' || infill === 'spaced-slats') {
    // 65 mm slats; closed-up slats keep a hairline gap, spaced ones 20 mm.
    const gap = infill === 'slats' ? 0.006 : 0.02
    const count = Math.max(1, Math.floor((innerH + gap) / (0.065 + gap)))
    const pitch = innerH / count
    for (let i = 0; i < count; i++) {
      items.push(
        <Box
          key={`s${i}`}
          args={[innerW, pitch - gap, PANEL_DEPTH * 0.45]}
          position={[width / 2, frame + pitch * i + pitch / 2, 0]}
          material={material}
        />
      )
    }
  } else if (infill === 'pickets') {
    // 25 mm square pickets at roughly 110 mm centres, under 100 mm apart
    // as pool and balustrade rules expect.
    const count = Math.max(1, Math.round(innerW / 0.11))
    const pitch = innerW / count
    for (let i = 0; i < count; i++) {
      items.push(
        <Box
          key={`p${i}`}
          args={[0.025, innerH, 0.025]}
          position={[frame + pitch * i + pitch / 2, height / 2, 0]}
          material={material}
        />
      )
    }
    items.push(
      <Box
        key="mid"
        args={[innerW, FRAME * 0.7, PANEL_DEPTH * 0.8]}
        position={[width / 2, height * 0.42, 0]}
        material={material}
      />
    )
  } else {
    items.push(
      <Box
        key="sheet"
        args={[innerW, innerH, PANEL_DEPTH * 0.3]}
        position={[width / 2, height / 2, 0]}
        material={material}
      />
    )
    // Pressed stiffening lines, so a solid sheet still reads as made.
    for (const fraction of [0.33, 0.66]) {
      items.push(
        <mesh key={`g${fraction}`} position={[width / 2, frame + innerH * fraction, PANEL_DEPTH * 0.16]}>
          <boxGeometry args={[innerW, 0.012, 0.004]} />
          <meshStandardMaterial color="#000000" transparent opacity={0.18} />
        </mesh>
      )
    }
  }

  return <group>{items}</group>
}

function Pillar({ x, height }: { x: number; height: number }) {
  const textures = useSceneTextures()
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[PILLAR, height, PILLAR]} />
        <meshStandardMaterial
          color="#cfc7b8"
          roughness={0.92}
          map={textures.plaster.map}
          bumpMap={textures.plaster.detail}
          bumpScale={0.02}
        />
      </mesh>
      <mesh position={[0, height + 0.04, 0]} castShadow>
        <boxGeometry args={[PILLAR + 0.08, 0.08, PILLAR + 0.08]} />
        <meshStandardMaterial color="#a8a091" roughness={0.85} />
      </mesh>
    </group>
  )
}

/** A run of fence panels between posts, panels no wider than 2.4 m. */
function FenceRun({
  fromX,
  toX,
  height,
  look,
  material,
}: {
  fromX: number
  toX: number
  height: number
  look: GateLook
  material: THREE.Material
}) {
  const length = Math.abs(toX - fromX)
  if (length < 0.2) return null
  const start = Math.min(fromX, toX)
  const panels = Math.max(1, Math.ceil(length / 2.4))
  const pitch = length / panels
  const post = 0.075
  const parts: ReactElement[] = []
  for (let i = 0; i <= panels; i++) {
    parts.push(
      <Box
        key={`post${i}`}
        args={[post, height + 0.06, post]}
        position={[start + pitch * i, (height + 0.06) / 2, 0]}
        material={material}
      />
    )
  }
  for (let i = 0; i < panels; i++) {
    parts.push(
      <group key={`panel${i}`} position={[start + pitch * i + post / 2, 0.05, 0]}>
        <InfillPanel
          width={pitch - post}
          height={height - 0.05}
          infill={look.infill}
          material={material}
          framed={look.infill !== 'solid'}
        />
      </group>
    )
  }
  return <group>{parts}</group>
}


function Slab({ size, position, material }: { size: [number, number, number]; position: [number, number, number]; material: THREE.Material }) {
  const geometry = useMemo(() => worldBox(...size), [size[0], size[1], size[2]])
  return <mesh geometry={geometry} material={material} position={position} receiveShadow />
}

/** Lawn, the driveway on the property side, and the footpath and road beyond. */
function Ground({ drivewayWidth, kind, tier }: { drivewayWidth: number; kind: GateKind; tier: Tier }) {
  const m = useHouseMaterials(usePbrTextures())
  const lawn = useMemo(() => {
    const g = new THREE.PlaneGeometry(240, 240)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 240, uv.getY(i) * 240)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const plants = useMemo(() => {
    const set = emptyPlantSet()
    const rand = seeded(41)
    const tufts = Math.round(TIERS[tier].grassTufts * 0.5)
    for (let i = 0; i < tufts; i++) {
      const side = rand() < 0.5 ? -1 : 1
      const x = side * (drivewayWidth / 2 + 0.8 + rand() * 6)
      addTuft(set, new THREE.Vector3(x, 0, 0.5 + rand() * 1.2), 0.4 + rand() * 0.3, 700 + i)
    }
    if (!isShutterKind(kind)) {
      addShrub(set, 'shrub', new THREE.Vector3(-drivewayWidth / 2 - 2.2, 0, 2.4), 0.6, 61)
      addShrub(set, 'bottlebrush', new THREE.Vector3(drivewayWidth / 2 + 2.6, 0, 2.2), 0.7, 62)
      addGumTree(set, new THREE.Vector3(-drivewayWidth / 2 - 4.5, 0, 6.5), 7.5, 63)
    } else {
      for (let i = 0; i < 4; i++) addShrub(set, i % 2 ? 'bottlebrush' : 'shrub', new THREE.Vector3(-3 + i * 2, 0, 1.0), 0.5, 80 + i)
    }
    return set
  }, [drivewayWidth, kind, tier])
  return (
    <group>
      <mesh geometry={lawn} material={m.lawn} receiveShadow />
      {!isShutterKind(kind) && (
        <>
          {drivewayWidth > 0 && <Slab size={[drivewayWidth, 0.06, 14]} position={[0, -0.014, 7]} material={m.concrete} />}
          <Slab size={[120, 0.06, 1.8]} position={[0, -0.02, -1.2]} material={m.concrete} />
          <Slab size={[120, 0.15, 0.3]} position={[0, -0.073, -2.25]} material={m.concrete} />
          <Slab size={[120, 0.06, 7]} position={[0, -0.14, -5.9]} material={m.asphalt} />
        </>
      )}
      <Plants set={plants} m={m} shadows={TIERS[tier].foliageShadows} />
    </group>
  )
}

/** The street beyond the gate: houses opposite, street trees, a tree line. */
function Backdrop({ z }: { z: number }) {
  const m = useHouseMaterials(usePbrTextures())
  const far = useMemo(() => {
    const set = emptyPlantSet()
    const rand = seeded(9)
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2
      const r = 42 + rand() * 18
      addDistantTree(set, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), 8 + rand() * 7, 400 + i)
    }
    for (let i = 0; i < 3; i++) addGumTree(set, new THREE.Vector3(-14 + i * 14 + rand() * 2, 0, -3.4), 8 + rand() * 2, 600 + i)
    return set
  }, [])
  return (
    <group>
      <NeighbourHouse position={[-8, 0, z - 1]} width={12} depth={12} m={m} doorColor="#e7e4dc" />
      <NeighbourHouse position={[8.5, 0, z - 1.5]} width={12} depth={12} m={m} doorColor="#5a5d5f" />
      <Plants set={far} m={m} shadows={false} />
    </group>
  )
}

function Hinge({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} castShadow>
      <cylinderGeometry args={[0.022, 0.022, 0.12, 12]} />
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.35} />
    </mesh>
  )
}

/** Generic sliding-gate motor: a housing on a base plate, pinion facing the rack. */
function SlidingMotor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box args={[0.42, 0.04, 0.3]} position={[0, 0.02, 0]} color={MOTOR_DARK} />
      <RoundedBox
        args={[0.3, 0.32, 0.2]}
        radius={0.03}
        smoothness={3}
        position={[0, 0.2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={MOTOR_GREY} roughness={0.45} metalness={0.1} />
      </RoundedBox>
      <mesh position={[0, 0.3, 0.101]}>
        <circleGeometry args={[0.012, 16]} />
        <meshStandardMaterial color="#5ccf7a" emissive="#5ccf7a" emissiveIntensity={1.4} />
      </mesh>
    </group>
  )
}

function SlidingGate({
  look,
  isOpen,
  material,
}: {
  look: GateLook
  isOpen: boolean
  material: THREE.Material
}) {
  const { widthM: w, heightM: h } = look
  const leaf = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const leafWidth = w + 0.15
  const z = 0.32

  useFrame((_, delta) => {
    if (!leaf.current) return
    progress.current = THREE.MathUtils.damp(progress.current, isOpen ? 1 : 0, 1.1, delta)
    leaf.current.position.x = -w / 2 - 0.05 + progress.current * (w + 0.1)
  })

  return (
    <group>
      {/* Ground track, from the catch side to the end of the run-back. */}
      <Box
        args={[leafWidth + w + 0.6, 0.02, 0.03]}
        position={[w / 2 - 0.05, 0.01, z]}
        color={STEEL}
        metalness={0.6}
        roughness={0.4}
      />
      <group ref={leaf} position={[-w / 2 - 0.05, 0, z]}>
        <group position={[0, GROUND_CLEARANCE, 0]}>
          <InfillPanel
            width={leafWidth}
            height={h - GROUND_CLEARANCE}
            infill={look.infill}
            material={material}
          />
        </group>
        {[0.35, leafWidth - 0.35].map((x) => (
          <mesh key={x} position={[x, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.03, 18]} />
            <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
        {look.motorised && (
          <Box
            args={[leafWidth, 0.03, 0.02]}
            position={[leafWidth / 2, 0.16, PANEL_DEPTH / 2 + 0.012]}
            color="#2b2e31"
            metalness={0.5}
            roughness={0.5}
          />
        )}
      </group>
      {/* Guide post with top rollers holds the leaf upright as it runs. */}
      <Box
        args={[0.06, h + 0.05, 0.06]}
        position={[w / 2 + 0.12, (h + 0.05) / 2, z + 0.12]}
        color={STEEL}
        metalness={0.4}
      />
      <Box
        args={[0.06, 0.05, 0.18]}
        position={[w / 2 + 0.12, h - 0.02, z + 0.03]}
        color={STEEL}
        metalness={0.4}
      />
      {look.motorised && <SlidingMotor position={[w / 2 + 0.45, 0, z + 0.2]} />}
    </group>
  )
}

/** Keeps a cylinder stretched between two moving points. */
function placeBetween(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const direction = to.clone().sub(from)
  const length = Math.max(0.001, direction.length())
  mesh.position.copy(from).addScaledVector(direction, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
  mesh.scale.set(1, length, 1)
}

function Leaf({
  hingeX,
  width,
  side,
  look,
  isOpen,
  material,
  hingeZ,
}: {
  hingeX: number
  width: number
  side: 1 | -1
  look: GateLook
  isOpen: boolean
  material: THREE.Material
  hingeZ: number
}) {
  const group = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const ramBody = useRef<THREE.Mesh>(null)
  const ramRod = useRef<THREE.Mesh>(null)
  const armA = useRef<THREE.Mesh>(null)
  const armB = useRef<THREE.Mesh>(null)
  const h = look.heightM - GROUND_CLEARANCE
  const mountY = Math.min(0.75, h * 0.45)
  const showMotor = look.motorised
  // Fixed points on the pillar (or post) behind the hinge.
  const bracket = useMemo(
    () => new THREE.Vector3(hingeX - side * 0.12, mountY, hingeZ + 0.16),
    [hingeX, side, mountY, hingeZ]
  )
  const armPivot = useMemo(
    () => new THREE.Vector3(hingeX - side * 0.06, mountY + 0.1, hingeZ + 0.3),
    [hingeX, side, mountY, hingeZ]
  )
  const scratch = useMemo(
    () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), e: new THREE.Vector3() }),
    []
  )
  const ramAttach = Math.min(0.85, width * 0.6)
  const armAttach = Math.min(0.4, width * 0.4)

  useFrame((_, delta) => {
    const leaf = group.current
    if (!leaf) return
    progress.current = THREE.MathUtils.damp(progress.current, isOpen ? 1 : 0, 1.3, delta)
    // Leaves open inward, towards the camera: about 90°, a little short
    // of it as a real stop would leave them.
    leaf.rotation.y = -side * progress.current * (Math.PI / 2) * 0.94
    leaf.updateMatrixWorld()
    if (!showMotor) return

    if (look.swingMotor === 'ram' && ramBody.current && ramRod.current) {
      const attach = leaf.localToWorld(
        scratch.a.set(side * ramAttach, mountY - GROUND_CLEARANCE, PANEL_DEPTH / 2 + 0.03)
      )
      const direction = scratch.b.copy(attach).sub(bracket).normalize()
      const bodyEnd = scratch.e.copy(bracket).addScaledVector(direction, 0.5)
      placeBetween(ramBody.current, bracket, bodyEnd)
      placeBetween(ramRod.current, bodyEnd, attach)
    }

    if (look.swingMotor === 'arm' && armA.current && armB.current) {
      // Two-link arm: find the elbow from the two link lengths, in plan.
      const attach = leaf.localToWorld(
        scratch.a.set(side * armAttach, mountY + 0.1 - GROUND_CLEARANCE, PANEL_DEPTH / 2 + 0.03)
      )
      const l1 = 0.42
      const l2 = 0.4
      const dx = attach.x - armPivot.x
      const dz = attach.z - armPivot.z
      const d = Math.min(l1 + l2 - 0.001, Math.max(Math.abs(l1 - l2) + 0.001, Math.hypot(dx, dz)))
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
      const across = Math.sqrt(Math.max(0, l1 * l1 - along * along))
      const ux = dx / Math.hypot(dx, dz)
      const uz = dz / Math.hypot(dx, dz)
      // The elbow folds away from the opening, the way the arm is fitted.
      const elbow = scratch.e.set(
        armPivot.x + ux * along - side * uz * across * -1,
        armPivot.y,
        armPivot.z + uz * along + side * ux * across * -1
      )
      if (elbow.z < armPivot.z - 0.05)
        elbow.set(
          armPivot.x + ux * along + side * uz * across * -1,
          armPivot.y,
          armPivot.z + uz * along - side * ux * across * -1
        )
      placeBetween(armA.current, armPivot, elbow)
      placeBetween(armB.current, elbow, scratch.b.set(attach.x, armPivot.y, attach.z))
    }
  })

  const handleX = side * (width - 0.12)

  return (
    <group>
      <group ref={group} position={[hingeX, GROUND_CLEARANCE, hingeZ]}>
        <group position={[side === 1 ? 0 : -width, 0, 0]}>
          <InfillPanel width={width} height={h} infill={look.infill} material={material} />
        </group>
        <Hinge position={[0, 0.25, 0]} color={look.hardwareColor} />
        <Hinge position={[0, h - 0.25, 0]} color={look.hardwareColor} />
        {/* Latch and pull handle on the free edge. */}
        <Box
          args={[0.08, 0.14, 0.04]}
          position={[handleX, Math.min(1.05, h * 0.55), PANEL_DEPTH / 2 + 0.02]}
          color={look.hardwareColor}
          metalness={0.7}
          roughness={0.35}
        />
      </group>

      {showMotor && look.swingMotor === 'ram' && (
        <>
          <Box
            args={[0.1, 0.12, 0.08]}
            position={[bracket.x, bracket.y, bracket.z - 0.03]}
            color={STEEL}
            metalness={0.5}
          />
          <mesh ref={ramBody} castShadow>
            <cylinderGeometry args={[0.042, 0.042, 1, 18]} />
            <meshStandardMaterial color={MOTOR_GREY} roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh ref={ramRod} castShadow>
            <cylinderGeometry args={[0.016, 0.016, 1, 12]} />
            <meshStandardMaterial color="#d9dde1" roughness={0.2} metalness={0.9} />
          </mesh>
        </>
      )}
      {showMotor && look.swingMotor === 'arm' && (
        <>
          <RoundedBox
            args={[0.26, 0.32, 0.18]}
            radius={0.03}
            smoothness={3}
            position={[armPivot.x, armPivot.y - 0.02, armPivot.z - 0.1]}
            castShadow
          >
            <meshStandardMaterial color={MOTOR_GREY} roughness={0.45} metalness={0.1} />
          </RoundedBox>
          <mesh ref={armA} castShadow>
            <boxGeometry args={[0.045, 1, 0.02]} />
            <meshStandardMaterial color={MOTOR_DARK} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh ref={armB} castShadow>
            <boxGeometry args={[0.04, 1, 0.018]} />
            <meshStandardMaterial color={MOTOR_DARK} metalness={0.5} roughness={0.45} />
          </mesh>
        </>
      )}
      {showMotor && look.swingMotor === 'underground' && (
        // The foundation box lid under the hinge is all that shows.
        <Box
          args={[0.42, 0.02, 0.34]}
          position={[hingeX + side * 0.14, 0.01, hingeZ + 0.06]}
          color="#6b7075"
          metalness={0.6}
          roughness={0.5}
        />
      )}
    </group>
  )
}

function SwingGate({
  look,
  isOpen,
  material,
  posts,
}: {
  look: GateLook
  isOpen: boolean
  material: THREE.Material
  posts: boolean
}) {
  const w = look.widthM
  const leaves = look.kind === 'pedestrian' ? 1 : look.leaves
  const gap = 0.02
  const leafWidth = w / leaves - gap
  const hingeZ = posts ? 0.07 : PILLAR / 2 - 0.06
  return (
    <group>
      <Leaf
        hingeX={-w / 2 + gap / 2}
        width={leafWidth}
        side={1}
        look={look}
        isOpen={isOpen}
        material={material}
        hingeZ={hingeZ}
      />
      {leaves === 2 && (
        <Leaf
          hingeX={w / 2 - gap / 2}
          width={leafWidth}
          side={-1}
          look={look}
          isOpen={isOpen}
          material={material}
          hingeZ={hingeZ}
        />
      )}
    </group>
  )
}

/**
 * A wall with an opening and the shutter face-fixed above it: a house
 * window, or — for a shop shutter — a shopfront at street level with a
 * deeper hood and a heavier curtain.
 */
function WindowShutter({ look, isOpen }: { look: GateLook; isOpen: boolean }) {
  const textures = useSceneTextures()
  const material = usePanelMaterial(look)
  const { widthM: w, heightM: h, slatM } = look
  const shop = look.kind === 'shop'
  const sill = shop ? 0 : 0.9
  const wallW = Math.max(w + 3.2, 5.5)
  const boxH = shop ? 0.42 : slatM > 0.045 ? 0.25 : 0.2
  const boxD = shop ? 0.36 : 0.22
  const guideW = shop ? 0.08 : 0.05
  // Shopfront glazing bars roughly every 1.2 m.
  const mullions = Math.max(2, Math.round(w / 1.2))
  const wallH = sill + h + boxH + 0.9
  const wallT = 0.25
  const face = wallT / 2
  const curtain = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const slatCount = Math.ceil(h / slatM)
  const boxBottom = sill + h

  useFrame((_, delta) => {
    const group = curtain.current
    if (!group) return
    progress.current = THREE.MathUtils.damp(progress.current, isOpen ? 1 : 0, 1.0, delta)
    const bottom = sill + progress.current * (h - 0.02)
    group.position.y = bottom
    // Slats above the box's underside are rolled up inside it.
    group.children.forEach((child, i) => {
      child.visible = bottom + i * slatM + slatM * 0.5 < boxBottom + 0.001
    })
  })

  const wallMaterial = (
    <meshStandardMaterial
      color={shop ? '#b8b3aa' : '#c9b497'}
      roughness={0.95}
      map={textures.plaster.map}
      bumpMap={textures.plaster.detail}
      bumpScale={0.015}
    />
  )
  const side = (wallW - w) / 2

  return (
    <group>
      {/* Wall in four pieces around the opening. */}
      <mesh position={[-(w / 2 + side / 2), wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[side, wallH, wallT]} />
        {wallMaterial}
      </mesh>
      <mesh position={[w / 2 + side / 2, wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[side, wallH, wallT]} />
        {wallMaterial}
      </mesh>
      {sill > 0 && (
        <mesh position={[0, sill / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, sill, wallT]} />
          {wallMaterial}
        </mesh>
      )}
      <mesh position={[0, (wallH + sill + h) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, wallH - sill - h, wallT]} />
        {wallMaterial}
      </mesh>
      {/* Eave and gutter. */}
      <Box args={[wallW + 0.6, 0.12, 0.7]} position={[0, wallH + 0.06, 0.2]} color="#55595c" roughness={0.8} />
      <Box args={[wallW + 0.6, 0.1, 0.1]} position={[0, wallH - 0.02, 0.58]} color="#e9e9e6" roughness={0.6} />

      {shop ? (
        <>
          {/* Shopfront: dark aluminium frame, glazing and a lit interior. */}
          <Box args={[w, 0.06, 0.08]} position={[0, h - 0.03, -0.05]} color="#2f3336" metalness={0.5} />
          {Array.from({ length: mullions + 1 }, (_, i) => (
            <Box
              key={i}
              args={[0.06, h, 0.08]}
              position={[-w / 2 + 0.03 + (i * (w - 0.06)) / mullions, h / 2, -0.05]}
              color="#2f3336"
              metalness={0.5}
            />
          ))}
          <mesh position={[0, h / 2, -0.05]}>
            <planeGeometry args={[w - 0.06, h - 0.06]} />
            <meshPhysicalMaterial color="#a9bfcc" roughness={0.05} metalness={0.1} transparent opacity={0.4} />
          </mesh>
          <mesh position={[0, h / 2, -1.2]}>
            <planeGeometry args={[w + 0.4, h + 0.4]} />
            <meshStandardMaterial color="#d9d4c8" roughness={1} />
          </mesh>
          {/* The shop floor, so the open shutter shows an interior, not lawn. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, -0.6]} receiveShadow>
            <planeGeometry args={[w + 0.4, 1.2]} />
            <meshStandardMaterial color="#9c968b" roughness={0.85} />
          </mesh>
        </>
      ) : (
        <>
          {/* Window: frame, glass and a dim room behind. */}
          <Box args={[w, 0.05, 0.06]} position={[0, sill + 0.025, -0.02]} color="#f1f1ee" />
          <Box args={[w, 0.05, 0.06]} position={[0, sill + h - 0.025, -0.02]} color="#f1f1ee" />
          <Box args={[0.05, h, 0.06]} position={[-w / 2 + 0.025, sill + h / 2, -0.02]} color="#f1f1ee" />
          <Box args={[0.05, h, 0.06]} position={[w / 2 - 0.025, sill + h / 2, -0.02]} color="#f1f1ee" />
          <Box args={[0.04, h, 0.05]} position={[0, sill + h / 2, -0.02]} color="#f1f1ee" />
          <mesh position={[0, sill + h / 2, -0.02]}>
            <planeGeometry args={[w - 0.1, h - 0.1]} />
            <meshPhysicalMaterial color="#9fb6c4" roughness={0.05} metalness={0.1} transparent opacity={0.45} />
          </mesh>
          <mesh position={[0, sill + h / 2, -0.5]}>
            <planeGeometry args={[w + 0.4, h + 0.4]} />
            <meshStandardMaterial color="#3a3a38" roughness={1} />
          </mesh>
          <Box
            args={[w + 0.12, 0.04, 0.2]}
            position={[0, sill - 0.02, face + 0.05]}
            color="#d8d2c6"
            roughness={0.9}
          />
        </>
      )}

      {/* Shutter box, guides and curtain. */}
      <RoundedBox
        args={[w + 0.12, boxH, boxD]}
        radius={0.02}
        smoothness={3}
        position={[0, boxBottom + boxH / 2, face + boxD / 2]}
        material={material}
        castShadow
      />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          args={[guideW, h, 0.07]}
          position={[s * (w / 2 + guideW / 2 + 0.01), sill + h / 2, face + 0.04]}
          material={material}
        />
      ))}
      <group ref={curtain} position={[0, sill, face + 0.04]}>
        {Array.from({ length: slatCount }, (_, i) => (
          <Box
            key={i}
            args={[w + 0.03, i === 0 ? slatM * 1.15 : slatM * 0.94, i === 0 ? 0.03 : 0.012]}
            position={[0, i * slatM + slatM / 2, 0]}
            material={material}
          />
        ))}
      </group>

      {shop ? (
        // A footpath in front of the shopfront.
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, face + 1.6]} receiveShadow>
          <planeGeometry args={[wallW + 4, 3]} />
          <meshStandardMaterial color="#c4bfb5" roughness={0.9} map={textures.concrete.map} />
        </mesh>
      ) : (
        <>
          {/* A garden bed under the window. */}
          <mesh position={[0, 0.06, face + 0.55]} receiveShadow>
            <boxGeometry args={[wallW - 0.4, 0.12, 0.9]} />
            <meshStandardMaterial color="#4e4436" roughness={1} map={textures.mulch.map} />
          </mesh>
          {[-1.6, -0.6, 0.5, 1.4].map((x, i) => (
            <mesh
              key={x}
              position={[x * Math.max(1, w / 2.2), 0.32, face + 0.55]}
              scale={[0.36, 0.3 + (i % 2) * 0.08, 0.32]}
              castShadow
            >
              <sphereGeometry args={[1, 14, 10]} />
              <meshStandardMaterial color={i % 2 ? '#4d6842' : '#5b7449'} roughness={1} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

function GateLayout({ look, isOpen }: { look: GateLook; isOpen: boolean }) {
  const material = usePanelMaterial(look)
  const { widthM: w, heightM: h, kind } = look

  if (kind === 'fence') {
    return (
      <group>
        <FenceRun fromX={-w / 2} toX={w / 2} height={h} look={look} material={material} />
        <Boundary left={-w / 2} right={w / 2} height={h} cornerPosts material={material} />
      </group>
    )
  }

  const posts = kind === 'pedestrian'
  const sideRun = kind === 'sliding' ? w + 0.8 : Math.max(2.5, w * 0.6)
  const post = posts ? 0.1 : PILLAR
  const edge = w / 2 + post
  const frontHalf = Math.max(8.5, edge + sideRun + 0.6, edge + Math.max(2.5, w * 0.6) + 0.6)

  return (
    <group>
      {posts ? (
        <>
          <Box
            args={[post, h + 0.08, post]}
            position={[-w / 2 - post / 2, (h + 0.08) / 2, 0]}
            material={material}
          />
          <Box
            args={[post, h + 0.08, post]}
            position={[w / 2 + post / 2, (h + 0.08) / 2, 0]}
            material={material}
          />
        </>
      ) : (
        <>
          <Pillar x={-w / 2 - PILLAR / 2} height={h + 0.15} />
          <Pillar x={w / 2 + PILLAR / 2} height={h + 0.15} />
        </>
      )}
      <FenceRun fromX={-edge} toX={-edge - Math.max(2.5, w * 0.6)} height={h} look={look} material={material} />
      <FenceRun fromX={edge} toX={edge + sideRun} height={h} look={look} material={material} />
      {/* The front fence carries on to the side boundaries, which return
          back along the block, so the property is enclosed. */}
      <FenceRun fromX={-edge - Math.max(2.5, w * 0.6)} toX={-frontHalf} height={h} look={look} material={material} />
      <FenceRun fromX={edge + sideRun} toX={frontHalf} height={h} look={look} material={material} />
      <Boundary left={-frontHalf} right={frontHalf} height={h} cornerPosts={posts} material={material} pillars={!posts} />
      {kind === 'sliding' ? (
        <SlidingGate look={look} isOpen={isOpen} material={material} />
      ) : (
        <SwingGate look={look} isOpen={isOpen} material={material} posts={posts} />
      )}
    </group>
  )
}

/**
 * Corner posts (or pillars) where the front fence meets the side
 * boundaries, Colorbond side fences running back along the block, and
 * the house at the end of the driveway.
 */
function Boundary({
  left,
  right,
  height,
  cornerPosts,
  pillars = false,
  material,
}: {
  left: number
  right: number
  height: number
  cornerPosts: boolean
  pillars?: boolean
  material: THREE.Material
}) {
  const m = useHouseMaterials(usePbrTextures())
  const depth = 16
  return (
    <group>
      {pillars ? (
        <>
          <Pillar x={left - PILLAR / 2} height={height + 0.15} />
          <Pillar x={right + PILLAR / 2} height={height + 0.15} />
        </>
      ) : cornerPosts ? (
        <>
          <Box args={[0.1, height + 0.1, 0.1]} position={[left - 0.05, (height + 0.1) / 2, 0]} material={material} />
          <Box args={[0.1, height + 0.1, 0.1]} position={[right + 0.05, (height + 0.1) / 2, 0]} material={material} />
        </>
      ) : null}
      <ColorbondFence from={[left - 0.1, 0.12]} to={[left - 0.1, depth]} m={m} />
      <ColorbondFence from={[right + 0.1, 0.12]} to={[right + 0.1, depth]} m={m} />
      <group rotation={[0, Math.PI, 0]} position={[0, 0, depth + 3]}>
        <NeighbourHouse position={[0, 0, 0]} width={Math.min(14, right - left - 2)} depth={12} m={m} doorColor="#3d4144" />
      </group>
    </group>
  )
}

/** The rest of the building behind a shutter's wall, so it reads as a home or shop. */
function ShutterBuilding({ look }: { look: GateLook }) {
  const m = useHouseMaterials(usePbrTextures())
  const shop = look.kind === 'shop'
  const w = Math.max(look.widthM + 3.2, 5.5)
  const sill = shop ? 0 : 0.9
  const boxH = shop ? 0.42 : look.slatM > 0.045 ? 0.25 : 0.2
  const h = sill + look.heightM + boxH + 0.9
  const depth = shop ? 10 : 8
  return (
    <group>
      <Slab size={[w, h, depth]} position={[0, h / 2, -depth / 2 - 0.125]} material={shop ? m.render : m.brick} />
      <TileRoofBlock width={w} depth={depth + 0.25} cx={0} cz={-depth / 2} y={h} m={m} />
      {/* Neighbours either side, softened by the depth of field, with
          their own driveways, so the street does not feel empty. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (w / 2 + 9.5), 0, -3]}>
          <NeighbourHouse position={[0, 0, 0]} width={11} depth={12} m={m} doorColor={side < 0 ? '#e7e4dc' : '#4a4e51'} />
          <Slab size={[5.4, 0.06, 9]} position={[-5.5 + 0.8 + 2.4, -0.014, 4.5]} material={m.concrete} />
        </group>
      ))}
    </group>
  )
}

function gateViews(look: GateLook): Record<ViewName, CameraView> {
  const shutter = isShutterKind(look.kind)
  const span = shutter
    ? Math.max(look.widthM + 1.6, look.heightM + 2.2)
    : look.kind === 'fence'
      ? look.widthM * 0.75 + 1
      : look.widthM * (look.kind === 'sliding' ? 1.6 : 1.25) + 1.2
  const radius = THREE.MathUtils.clamp(shutter ? span + 1.6 : span * 1.15 + 2.6, 4.4, 28)
  const targetY = shutter ? (look.kind === 'shop' ? 0 : 0.9) + look.heightM / 2 : Math.min(1.1, look.heightM * 0.5)
  const targetX = look.kind === 'sliding' ? look.widthM * 0.3 : 0
  const at = (theta: number, phi: number, r = radius): CameraView => {
    const p = new THREE.Vector3().setFromSphericalCoords(r, phi, theta)
    return { position: [targetX + p.x, targetY + p.y, p.z], target: [targetX, targetY, 0] }
  }
  return {
    angle: at(0.5, 1.28),
    front: at(0, 1.45, radius * 0.92),
    side: at(-0.85, 1.3),
    // The other side: from the street (or, for a shutter, from inside the room is not drawn).
    inside: shutter ? at(0.95, 1.2, radius * 1.1) : at(Math.PI - 0.35, 1.32),
  }
}

export function GateScene({
  look,
  isOpen,
  bus,
  tier = 'medium',
  maxTier = 'medium',
  onTier = () => undefined,
  paused = false,
  onReady,
}: {
  look: GateLook
  isOpen: boolean
  bus?: CameraBus
  tier?: Tier
  maxTier?: Tier
  onTier?: (tier: Tier) => void
  paused?: boolean
  onReady?: () => void
}) {
  const fallbackBus = useMemo(() => new CameraBus(), [])
  const views = useMemo(() => gateViews(look), [look.kind, look.widthM, look.heightM])
  const shutter = isShutterKind(look.kind)
  return (
    <Stage
      tier={tier}
      maxTier={maxTier}
      onTier={onTier}
      paused={paused}
      bus={bus ?? fallbackBus}
      views={views}
      initialView="angle"
      minDistance={3}
      maxDistance={30}
      shadowSpan={Math.max(12, look.widthM * 1.6)}
      onReady={onReady}
      focus={shutter ? [0, (look.kind === 'shop' ? 0 : 0.9) + look.heightM / 2, 0] : undefined}
    >
      <SceneMaterialsProvider>
        <Ground
          kind={look.kind}
          tier={tier}
          drivewayWidth={look.kind === 'fence' || shutter ? 0 : look.kind === 'pedestrian' ? 1.1 : look.widthM}
        />
        {shutter ? (
          <>
            <WindowShutter look={look} isOpen={isOpen} />
            <ShutterBuilding look={look} />
          </>
        ) : (
          <GateLayout look={look} isOpen={isOpen} />
        )}
        {!shutter && <Backdrop z={-11} />}
      </SceneMaterialsProvider>
    </Stage>
  )
}
