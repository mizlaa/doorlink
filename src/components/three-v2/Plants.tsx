'use client'

import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HouseMaterials } from './materials'
import { seeded } from './geometry'

/**
 * Plants as instanced leaf cards (alpha-tested, wind in the shader), so a
 * whole garden is a handful of draw calls. Trunks and branches are real
 * tapered tubes with bark.
 */

export type LeafKind = 'gum' | 'shrub' | 'bottlebrush' | 'tuft'

export interface Card {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
}

export interface PlantSet {
  cards: Record<LeafKind, Card[]>
  cores: Array<{ position: THREE.Vector3; radius: number; squash: number }>
  branches: THREE.BufferGeometry[]
}

export function emptyPlantSet(): PlantSet {
  return { cards: { gum: [], shrub: [], bottlebrush: [], tuft: [] }, cores: [], branches: [] }
}

const UP = new THREE.Vector3(0, 1, 0)

function randomUnit(rand: () => number) {
  const u = rand() * 2 - 1
  const a = rand() * Math.PI * 2
  const r = Math.sqrt(1 - u * u)
  return new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a))
}

/** A clipped, rounded shrub (lilly pilly or bottlebrush). */
export function addShrub(set: PlantSet, kind: 'shrub' | 'bottlebrush', at: THREE.Vector3, radius: number, seed: number) {
  const rand = seeded(seed)
  const count = Math.round(70 + radius * 90)
  const squash = 0.82
  const center = at.clone().add(new THREE.Vector3(0, radius * squash, 0))
  for (let i = 0; i < count; i++) {
    const dir = randomUnit(rand)
    if (dir.y < -0.55) dir.y = -0.55
    dir.normalize()
    const p = center.clone().add(new THREE.Vector3(dir.x * radius, dir.y * radius * squash, dir.z * radius).multiplyScalar(0.62 + rand() * 0.38))
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand() * Math.PI * 2))
    const s = radius * (0.75 + rand() * 0.45)
    set.cards[kind].push({ position: p, quaternion: q, scale: new THREE.Vector3(s, s, s) })
  }
  set.cores.push({ position: center, radius: radius * 0.86, squash })
}

/** A clump of lomandra-style grass: crossed blade cards. */
export function addTuft(set: PlantSet, at: THREE.Vector3, height: number, seed: number) {
  const rand = seeded(seed)
  const yaw = rand() * Math.PI
  for (let k = 0; k < 3; k++) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw + (k * Math.PI) / 3)
    const w = height * (0.9 + rand() * 0.3)
    set.cards.tuft.push({ position: at.clone(), quaternion: q, scale: new THREE.Vector3(w, height, w) })
  }
}

/** Hanging eucalypt leaf clumps inside an ellipsoid. */
function addGumClump(set: PlantSet, center: THREE.Vector3, size: THREE.Vector3, count: number, cardSize: number, rand: () => number) {
  for (let i = 0; i < count; i++) {
    const d = randomUnit(rand).multiplyScalar(Math.cbrt(rand()))
    const p = center.clone().add(new THREE.Vector3(d.x * size.x, d.y * size.y, d.z * size.z))
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.4))
    const s = cardSize * (0.75 + rand() * 0.5)
    set.cards.gum.push({ position: p, quaternion: q, scale: new THREE.Vector3(s, s, s) })
  }
}

/** A tube whose radius tapers from r0 to r1, with bark UVs in metres. */
function taperedBranch(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number) {
  const tubular = 10
  const radial = 7
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false)
  const pos = g.attributes.position as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  const length = curve.getLength()
  const center = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, center)
    const r = THREE.MathUtils.lerp(r0, r1, i / tubular)
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(r).add(center)
      pos.setXYZ(idx, v.x, v.y, v.z)
      uv.setXY(idx, (j / radial) * Math.PI * 2 * r * 2, (i / tubular) * length)
    }
  }
  g.computeVertexNormals()
  return g
}

/**
 * A street eucalypt: a pale, slightly leaning trunk splitting into a few
 * rising limbs, with drooping leaf clumps near their ends.
 */
