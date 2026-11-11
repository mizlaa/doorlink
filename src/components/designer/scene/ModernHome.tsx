'use client'

import { memo, useMemo } from 'react'
import * as THREE from 'three'
import type { HouseMaterials } from '@/components/three-v2/materials'
import { MergeStatic } from '@/components/three-v2/merge'
import { extrudeUV, wallWithOpenings, worldBox } from '@/components/three-v2/geometry'
import { TileRoofBlock, WALL_T, WindowUnit, type HouseLayout } from '@/components/three-v2/House'

/**
 * The designer's house: a light rendered two-storey home seen from the
 * driveway, with the garage in front under a skirt roof and the upper
 * floor set back above it. The garage opening is centred on x = 0 with
 * its front face at z = 0, the same convention as the other scenes, so
 * the doors, the garage interior and the landscape all drop in unchanged.
 */

const EAVE = 0.45
const UPPER_H = 2.6
const UPPER_D = 8

export function modernLayout(doorW: number, doorH: number): HouseLayout {
  const garageH = Math.max(2.95, doorH + 0.8)
  return {
    doorW,
    doorH,
    garageW: doorW + 1.5,
    garageD: 6.4,
    garageH,
    ceiling: garageH - 0.04,
    houseW: 6.6,
    houseD: 11,
    houseH: garageH,
    houseFront: -1.5,
  }
}

function Box({
  args,
  position,
  material,
  cast = true,
}: {
  args: [number, number, number]
  position: [number, number, number]
  material: THREE.Material
  cast?: boolean
}) {
  const geometry = useMemo(() => worldBox(...args), [args[0], args[1], args[2]])
  return <mesh geometry={geometry} material={material} position={position} castShadow={cast} receiveShadow />
}

/** A lean-to roof: eave at the front, rising to the wall behind. Origin at the eave's centre. */
function skirtGeometry(width: number, depth: number, rise: number) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(depth, rise)
  s.lineTo(depth, rise - 0.06)
  s.lineTo(0.02, -0.06)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, UVGenerator: extrudeUV })
  // Shape x runs back from the eave (→ world −z); the extrusion runs across (→ world x).
  g.rotateY(Math.PI / 2)
  g.translate(-width / 2, 0, 0)
  return g
}

function WallLight({ position, m }: { position: [number, number, number]; m: HouseMaterials }) {
  return (
    <group position={position}>
      <Box args={[0.11, 0.26, 0.09]} position={[0, 0, 0.045]} material={m.frame} />
      <Box args={[0.075, 0.06, 0.07]} position={[0, -0.11, 0.05]} material={m.lamp} cast={false} />
      <Box args={[0.075, 0.06, 0.07]} position={[0, 0.11, 0.05]} material={m.lamp} cast={false} />
    </group>
  )
}

function FrontDoor({ m }: { m: HouseMaterials }) {
  const doorW = 0.92
  const doorH = 2.34
  return (
    <group>
      <Box args={[1.45, 0.05, 0.12]} position={[0.725, doorH - 0.025, -0.12]} material={m.frame} />
      <Box args={[0.05, doorH, 0.12]} position={[0.025, doorH / 2, -0.12]} material={m.frame} />
      <Box args={[0.05, doorH, 0.12]} position={[1.425, doorH / 2, -0.12]} material={m.frame} />
      <Box args={[0.05, doorH, 0.12]} position={[doorW + 0.05, doorH / 2, -0.12]} material={m.frame} />
      <Box args={[doorW - 0.02, doorH - 0.06, 0.045]} position={[doorW / 2 + 0.03, (doorH - 0.06) / 2, -0.15]} material={m.timber} />
      <mesh position={[0.24, doorH / 2, -0.126]} material={m.glass}>
        <planeGeometry args={[0.09, doorH - 0.5]} />
      </mesh>
      <Box args={[0.025, 0.9, 0.025]} position={[doorW - 0.1, 1.05, -0.09]} material={m.frame} />
      <mesh position={[doorW + 0.26, doorH / 2, -0.14]} material={m.glass}>
        <planeGeometry args={[0.42, doorH - 0.08]} />
      </mesh>
      <mesh position={[doorW + 0.26, doorH / 2, -0.4]} material={m.curtain}>
        <planeGeometry args={[0.5, doorH]} />
      </mesh>
    </group>
  )
}

