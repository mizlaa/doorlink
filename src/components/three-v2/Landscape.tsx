'use client'

import { memo, useMemo } from 'react'
import * as THREE from 'three'
import type { HouseMaterials } from './materials'
import { worldBox } from './geometry'
import { NeighbourHouse, WALL_T, type HouseLayout } from './House'
import { addDistantTree, addGumTree, addShrub, addTuft, emptyPlantSet, Plants } from './Plants'
import { seeded } from './geometry'
import { MergeStatic } from './merge'

/**
 * The block around the house: lawn, a broom-finished concrete driveway
 * with saw-cut joints, footpath, nature strip, kerb and road, garden beds
 * with mulch, Colorbond boundary fences, wheelie bins, a letterbox, the
 * neighbours, and the plants.
 */

export const FRONT_BOUNDARY = 6.5
const FOOTPATH = [6.9, 8.1] as const
const KERB = 10.3

function Slab({
  size,
  position,
  material,
  receive = true,
}: {
  size: [number, number, number]
  position: [number, number, number]
  material: THREE.Material
  receive?: boolean
}) {
  const geometry = useMemo(() => worldBox(...size), [size[0], size[1], size[2]])
  return <mesh geometry={geometry} material={material} position={position} receiveShadow={receive} castShadow={false} />
}

function ground(size: number) {
  const g = new THREE.PlaneGeometry(size, size, 1, 1)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size)
  g.rotateX(-Math.PI / 2)
  return g
}

export function ColorbondFence({ from, to, m }: { from: [number, number]; to: [number, number]; m: HouseMaterials }) {
  const pieces = useMemo(() => {
    const a = new THREE.Vector2(...from)
    const b = new THREE.Vector2(...to)
    const length = a.distanceTo(b)
    const bays = Math.max(1, Math.round(length / 2.38))
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    return { a, length, bays, angle }
  }, [from, to])
  const sheet = useMemo(() => worldBox(pieces.length / pieces.bays - 0.05, 1.72, 0.02), [pieces])
  const rail = useMemo(() => worldBox(pieces.length, 0.05, 0.05), [pieces])
  return (
    <group position={[pieces.a.x, 0, pieces.a.y]} rotation={[0, -pieces.angle, 0]}>
      {Array.from({ length: pieces.bays }, (_, i) => (
        <mesh key={i} geometry={sheet} material={m.fenceSheet} position={[(i + 0.5) * (pieces.length / pieces.bays), 0.9, 0]} castShadow receiveShadow />
      ))}
      {Array.from({ length: pieces.bays + 1 }, (_, i) => (
        <mesh key={`p${i}`} material={m.fenceSheet} position={[i * (pieces.length / pieces.bays), 0.92, 0]} castShadow>
          <boxGeometry args={[0.05, 1.84, 0.05]} />
        </mesh>
      ))}
      <mesh geometry={rail} material={m.fenceSheet} position={[pieces.length / 2, 1.8, 0]} />
      <mesh geometry={rail} material={m.fenceSheet} position={[pieces.length / 2, 0.06, 0]} />
    </group>
  )
}

function WheelieBin({ position, lid, m }: { position: [number, number, number]; lid: string; m: HouseMaterials }) {
  return (
    <group position={position} rotation={[0, -Math.PI / 2 + 0.08, 0]}>
      <mesh position={[0, 0.5, 0]} scale={[1, 1, 1]} castShadow receiveShadow>
        <cylinderGeometry args={[0.37, 0.31, 0.94, 4, 1]} />
        <meshStandardMaterial color="#2f4a35" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.0, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[0.6, 0.05, 0.74]} />
        <meshStandardMaterial color={lid} roughness={0.5} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.1, -0.3]} rotation={[0, 0, Math.PI / 2]} material={m.rubber}>
          <cylinderGeometry args={[0.1, 0.1, 0.05, 14]} />
        </mesh>
      ))}
    </group>
  )
}