export function addGumTree(set: PlantSet, at: THREE.Vector3, height: number, seed: number) {
  const rand = seeded(seed)
  const lean = new THREE.Vector3((rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5)
  const fork = at.clone().add(new THREE.Vector3(lean.x, height * 0.33, lean.z))
  const trunk = new THREE.CatmullRomCurve3([
    at.clone(),
    at.clone().add(new THREE.Vector3(lean.x * 0.3, height * 0.16, lean.z * 0.3)),
    fork,
  ])
  set.branches.push(taperedBranch(trunk, height * 0.03, height * 0.021))
  const limbs = 5
  const scale = height / 9
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rand() * 0.8
    const reach = height * (0.22 + rand() * 0.14)
    const top = fork.clone().add(new THREE.Vector3(Math.cos(a) * reach, height * (0.24 + rand() * 0.22), Math.sin(a) * reach))
    const mid = fork.clone().lerp(top, 0.5).add(new THREE.Vector3(0, height * 0.03, 0))
    set.branches.push(taperedBranch(new THREE.CatmullRomCurve3([fork.clone(), mid, top]), height * 0.016, height * 0.005))
    const twigEnd = mid.clone().add(new THREE.Vector3(Math.cos(a + 1) * reach * 0.55, height * 0.08, Math.sin(a + 1) * reach * 0.55))
    set.branches.push(
      taperedBranch(new THREE.CatmullRomCurve3([mid.clone(), mid.clone().lerp(twigEnd, 0.5).add(new THREE.Vector3(0, 0.15, 0)), twigEnd]), height * 0.007, height * 0.003)
    )
    // Leaf clumps hang from the limb ends, the twigs and along the limb,
    // so the canopy is a full crown rather than leaves only at the top.
    addGumClump(set, top.clone().add(new THREE.Vector3(0, -0.25 * scale, 0)), new THREE.Vector3(1.5, 1.0, 1.5).multiplyScalar(scale), 30, height / 7, rand)
    addGumClump(set, twigEnd.clone().add(new THREE.Vector3(0, -0.25 * scale, 0)), new THREE.Vector3(1.1, 0.8, 1.1).multiplyScalar(scale), 18, height / 8, rand)
    addGumClump(set, mid.clone().add(new THREE.Vector3(0, -0.2 * scale, 0)), new THREE.Vector3(0.9, 0.7, 0.9).multiplyScalar(scale), 12, height / 8.5, rand)
  }
}

/** Background trees: a short trunk under a full, rounded crown. */
export function addDistantTree(set: PlantSet, at: THREE.Vector3, height: number, seed: number) {
  const rand = seeded(seed)
  const top = at.clone().add(new THREE.Vector3((rand() - 0.5) * 0.6, height * 0.4, (rand() - 0.5) * 0.6))
  set.branches.push(taperedBranch(new THREE.LineCurve3(at.clone(), top), height * 0.028, height * 0.018))
  const clumps = 5 + Math.floor(rand() * 3)
  for (let i = 0; i < clumps; i++) {
    const c = at.clone().add(new THREE.Vector3((rand() - 0.5) * height * 0.4, height * (0.42 + rand() * 0.42), (rand() - 0.5) * height * 0.4))
    addGumClump(set, c, new THREE.Vector3(height * 0.22, height * 0.16, height * 0.22), 11, height * 0.24, rand)
  }
}

function LeafInstances({ cards, material, depth, geometry, shadows }: { cards: Card[]; material: THREE.Material; depth: THREE.Material; geometry: THREE.BufferGeometry; shadows: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const matrix = new THREE.Matrix4()
    const tint = new THREE.Color()
    cards.forEach((c, i) => {
      m.setMatrixAt(i, matrix.compose(c.position, c.quaternion, c.scale))
      // Each card a little lighter, darker, warmer or cooler: foliage stops reading as one repeated texture.
      const h = Math.sin(i * 12.9898 + c.position.x * 3.1) * 43758.5453
      const r = h - Math.floor(h)
      const k = 0.8 + r * 0.32
      m.setColorAt(i, tint.setRGB(k * (0.96 + r * 0.1), k, k * (1.02 - r * 0.1)))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [cards])
  if (cards.length === 0) return null
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, cards.length]}
      castShadow={shadows}
      receiveShadow
      customDepthMaterial={depth}
    />
  )
}

const cardGeometry = new THREE.PlaneGeometry(1, 1)
const tuftGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)

export const Plants = memo(function Plants({ set, m, shadows }: { set: PlantSet; m: HouseMaterials; shadows: boolean }) {
  const branches = useMemo(() => (set.branches.length ? mergeGeometries(set.branches) : null), [set])
  const core = useMemo(() => new THREE.IcosahedronGeometry(1, 2), [])
  return (
    <group>
      {branches && <mesh geometry={branches} material={m.bark} castShadow receiveShadow />}
      {set.cores.map((c, i) => (
        <mesh key={i} geometry={core} material={m.core} position={c.position} scale={[c.radius, c.radius * c.squash, c.radius]} castShadow={shadows} receiveShadow />
      ))}
      <LeafInstances cards={set.cards.gum} material={m.leafGum} depth={m.leafDepth.gum} geometry={cardGeometry} shadows={shadows} />
      <LeafInstances cards={set.cards.shrub} material={m.leafShrub} depth={m.leafDepth.shrub} geometry={cardGeometry} shadows={shadows} />
      <LeafInstances cards={set.cards.bottlebrush} material={m.leafBottlebrush} depth={m.leafDepth.bottlebrush} geometry={cardGeometry} shadows={shadows} />
      <LeafInstances cards={set.cards.tuft} material={m.leafTuft} depth={m.leafDepth.tuft} geometry={tuftGeometry} shadows={false} />
    </group>
  )
})
