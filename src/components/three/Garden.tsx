'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useSceneTextures } from './SceneMaterials'

type ClusterShape = { x: number; y: number; z: number }

const LEAF_PALETTES = {
  olive: ['#435d36', '#536e40', '#617949', '#6d8050', '#394f33'],
  deep: ['#344b34', '#415b3b', '#506743', '#5d7049', '#2f4532'],
  silver: ['#56674e', '#647657', '#758362', '#84906c', '#465a45'],
  grass: ['#667b48', '#71834c', '#7b8751', '#566f43', '#89905a'],
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function createLeafGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0,
        -0.035, 0.055, 0.012,
        -0.03, 0.13, 0.018,
        0, 0.205, 0.004,
        0.03, 0.13, 0.018,
        0.035, 0.055, 0.012,
        0, 0.1, 0.041,
      ],
      3
    )
  )
  geometry.setIndex([0, 1, 6, 1, 2, 6, 2, 3, 6, 3, 4, 6, 4, 5, 6, 5, 0, 6])
  geometry.computeVertexNormals()
  return geometry
}

function createBladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.018, 0, 0, 0.018, 0, 0, 0.01, 0.29, 0.02, -0.006, 0.12, 0.012],
      3
    )
  )
  geometry.setIndex([0, 1, 3, 1, 2, 3, 3, 2, 0])
  geometry.computeVertexNormals()
  return geometry
}

const LEAF_GEOMETRY = createLeafGeometry()
const BLADE_GEOMETRY = createBladeGeometry()

function LeafCloud({
  count,
  seed,
  centerY,
  shape,
  palette,
  castShadow = false,
}: {
  count: number
  seed: number
  centerY: number
  shape: ClusterShape
  palette: readonly string[]
  castShadow?: boolean
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.88,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    []
  )

  const leaves = useMemo(() => {
    const random = seededRandom(seed)
    const dummy = new THREE.Object3D()
    const items: Array<{ matrix: THREE.Matrix4; color: THREE.Color }> = []
    for (let i = 0; i < count; i += 1) {
      const vertical = random() * 2 - 1
      const angle = random() * Math.PI * 2
      const radius = Math.cbrt(random())
      const planar = Math.sqrt(1 - vertical * vertical) * radius
      const position = new THREE.Vector3(
        Math.cos(angle) * planar * shape.x,
        centerY + vertical * radius * shape.y,
        Math.sin(angle) * planar * shape.z
      )
      dummy.position.copy(position)
      dummy.rotation.set(
        (random() - 0.5) * 1.2,
        random() * Math.PI * 2,
        (random() - 0.5) * 1.2
      )
      const leafScale = 0.62 + random() * 0.78
      dummy.scale.set(leafScale, leafScale * (0.78 + random() * 0.42), leafScale)
      dummy.updateMatrix()
      const paletteColor = new THREE.Color(palette[Math.floor(random() * palette.length)])
      paletteColor.multiplyScalar(0.88 + random() * 0.24)
      items.push({ matrix: dummy.matrix.clone(), color: paletteColor })
    }
    return items
  }, [centerY, count, palette, seed, shape.x, shape.y, shape.z])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    leaves.forEach((leaf, index) => {
      mesh.setMatrixAt(index, leaf.matrix)
      mesh.setColorAt(index, leaf.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [leaves])

  useLayoutEffect(() => () => material.dispose(), [material])

  return (
    <instancedMesh
      ref={meshRef}
      args={[LEAF_GEOMETRY, material, count]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
    />
  )
}

function GrassPatch({
  centerX,
  centerZ,
  width,
  depth,
  floorY,
  count,
  seed,
}: {
  centerX: number
  centerZ: number
  width: number
  depth: number
  floorY: number
  count: number
  seed: number
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const textures = useSceneTextures()
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, side: THREE.DoubleSide }),
    []
  )
  const blades = useMemo(() => {
    const random = seededRandom(seed)
    const dummy = new THREE.Object3D()
    return Array.from({ length: count }, () => {
      dummy.position.set(
        centerX + (random() - 0.5) * width,
        floorY,
        centerZ + (random() - 0.5) * depth
      )
      dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.45)
      const scale = 0.55 + random() * 1.05
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      return {
        matrix: dummy.matrix.clone(),
        color: new THREE.Color(LEAF_PALETTES.grass[Math.floor(random() * LEAF_PALETTES.grass.length)]),
      }
    })
  }, [centerX, centerZ, count, depth, floorY, seed, width])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    blades.forEach((blade, index) => {
      mesh.setMatrixAt(index, blade.matrix)
      mesh.setColorAt(index, blade.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [blades])

  useLayoutEffect(() => () => material.dispose(), [material])

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, floorY - 0.035, centerZ]}
        receiveShadow
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color="#74835d"
          map={textures.grass.map}
          roughness={1}
          bumpMap={textures.grass.detail}
          bumpScale={0.018}
        />
      </mesh>
      <instancedMesh
        ref={meshRef}
        args={[BLADE_GEOMETRY, material, count]}
        castShadow={false}
        receiveShadow
        frustumCulled={false}
      />
    </>
  )
}