export const ModernHome = memo(function ModernHome({ layout, m }: { layout: HouseLayout; m: HouseMaterials }) {
  const { doorW, doorH, garageW, garageD, garageH, houseW, houseD, houseH, houseFront } = layout
  const houseX0 = -garageW / 2 - houseW
  const pier = (garageW - doorW) / 2

  const garageFront = useMemo(
    () => wallWithOpenings(garageW, garageH, WALL_T, [{ x: pier, y: 0, w: doorW, h: doorH }]),
    [garageW, garageH, doorW, doorH, pier]
  )
  const entry = { x: houseW - 2.55, y: 0, w: 1.45, h: 2.34 }
  const lounge = { x: 0.95, y: 0.45, w: 2.3, h: 1.95 }
  const wingFront = useMemo(
    () => wallWithOpenings(houseW, houseH, WALL_T, [lounge, entry]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [houseW, houseH]
  )

  // Upper floor: over the whole ground floor, set back behind the garage.
  const upperX0 = houseX0
  const upperW = houseW + garageW
  const upperCx = upperX0 + upperW / 2
  const upperFront = houseFront
  const upperY = houseH
  const skirtW = garageW + EAVE * 2
  const skirtD = -houseFront + EAVE
  const skirt = useMemo(() => skirtGeometry(skirtW, skirtD, 0.52), [skirtW, skirtD])

  // Windows upstairs: three over the garage, one wide one over the entry wing.
  const overGarage = [-1, 0, 1].map((i) => i * Math.min(1.75, (garageW - 1.6) / 3 + 0.2))
  const portico = { x: houseX0 + entry.x - 0.45, w: entry.w + 0.9, d: 1.9 }

  return (
    <MergeStatic bakeKey={`modern:${doorW}:${doorH}`}>
      <group>
        {/* ---------- Garage ---------- */}
        <mesh geometry={garageFront} material={m.render} position={[-garageW / 2, 0, -WALL_T]} castShadow receiveShadow />
        {/* Steel jamb lining in the reveal */}
        <Box args={[0.04, doorH, WALL_T]} position={[-doorW / 2 + 0.02, doorH / 2, -WALL_T / 2]} material={m.darkSteel} />
        <Box args={[0.04, doorH, WALL_T]} position={[doorW / 2 - 0.02, doorH / 2, -WALL_T / 2]} material={m.darkSteel} />
        <Box args={[doorW, 0.04, WALL_T]} position={[0, doorH - 0.02, -WALL_T / 2]} material={m.darkSteel} />
        {/* Dark stone-look bases on the piers either side of the door */}
        {[-1, 1].map((side) => (
          <Box key={side} args={[pier + 0.02, 0.95, 0.07]} position={[side * (doorW / 2 + pier / 2), 0.475, 0.035]} material={m.renderFeature} />
        ))}
        {[-1, 1].map((side) => (
          <WallLight key={side} position={[side * (doorW / 2 + pier / 2), Math.min(2.0, doorH - 0.15), 0]} m={m} />
        ))}
        {/* Side and back walls */}
        <Box args={[WALL_T, garageH, garageD - WALL_T]} position={[garageW / 2 - WALL_T / 2, garageH / 2, -WALL_T - (garageD - WALL_T) / 2]} material={m.render} />
        <Box args={[WALL_T, garageH, garageD - WALL_T]} position={[-garageW / 2 + WALL_T / 2, garageH / 2, -WALL_T - (garageD - WALL_T) / 2]} material={m.render} />
        <Box args={[garageW, garageH, WALL_T]} position={[0, garageH / 2, -garageD + WALL_T / 2]} material={m.render} />
        {/* Skirt roof over the garage, with a deep dark fascia and gutter line */}
        <group position={[0, garageH + 0.05, EAVE]}>
          <mesh geometry={skirt} material={m.roof} castShadow receiveShadow />
          <Box args={[skirtW + 0.04, 0.24, 0.035]} position={[0, -0.14, 0.01]} material={m.colorbond} />
          <Box args={[skirtW + 0.08, 0.1, 0.13]} position={[0, -0.07, 0.08]} material={m.colorbond} />
          {[-1, 1].map((side) => (
            <Box key={side} args={[0.035, 0.24, skirtD]} position={[side * (skirtW / 2 + 0.005), -0.14, -skirtD / 2]} material={m.colorbond} />
          ))}
          {/* Eave lining back to the wall */}
          <Box args={[skirtW - 0.04, 0.012, EAVE]} position={[0, -0.26, -EAVE / 2]} material={m.soffit} cast={false} />
        </group>

        {/* ---------- Ground-floor wing with the entry ---------- */}
        <mesh geometry={wingFront} material={m.render} position={[houseX0, 0, houseFront - WALL_T]} castShadow receiveShadow />
        <group position={[houseX0 + lounge.x, lounge.y, houseFront]}>
          <WindowUnit w={lounge.w} h={lounge.h} m={m} sill={false} />
        </group>
        <group position={[houseX0 + entry.x, 0, houseFront]}>
          <FrontDoor m={m} />
        </group>
        <WallLight position={[houseX0 + entry.x + entry.w + 0.32, 1.95, houseFront]} m={m} />
        {/* Wing side and back walls */}
        <Box args={[WALL_T, houseH, houseD - WALL_T]} position={[houseX0 + WALL_T / 2, houseH / 2, houseFront - WALL_T - (houseD - WALL_T) / 2]} material={m.render} />
        <Box args={[upperW, houseH, WALL_T]} position={[upperCx, houseH / 2, houseFront - houseD + WALL_T / 2]} material={m.render} />
        <Box
          args={[WALL_T, houseH, houseD - houseFront - garageD]}
          position={[garageW / 2 - WALL_T / 2, houseH / 2, (-garageD + houseFront - houseD) / 2]}
          material={m.render}
        />

        {/* Portico: two piers and a flat roof over the front door */}
        <group position={[portico.x, 0, houseFront]}>
          <Box args={[portico.w, 0.14, portico.d]} position={[portico.w / 2, 0.07, portico.d / 2]} material={m.concrete} />
          <Box args={[portico.w + 0.5, 0.07, 0.42]} position={[portico.w / 2, 0.035, portico.d + 0.21]} material={m.concrete} />
          {[0.17, portico.w - 0.17].map((x) => (
            <group key={x} position={[x, 0, portico.d - 0.19]}>
              <Box args={[0.3, 2.62, 0.3]} position={[0, 1.31, 0]} material={m.render} />
              <Box args={[0.38, 0.95, 0.38]} position={[0, 0.475, 0]} material={m.renderFeature} />
            </group>
          ))}
          <Box args={[portico.w + 0.3, 0.26, portico.d + 0.16]} position={[portico.w / 2, 2.75, portico.d / 2 + 0.02]} material={m.colorbond} />
          <Box args={[portico.w + 0.1, 0.012, portico.d]} position={[portico.w / 2, 2.615, portico.d / 2]} material={m.soffit} cast={false} />
        </group>

        {/* ---------- Upper floor ---------- */}
        <Box args={[upperW, UPPER_H, WALL_T]} position={[upperCx, upperY + UPPER_H / 2, upperFront - WALL_T / 2]} material={m.render} />
        <Box args={[WALL_T, UPPER_H, UPPER_D - WALL_T]} position={[upperX0 + WALL_T / 2, upperY + UPPER_H / 2, upperFront - WALL_T - (UPPER_D - WALL_T) / 2]} material={m.render} />
        <Box args={[WALL_T, UPPER_H, UPPER_D - WALL_T]} position={[upperX0 + upperW - WALL_T / 2, upperY + UPPER_H / 2, upperFront - WALL_T - (UPPER_D - WALL_T) / 2]} material={m.render} />
        <Box args={[upperW, UPPER_H, WALL_T]} position={[upperCx, upperY + UPPER_H / 2, upperFront - UPPER_D + WALL_T / 2]} material={m.render} />
        {/* A dark band where the two storeys meet, along the wing */}
        <Box args={[houseW + 0.04, 0.22, 0.05]} position={[houseX0 + houseW / 2, upperY + 0.02, upperFront + 0.025]} material={m.colorbond} />
        {overGarage.map((x) => (
          <group key={x} position={[x - 0.62, upperY + 0.95, upperFront + 0.001]}>
            <WindowUnit w={1.24} h={1.3} m={m} surface sill={false} />
          </group>
        ))}
        <group position={[houseX0 + 1.5, upperY + 0.95, upperFront + 0.001]}>
          <WindowUnit w={2.2} h={1.3} m={m} surface sill={false} />
        </group>
        <group position={[houseX0 + houseW - 2.1, upperY + 0.95, upperFront + 0.001]}>
          <WindowUnit w={1.24} h={1.3} m={m} surface sill={false} />
        </group>
        {/* Side windows, so the house reads as lived-in from either side */}
        {[-3, -6.2].map((z) => (
          <group key={z} position={[upperX0 + upperW + 0.001, upperY + 0.95, z]} rotation={[0, Math.PI / 2, 0]}>
            <WindowUnit w={1.3} h={1.3} m={m} surface sill={false} />
          </group>
        ))}
        {[-2.2, -5.4].map((z) => (
          <group key={z} position={[upperX0 - 0.001, upperY + 0.95, z]} rotation={[0, -Math.PI / 2, 0]}>
            <WindowUnit w={1.3} h={1.3} m={m} surface sill={false} />
          </group>
        ))}
        <TileRoofBlock width={upperW} depth={UPPER_D} cx={upperCx} cz={upperFront - UPPER_D / 2} y={upperY + UPPER_H} m={m} />
        {/* Single-storey roof behind the upper floor */}
        <TileRoofBlock width={upperW} depth={houseD - UPPER_D} cx={upperCx} cz={upperFront - UPPER_D - (houseD - UPPER_D) / 2} y={houseH} m={m} />
      </group>
    </MergeStatic>
  )
})