export const Landscape = memo(function Landscape({
  layout,
  m,
  tufts,
  foliageShadows,
  letterbox = true,
  bins = true,
}: {
  layout: HouseLayout
  m: HouseMaterials
  tufts: number
  foliageShadows: boolean
  /** The world scene puts a gate where the letterbox stands. */
  letterbox?: boolean
  /** Wheelie bins beside the garage. The designer's tidy street view leaves them out. */
  bins?: boolean
}) {
  const { doorW, garageW, garageD, houseW, houseFront } = layout
  const driveW = Math.max(doorW + 0.8, 3.2)
  const houseX0 = -garageW / 2 - houseW
  const rightFence = garageW / 2 + 1.35
  const leftFence = houseX0 - 1.6
  const entryX = houseX0 + houseW - 2.55 + 0.72

  const near = useMemo(() => {
    const set = emptyPlantSet()
    // Street tree on the nature strip, and a smaller one in the front yard.
    addGumTree(set, new THREE.Vector3(-driveW / 2 - 4.2, 0, 9.3), 9, 11)
    addGumTree(set, new THREE.Vector3(houseX0 + 2.2, 0, 4.2), 5.2, 23)
    // Clipped lilly pillies and bottlebrush in the bed along the house front.
    const bedStart = houseX0 + 0.6
    const bedEnd = entryX - 1.3
    const shrubs = Math.max(3, Math.floor((bedEnd - bedStart) / 1.25))
    for (let i = 0; i < shrubs; i++) {
      const x = bedStart + ((i + 0.5) / shrubs) * (bedEnd - bedStart)
      addShrub(set, i % 3 === 1 ? 'bottlebrush' : 'shrub', new THREE.Vector3(x, 0.03, houseFront + 0.62), i % 3 === 1 ? 0.62 : 0.48, 100 + i)
    }
    // Shrubs either side of the garage, against the side fence.
    addShrub(set, 'shrub', new THREE.Vector3(rightFence - 0.6, 0, 1.8), 0.55, 140)
    addShrub(set, 'bottlebrush', new THREE.Vector3(rightFence - 0.7, 0, 3.4), 0.7, 141)
    // Lomandra tufts along the bed edge, the driveway and the boundary.
    const rand = seeded(77)
    for (let i = 0; i < tufts; i++) {
      const zone = rand()
      let p: THREE.Vector3
      if (zone < 0.45) p = new THREE.Vector3(bedStart + rand() * (bedEnd - bedStart), 0.03, houseFront + 1.1 + rand() * 0.25)
      else if (zone < 0.7) p = new THREE.Vector3(driveW / 2 + 0.25 + rand() * 0.35, 0, 0.6 + rand() * (FRONT_BOUNDARY - 1))
      else if (zone < 0.85) p = new THREE.Vector3(rightFence - 0.3 - rand() * 0.4, 0, -0.5 + rand() * 6)
      else p = new THREE.Vector3(leftFence + 0.3 + rand() * 0.5, 0, -1 + rand() * 7)
      addTuft(set, p, 0.42 + rand() * 0.3, 900 + i)
    }
    return set
  }, [driveW, houseX0, houseFront, entryX, rightFence, leftFence, tufts])

  const far = useMemo(() => {
    const set = emptyPlantSet()
    const rand = seeded(5)
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rand() * 0.1
      const r = 40 + rand() * 20
      const x = Math.cos(a) * r - 3
      const z = Math.sin(a) * r - 4
      addDistantTree(set, new THREE.Vector3(x, 0, z), 8 + rand() * 7, 300 + i)
    }
    // Trees in the back yards.
    for (let i = 0; i < 6; i++) addDistantTree(set, new THREE.Vector3(-18 + i * 6.5 + rand() * 2, 0, -22 - rand() * 4), 7 + rand() * 4, 500 + i)
    return set
  }, [])

  const groundGeometry = useMemo(() => ground(240), [])
  const joints = useMemo(() => {
    const list: Array<[number, number, number, number]> = []
    for (let z = 3; z < KERB; z += 3) list.push([0, z, driveW, 0.012])
    if (driveW > 4) list.push([0, KERB / 2, 0.012, KERB])
    return list
  }, [driveW])

  return (
    <MergeStatic bakeKey={`${doorW}:${letterbox}:${bins}`}>
    <group>
      {/* Lawn everywhere, the hard surfaces on top of it */}
      <mesh geometry={groundGeometry} material={m.lawn} receiveShadow />
      {/* Garage floor runs out under the door to the driveway */}
      <Slab size={[driveW, 0.06, KERB]} position={[0, -0.014, KERB / 2]} material={m.concrete} />
      {joints.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.0165, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d === 0.012 ? 0.012 : d]} />
          <meshStandardMaterial color="#77736b" roughness={1} />
        </mesh>
      ))}
      {/* Footpath, kerb and road */}
      <Slab size={[200, 0.06, FOOTPATH[1] - FOOTPATH[0]]} position={[0, -0.02, (FOOTPATH[0] + FOOTPATH[1]) / 2]} material={m.concrete} />
      <Slab size={[200, 0.15, 0.3]} position={[0, -0.075 + 0.002, KERB + 0.15]} material={m.concrete} />
      <Slab size={[200, 0.06, 9]} position={[0, -0.14, KERB + 0.3 + 4.5]} material={m.asphalt} />
      {/* Entry landing path: stepping pavers from the driveway */}
      {Array.from({ length: Math.max(1, Math.round((-driveW / 2 - (entryX + 1.1)) / 0.85)) }, (_, i) => (
        <Slab key={i} size={[0.6, 0.05, 0.6]} position={[-driveW / 2 - 0.55 - i * 0.85, -0.008, 1.1]} material={m.concrete} />
      ))}
      {/* Garden bed with mulch and a steel edge */}
      <Slab size={[entryX - 1.0 - houseX0, 0.06, 1.45]} position={[(houseX0 + entryX - 1.0) / 2, 0, houseFront + 0.725]} material={m.mulch} />
      <mesh position={[(houseX0 + entryX - 1.0) / 2, 0.04, houseFront + 1.46]} material={m.darkSteel}>
        <boxGeometry args={[entryX - 1.0 - houseX0, 0.08, 0.008]} />
      </mesh>
      {/* Side paths and boundary fences */}
      <Slab size={[rightFence - garageW / 2 - 0.05, 0.05, garageD + 4]} position={[(garageW / 2 + rightFence) / 2, -0.012, -garageD / 2 - 1]} material={m.concrete} />
      <ColorbondFence from={[rightFence, -0.4]} to={[rightFence, -20]} m={m} />
      <ColorbondFence from={[leftFence, houseFront - 0.5]} to={[leftFence, -20]} m={m} />
      <ColorbondFence from={[leftFence, -20]} to={[rightFence, -20]} m={m} />
      {bins && <WheelieBin position={[garageW / 2 + 0.62, 0, -1.4]} lid="#c8302d" m={m} />}
      {bins && <WheelieBin position={[garageW / 2 + 0.62, 0, -2.25]} lid="#e8b923" m={m} />}
      {/* Brick letterbox pillar by the driveway */}
      {letterbox && <group position={[-driveW / 2 - 0.55, 0, FRONT_BOUNDARY - 0.3]}>
        <Slab size={[0.46, 1.15, 0.46]} position={[0, 0.575, 0]} material={m.brick} />
        <Slab size={[0.52, 0.06, 0.52]} position={[0, 1.18, 0]} material={m.colorbond} />
        <mesh position={[0, 0.88, 0.232]} material={m.darkSteel}>
          <boxGeometry args={[0.26, 0.04, 0.006]} />
        </mesh>
      </group>}
      {/* Neighbours either side */}
      <NeighbourHouse position={[rightFence + 7.6, 0, -1.6]} width={12} depth={14} m={m} doorColor="#e7e4dc" />
      <NeighbourHouse position={[leftFence - 7.4, 0, -2.2]} width={12} depth={14} m={m} doorColor="#5a5d5f" />
      <Plants set={near} m={m} shadows={foliageShadows} />
      <Plants set={far} m={m} shadows={false} />
      {/* Garage floor */}
      <Slab size={[garageW - WALL_T * 2, 0.02, garageD - WALL_T]} position={[0, 0.006, -(garageD - WALL_T) / 2]} material={m.slab} />
    </group>
    </MergeStatic>
  )
})