function Tree({
  x,
  z,
  floorY,
  scale,
  seed,
  palette,
}: {
  x: number
  z: number
  floorY: number
  scale: number
  seed: number
  palette: readonly string[]
}) {
  const textures = useSceneTextures()
  const bark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#80634b',
        map: textures.mulch.map,
        bumpMap: textures.mulch.detail,
        bumpScale: 0.035,
        roughness: 0.98,
      }),
    [textures]
  )

  return (
    <group position={[x, floorY, z]} scale={scale}>
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.095, 0.17, 2.1, 9]} />
        {bark && <primitive object={bark} attach="material" />}
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.25, 1.83, 0]}
          rotation={[0, 0, side * -0.38]}
          castShadow
        >
          <cylinderGeometry args={[0.028, 0.072, 1.15, 7]} />
          {bark && <primitive object={bark} attach="material" />}
        </mesh>
      ))}
      <mesh position={[0.02, 2.25, -0.03]} rotation={[0.2, 0, -0.06]} castShadow>
        <cylinderGeometry args={[0.014, 0.043, 0.88, 7]} />
        {bark && <primitive object={bark} attach="material" />}
      </mesh>
      <LeafCloud
        count={460}
        seed={seed}
        centerY={3.05}
        shape={{ x: 1.08, y: 1.02, z: 0.92 }}
        palette={palette}
        castShadow
      />
    </group>
  )
}

function Flower({ x, z, floorY, color }: { x: number; z: number; floorY: number; color: string }) {
  const petal = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        side: THREE.DoubleSide,
      }),
    [color]
  )
  return (
    <group position={[x, floorY, z]} scale={0.72}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.012, 0.36, 5]} />
        <meshStandardMaterial color="#60784b" roughness={0.95} />
      </mesh>
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh
          key={index}
          geometry={LEAF_GEOMETRY}
          material={petal}
          position={[0, 0.35, 0]}
          rotation={[Math.PI / 2, 0, (index * Math.PI * 2) / 5]}
          scale={[0.38, 0.34, 0.38]}
        />
      ))}
      <mesh position={[0, 0.355, 0.014]}>
        <sphereGeometry args={[0.018, 7, 5]} />
        <meshStandardMaterial color="#d5b35c" roughness={0.8} />
      </mesh>
    </group>
  )
}

function MulchBed({
  x,
  z,
  width,
  depth,
  floorY,
}: {
  x: number
  z: number
  width: number
  depth: number
  floorY: number
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-width * 0.5, -depth * 0.42)
    shape.lineTo(-width * 0.32, -depth * 0.5)
    shape.lineTo(width * 0.28, -depth * 0.44)
    shape.lineTo(width * 0.5, -depth * 0.15)
    shape.lineTo(width * 0.43, depth * 0.34)
    shape.lineTo(width * 0.18, depth * 0.5)
    shape.lineTo(-width * 0.38, depth * 0.38)
    shape.closePath()
    return new THREE.ShapeGeometry(shape, 2)
  }, [depth, width])
  const textures = useSceneTextures()

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[x, floorY + 0.012, z]}
      receiveShadow
    >
      <meshStandardMaterial
        color="#725740"
        map={textures.mulch.map}
        bumpMap={textures.mulch.detail}
        bumpScale={0.05}
        roughness={1}
      />
    </mesh>
  )
}

