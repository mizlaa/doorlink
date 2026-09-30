'use client'

import { useSceneTextures } from './SceneMaterials'

const HOUSE_COLOR = '#E4E2DC'
const ROOF_COLOR = '#4b514f'

function HouseWindow({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow position={[0, 0, -0.012]}>
        <boxGeometry args={[0.98, 1.16, 0.12]} />
        <meshStandardMaterial color="#353b3e" roughness={0.46} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[0.78, 0.94]} />
        <meshPhysicalMaterial
          color="#b8c8d2"
          roughness={0.16}
          metalness={0.08}
          transmission={0.16}
          clearcoat={0.7}
          envMapIntensity={1.4}
        />
      </mesh>
      <mesh position={[0, 0, 0.064]}>
        <boxGeometry args={[0.035, 0.94, 0.025]} />
        <meshStandardMaterial color="#d3d0c8" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.064]}>
        <boxGeometry args={[0.78, 0.035, 0.025]} />
        <meshStandardMaterial color="#d3d0c8" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.61, 0.035]} castShadow>
        <boxGeometry args={[1.04, 0.09, 0.2]} />
        <meshStandardMaterial color="#c9c4ba" roughness={0.82} />
      </mesh>
    </group>
  )
}

// The garage door's own jambs/header (drawn separately, right around the
// opening, at the same wallZ) already hide the panels when open and give
// the door a tight, recessed-into-the-wall look — this is the *rest* of
// the house around that: two wing walls starting just outside the jambs
// (never overlapping the door's own footprint, so there's no z-fighting
// between the two), a pitched roof spanning the full width above both,
// a couple of windows, and a chimney.
export function House({
  doorWidth,
  jambOuterX,
  wallTopY,
  wallZ,
  floorY,
}: {
  doorWidth: number
  jambOuterX: number
  wallTopY: number
  wallZ: number
  floorY: number
}) {
  const houseHalfWidth = doorWidth / 2 + 2.0
  const overhang = 0.4
  const roofRun = houseHalfWidth + overhang
  const pitch = 0.38
  const roofRise = roofRun * Math.tan(pitch)
  const slabLength = roofRun / Math.cos(pitch)
  const roofDepth = 5.1
  const roofThickness = 0.08
  const wingWidth = houseHalfWidth - jambOuterX
  const wingCenterX = jambOuterX + wingWidth / 2
  const wingDepth = 4.8
  const textures = useSceneTextures()

  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={`wing-${side}`}
          position={[
            side * wingCenterX,
            floorY + (wallTopY - floorY) / 2,
            wallZ - wingDepth / 2 + 0.12,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[wingWidth, wallTopY - floorY, wingDepth]} />
          <meshStandardMaterial
            color={HOUSE_COLOR}
            map={textures.plaster.map}
            bumpMap={textures.plaster.detail}
            bumpScale={0.018}
            roughness={0.92}
            envMapIntensity={0.35}
          />
        </mesh>
      ))}

      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[
            side * (roofRun / 2),
            wallTopY + roofRise / 2,
            wallZ - roofDepth / 2 + 0.16,
          ]}
          rotation={[0, 0, side * -pitch]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[slabLength, roofThickness, roofDepth]} />
          <meshStandardMaterial
            color={ROOF_COLOR}
            map={textures.roof.map}
            bumpMap={textures.roof.detail}
            bumpScale={0.025}
            roughness={0.83}
            metalness={0.08}
            envMapIntensity={0.5}
          />
        </mesh>
      ))}

      {/* Fascia and gutters provide a clean, believable edge transition
          where the roof meets the rendered wall. */}
      <mesh position={[0, wallTopY + 0.01, wallZ + 0.22]} castShadow>
        <boxGeometry args={[roofRun * 2 + 0.24, 0.15, 0.18]} />
        <meshStandardMaterial color="#3e4545" roughness={0.62} metalness={0.12} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`rainwater-${side}`}>
          <mesh position={[side * roofRun, wallTopY - 0.09, wallZ + 0.22]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, roofDepth + 0.18, 10]} />
            <meshStandardMaterial color="#525958" roughness={0.54} metalness={0.25} />
          </mesh>
          <mesh position={[side * roofRun, (wallTopY + floorY) / 2, wallZ + 0.22]} castShadow>
            <cylinderGeometry args={[0.042, 0.05, wallTopY - floorY - 0.1, 8]} />
            <meshStandardMaterial color="#656a68" roughness={0.62} metalness={0.22} />
          </mesh>
          <mesh position={[side * roofRun, floorY + 0.09, wallZ + 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.05, 0.28, 8]} />
            <meshStandardMaterial color="#656a68" roughness={0.62} metalness={0.22} />
          </mesh>
        </group>
      ))}

      <HouseWindow x={-(doorWidth / 2 + 1.05)} y={1.15} z={wallZ + 0.22} />
      <HouseWindow x={doorWidth / 2 + 1.05} y={1.15} z={wallZ + 0.22} />

      <mesh position={[houseHalfWidth * 0.55, wallTopY + roofRise + 0.4, wallZ - 1.1]} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.9, 0.38]} />
        <meshStandardMaterial
          color="#77736b"
          map={textures.plaster.map}
          bumpMap={textures.plaster.detail}
          bumpScale={0.014}
          roughness={0.9}
        />
      </mesh>
    </group>
  )
}