export function Garden({
  doorWidth,
  floorY,
  wallZ,
}: {
  doorWidth: number
  floorY: number
  wallZ: number
}) {
  const textures = useSceneTextures()
  const drivewayWidth = doorWidth + 3.4
  const drivewayDepth = 12.5
  const drivewayCenterZ = wallZ + drivewayDepth / 2 - 0.05
  const drivewayStartZ = drivewayCenterZ - drivewayDepth / 2
  const sideGardenX = drivewayWidth / 2 + 1.15
  const crackGeometry = useMemo(() => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.12, 0, 0.22),
      new THREE.Vector3(0.08, 0, 0.36),
      new THREE.Vector3(0.23, 0, 0.51),
      new THREE.Vector3(0.19, 0, 0.69),
    ]
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.003, 3, false)
  }, [])

  return (
    <group>
      {/* Dark earth below the turf gives the orbit a continuous horizon. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, floorY - 0.12, wallZ - 1.5]}
        receiveShadow
      >
        <planeGeometry args={[40, 42]} />
        <meshStandardMaterial
          color="#5d5748"
          map={textures.mulch.map}
          bumpMap={textures.mulch.detail}
          bumpScale={0.04}
          roughness={1}
        />
      </mesh>

      {/* One continuous slab with joints, a faint hairline crack and a
          slightly rounded exposed edge; its top meets the closed door. */}
      <mesh position={[0, floorY - 0.005, drivewayCenterZ]} castShadow receiveShadow>
        <boxGeometry args={[drivewayWidth, 0.13, drivewayDepth, 1, 1, 2]} />
        <meshStandardMaterial
          color="#aaa79f"
          map={textures.concrete.map}
          bumpMap={textures.concrete.detail}
          bumpScale={0.026}
          roughness={0.88}
          metalness={0}
        />
      </mesh>

      {Array.from({ length: 4 }, (_, index) => (
        <mesh
          key={`joint-${index}`}
          position={[
            0,
            floorY + 0.061,
            drivewayStartZ + 2.7 + index * 2.65,
          ]}
          receiveShadow
        >
          <boxGeometry args={[drivewayWidth - 0.14, 0.004, 0.012]} />
          <meshStandardMaterial color="#77766f" roughness={1} />
        </mesh>
      ))}
      <mesh
        position={[0, floorY + 0.061, drivewayCenterZ]}
        receiveShadow
      >
        <boxGeometry args={[0.01, 0.004, drivewayDepth - 0.12]} />
        <meshStandardMaterial color="#85827a" roughness={1} />
      </mesh>
      <mesh
        geometry={crackGeometry}
        position={[drivewayWidth * 0.31, floorY + 0.062, drivewayStartZ + 5.1]}
        receiveShadow
      >
        <meshStandardMaterial color="#77766f" roughness={1} />
      </mesh>

      <GrassPatch
        centerX={-(drivewayWidth / 2 + 4.6)}
        centerZ={wallZ + 3}
        width={7.4}
        depth={22}
        floorY={floorY}
        count={1450}
        seed={821}
      />
      <GrassPatch
        centerX={drivewayWidth / 2 + 4.6}
        centerZ={wallZ + 3}
        width={7.4}
        depth={22}
        floorY={floorY}
        count={1450}
        seed={1543}
      />
      <GrassPatch
        centerX={0}
        centerZ={wallZ - 8}
        width={26}
        depth={8}
        floorY={floorY}
        count={760}
        seed={2897}
      />

      {[-1, 1].map((side) => {
        const x = side * sideGardenX
        return (
          <group key={`bed-${side}`}>
            <MulchBed
              x={x}
              z={wallZ + 2.25}
              width={2.2}
              depth={3.7}
              floorY={floorY}
            />
            <MulchBed
              x={side * (drivewayWidth / 2 + 3.3)}
              z={wallZ + 7.1}
              width={2.7}
              depth={4.5}
              floorY={floorY}
            />
            <group position={[x, floorY, wallZ + 2.25]}>
              <LeafCloud
                count={165}
                seed={side < 0 ? 113 : 293}
                centerY={0.51}
                shape={{ x: 0.78, y: 0.47, z: 0.65 }}
                palette={side < 0 ? LEAF_PALETTES.olive : LEAF_PALETTES.silver}
              />
            </group>
            <group position={[side * (drivewayWidth / 2 + 3.3), floorY, wallZ + 7.1]}>
              <LeafCloud
                count={190}
                seed={side < 0 ? 419 : 557}
                centerY={0.56}
                shape={{ x: 0.86, y: 0.52, z: 0.72 }}
                palette={side < 0 ? LEAF_PALETTES.deep : LEAF_PALETTES.olive}
              />
            </group>
            <Flower
              x={x + side * 0.42}
              z={wallZ + 2.05}
              floorY={floorY + 0.02}
              color={side < 0 ? '#e9ddd0' : '#e6d6c1'}
            />
            <Flower
              x={x - side * 0.5}
              z={wallZ + 2.55}
              floorY={floorY + 0.02}
              color={side < 0 ? '#d8b5ad' : '#efe5d4'}
            />
          </group>
        )
      })}

      <Tree
        x={-(drivewayWidth / 2 + 5.2)}
        z={wallZ + 1.5}
        floorY={floorY}
        scale={1.12}
        seed={1019}
        palette={LEAF_PALETTES.olive}
      />
      <Tree
        x={drivewayWidth / 2 + 5.3}
        z={wallZ + 4.2}
        floorY={floorY}
        scale={0.94}
        seed={2027}
        palette={LEAF_PALETTES.deep}
      />
    </group>
  )
}
