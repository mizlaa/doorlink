import { memo, useMemo } from 'react'
import * as THREE from 'three'
import type { HouseMaterials } from './materials'
import { MergeStatic } from './merge'
import { extrudeUV, hipRoof, placeAlong, wallWithOpenings, worldBox } from './geometry'

/**
 * A single-storey Australian brick-veneer home: face-brick walls, a
 * rendered bulkhead over the garage door, hipped concrete-tile roofs with
 * 450 mm eaves, Colorbond fascia and quad gutters, aluminium windows with
 * brick sills, and a timber entry door under a rendered portal. All in
 * metres; the garage door opening is centred on x = 0, front face z = 0.
 */

export const WALL_T = 0.25
const EAVE = 0.45
const PITCH = 22.5
const underside = new THREE.MeshStandardMaterial({ color: '#f4f3ef', side: THREE.BackSide, roughness: 0.9 })

export interface HouseLayout {
  doorW: number
  doorH: number
  garageW: number
  garageD: number
  garageH: number
  ceiling: number
  houseW: number
  houseD: number
  houseH: number
  houseFront: number
}

export function houseLayout(doorW: number, doorH: number): HouseLayout {
  const garageH = Math.max(2.72, doorH + 0.62)
  return {
    doorW,
    doorH,
    garageW: doorW + 1.1,
    garageD: 6.4,
    garageH,
    ceiling: garageH - 0.04,
    houseW: 11.5,
    houseD: 13,
    houseH: 2.75,
    houseFront: -0.9,
  }
}

function Box({
  args,
  position,
  material,
  rotation,
  cast = true,
  receive = true,
}: {
  args: [number, number, number]
  position: [number, number, number]
  material: THREE.Material
  rotation?: [number, number, number]
  cast?: boolean
  receive?: boolean
}) {
  const geometry = useMemo(() => worldBox(...args), [args[0], args[1], args[2]])
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={cast} receiveShadow={receive} />
}

/** Quad gutter profile, extruded along an edge. */
function gutterGeometry(length: number) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(0, 0.115)
  s.lineTo(0.012, 0.115)
  s.lineTo(0.012, 0.012)
  s.lineTo(0.098, 0.012)
  s.lineTo(0.112, 0.1)
  s.lineTo(0.124, 0.125)
  s.lineTo(0.134, 0.122)
  s.lineTo(0.112, 0)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, UVGenerator: extrudeUV })
  g.translate(0, 0, -length / 2)
  return g
}

/** Fascia, gutter and eave lining around a hipped roof's edge. */
function RoofEdge({
  width,
  depth,
  y,
  m,
  skip,
}: {
  width: number
  depth: number
  y: number
  m: HouseMaterials
  skip?: Array<'left' | 'right' | 'front' | 'back'>
}) {
  const W = width + EAVE * 2
  const D = depth + EAVE * 2
  const edges = useMemo(
    () =>
      (
        [
          { side: 'front' as const, length: W, pos: [0, 0, D / 2] as const, rot: 0 },
          { side: 'back' as const, length: W, pos: [0, 0, -D / 2] as const, rot: Math.PI },
          { side: 'right' as const, length: D, pos: [W / 2, 0, 0] as const, rot: Math.PI / 2 },
          { side: 'left' as const, length: D, pos: [-W / 2, 0, 0] as const, rot: -Math.PI / 2 },
        ]
      ).filter((e) => !skip?.includes(e.side)),
    [W, D, skip]
  )
  const gutters = useMemo(() => edges.map((e) => gutterGeometry(e.length + 0.02)), [edges])
  return (
    <group position={[0, y, 0]}>
      {edges.map((e, i) => (
        <group key={e.side} position={[e.pos[0], 0, e.pos[2]]} rotation={[0, e.rot, 0]}>
          {/* Fascia board */}
          <Box args={[e.length, 0.2, 0.025]} position={[0, -0.1, -0.012]} material={m.colorbond} />
          {/* Quad gutter on the fascia */}
          <mesh geometry={gutters[i]} material={m.colorbond} position={[0, -0.16, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />
          {/* Eave lining from the fascia back to the wall */}
          <Box
            args={[e.side === 'front' || e.side === 'back' ? e.length - 0.05 : e.length - EAVE * 2 - 0.05, 0.012, EAVE]}
            position={[0, -0.2, -EAVE / 2 - 0.02]}
            material={m.soffit}
            cast={false}
          />
        </group>
      ))}
    </group>
  )
}

/** Hipped tile roof with mortar-bedded ridge and hip capping. */
function TileRoof({ width, depth, y, m }: { width: number; depth: number; y: number; m: HouseMaterials }) {
  const roof = useMemo(() => hipRoof(width + EAVE * 2, depth + EAVE * 2, PITCH), [width, depth])
  const caps = useMemo(() => {
    const lines = [...roof.hips, ...(roof.ridge ? [roof.ridge] : [])]
    return lines.map(([a, b]) => {
      const lift = new THREE.Vector3(0, 0.05, 0)
      return [a.clone().add(lift), b.clone().add(lift)] as const
    })
  }, [roof])
  const capGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(0.13, 0.13, 1, 10, 1, false, -Math.PI / 2, Math.PI)
  }, [])
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={roof.geometry} material={m.roof} castShadow receiveShadow />
      {/* Underside, so the roof reads solid from below the eaves. */}
      <mesh geometry={roof.geometry} material={underside} position={[0, -0.03, 0]} />
      {caps.map(([a, b], i) => (
        <CapPiece key={i} from={a} to={b} geometry={capGeometry} material={m.ridge} />
      ))}
    </group>
  )
}

function CapPiece({ from, to, geometry, material }: { from: THREE.Vector3; to: THREE.Vector3; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const ref = useMemo(() => {
    const o = new THREE.Object3D()
    placeAlong(o, from, to)
    return o
  }, [from, to])
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={ref.position}
      quaternion={ref.quaternion}
      scale={[0.75, ref.scale.y, 0.55]}
      castShadow
    />
  )
}

/**
 * An aluminium window in an opening: frame, sliding sashes, glass, a
 * brick sill below and curtains behind. Origin at the opening's
 * bottom-left on the wall face; the wall is behind (−z).
 */
export function WindowUnit({
  w,
  h,
  m,
  slider = true,
  sill = true,
  surface = false,
}: {
  w: number
  h: number
  m: HouseMaterials
  slider?: boolean
  sill?: boolean
  surface?: boolean
}) {
  const f = 0.05
  const z = surface ? 0.04 : -0.11
  return (
    <group>
      {/* Outer frame */}
      <Box args={[w, f, 0.07]} position={[w / 2, f / 2, z]} material={m.frame} />
      <Box args={[w, f, 0.07]} position={[w / 2, h - f / 2, z]} material={m.frame} />
      <Box args={[f, h, 0.07]} position={[f / 2, h / 2, z]} material={m.frame} />
      <Box args={[f, h, 0.07]} position={[w - f / 2, h / 2, z]} material={m.frame} />
      {slider && <Box args={[0.06, h - f * 2, 0.08]} position={[w / 2, h / 2, z]} material={m.frame} />}
      {/* Glass, two panes on a slider so they sit in different planes */}
      <mesh position={[w * 0.25 + f / 4, h / 2, z - 0.012]} material={m.glass}>
        <planeGeometry args={[slider ? w / 2 - f : w - f * 2, h - f * 2]} />
      </mesh>
      {slider && (
        <mesh position={[w * 0.75 - f / 4, h / 2, z + 0.012]} material={m.glass}>
          <planeGeometry args={[w / 2 - f, h - f * 2]} />
        </mesh>
      )}
      {/* Curtains behind the glass (or a dark backing on a surface window) */}
      {surface ? (
        <mesh position={[w / 2, h / 2, 0.006]}>
          <planeGeometry args={[w - f, h - f]} />
          <meshStandardMaterial color="#2c3236" roughness={0.6} />
        </mesh>
      ) : (
        <mesh position={[w / 2, h / 2, -0.45]} material={m.curtain}>
          <planeGeometry args={[w + 0.3, h + 0.3]} />
        </mesh>
      )}
      {sill && (
        <Box args={[w + 0.12, 0.09, surface ? 0.08 : 0.34]} position={[w / 2, -0.045, surface ? 0.02 : -0.11]} material={m.brick} />
      )}
      {!surface && <Box args={[w + 0.24, 0.012, 0.12]} position={[w / 2, h + 0.006, -0.05]} material={m.darkSteel} />}
    </group>
  )
}

function EntryDoor({ m }: { m: HouseMaterials }) {
  const doorW = 0.92
  const doorH = 2.34
  return (
    <group>
      {/* Frame */}
      <Box args={[1.45, 0.05, 0.12]} position={[0.725, doorH - 0.025, -0.12]} material={m.frame} />
      <Box args={[0.05, doorH, 0.12]} position={[0.025, doorH / 2, -0.12]} material={m.frame} />
      <Box args={[0.05, doorH, 0.12]} position={[1.425, doorH / 2, -0.12]} material={m.frame} />
      <Box args={[0.05, doorH, 0.12]} position={[doorW + 0.05, doorH / 2, -0.12]} material={m.frame} />
      {/* Timber door leaf with a slim glass strip and a long pull handle */}
      <Box args={[doorW - 0.02, doorH - 0.06, 0.045]} position={[doorW / 2 + 0.03, (doorH - 0.06) / 2, -0.15]} material={m.timber} />
      <mesh position={[0.24, doorH / 2, -0.126]} material={m.glass}>
        <planeGeometry args={[0.09, doorH - 0.5]} />
      </mesh>
      <Box args={[0.025, 0.9, 0.025]} position={[doorW - 0.1, 1.05, -0.09]} material={m.frame} />
      {/* Sidelight */}
      <mesh position={[doorW + 0.26, doorH / 2, -0.14]} material={m.glass}>
        <planeGeometry args={[0.42, doorH - 0.08]} />
      </mesh>
      <mesh position={[doorW + 0.26, doorH / 2, -0.4]} material={m.curtain}>
        <planeGeometry args={[0.5, doorH]} />
      </mesh>
      {/* Wall light */}
      <Box args={[0.12, 0.22, 0.1]} position={[1.75, 2.0, 0.05]} material={m.frame} />
      <Box args={[0.08, 0.04, 0.06]} position={[1.75, 1.91, 0.07]} material={m.lamp} cast={false} />
    </group>
  )
}

export const House = memo(function House({ layout, m }: { layout: HouseLayout; m: HouseMaterials }) {
  const { doorW, doorH, garageW, garageD, garageH, houseW, houseD, houseH, houseFront } = layout
  const garageFront = useMemo(
    () => wallWithOpenings(garageW, garageH, WALL_T, [{ x: (garageW - doorW) / 2, y: 0, w: doorW, h: doorH }]),
    [garageW, garageH, doorW, doorH]
  )
  const win1 = { x: 1.3, y: 0.95, w: 2.1, h: 1.5 }
  const win2 = { x: 4.3, y: 0.65, w: 2.6, h: 1.8 }
  const entry = { x: houseW - 2.55, y: 0, w: 1.45, h: 2.34 }
  const houseFrontWall = useMemo(
    () => wallWithOpenings(houseW, houseH, WALL_T, [win1, win2, entry]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [houseW, houseH]
  )
  const houseX0 = -garageW / 2 - houseW
  const houseCx = -garageW / 2 - houseW / 2
  const houseCz = houseFront - houseD / 2
  const bulkheadH = garageH - doorH

  return (
    <MergeStatic bakeKey={`${doorW}:${doorH}`}>
    <group>
      {/* ---------- Garage ---------- */}
      <mesh geometry={garageFront} material={m.brick} position={[-garageW / 2, 0, -WALL_T]} castShadow receiveShadow />
      {/* Rendered bulkhead over the door */}
      <Box args={[garageW + 0.02, bulkheadH + 0.01, 0.05]} position={[0, doorH + bulkheadH / 2, 0.025]} material={m.render} />
      {/* Steel jamb lining in the reveal */}
      <Box args={[0.04, doorH, WALL_T]} position={[-doorW / 2 + 0.02, doorH / 2, -WALL_T / 2]} material={m.darkSteel} />
      <Box args={[0.04, doorH, WALL_T]} position={[doorW / 2 - 0.02, doorH / 2, -WALL_T / 2]} material={m.darkSteel} />
      <Box args={[doorW, 0.04, WALL_T]} position={[0, doorH - 0.02, -WALL_T / 2]} material={m.darkSteel} />
      {/* Side and back walls */}
      <Box args={[WALL_T, garageH, garageD - WALL_T]} position={[garageW / 2 - WALL_T / 2, garageH / 2, -WALL_T - (garageD - WALL_T) / 2]} material={m.brick} />
      <Box args={[WALL_T, garageH, garageD - WALL_T]} position={[-garageW / 2 + WALL_T / 2, garageH / 2, -WALL_T - (garageD - WALL_T) / 2]} material={m.brick} />
      <Box args={[garageW, garageH, WALL_T]} position={[0, garageH / 2, -garageD + WALL_T / 2]} material={m.brick} />
      {/* A small window in the garage's side wall */}
      <group position={[garageW / 2 + 0.001, 1.1, -garageD + 1.6]} rotation={[0, Math.PI / 2, 0]}>
        <WindowUnit w={0.9} h={0.9} m={m} slider={false} surface />
      </group>
      <TileRoofBlock width={garageW} depth={garageD} cx={0} cz={-garageD / 2} y={garageH} m={m} />
      {/* Downpipe down the garage's side wall, with its offset to the gutter */}
      <Downpipe x={garageW / 2 + 0.045} z={-0.18} top={garageH - 0.24} gutterX={garageW / 2 + EAVE + 0.07} m={m} />

      {/* ---------- House ---------- */}
      <mesh geometry={houseFrontWall} material={m.brick} position={[houseX0, 0, houseFront - WALL_T]} castShadow receiveShadow />
      <group position={[houseX0 + win1.x, win1.y, houseFront]}>
        <WindowUnit w={win1.w} h={win1.h} m={m} />
      </group>
      <group position={[houseX0 + win2.x, win2.y, houseFront]}>
        <WindowUnit w={win2.w} h={win2.h} m={m} />
      </group>
      <group position={[houseX0 + entry.x, 0, houseFront]}>
        <EntryDoor m={m} />
      </group>
      {/* Rendered portal around the entry */}
      <group position={[houseX0 + entry.x, 0, houseFront]}>
        <Box args={[0.3, houseH, 0.14]} position={[-0.15, houseH / 2, 0.07]} material={m.renderFeature} />
        <Box args={[0.3, houseH, 0.14]} position={[entry.w + 0.15, houseH / 2, 0.07]} material={m.renderFeature} />
        <Box args={[entry.w + 0.6, houseH - entry.h, 0.14]} position={[entry.w / 2, entry.h + (houseH - entry.h) / 2, 0.07]} material={m.renderFeature} />
      </group>
      {/* Entry landing */}
      <Box args={[2.2, 0.12, 1.3]} position={[houseX0 + entry.x + entry.w / 2, 0.06, houseFront + 0.65]} material={m.concrete} />
      {/* Side and back walls with a few windows */}
      <Box args={[WALL_T, houseH, houseD - WALL_T]} position={[houseX0 + WALL_T / 2, houseH / 2, houseFront - WALL_T - (houseD - WALL_T) / 2]} material={m.brick} />
      <Box
        args={[WALL_T, houseH, houseD + houseFront - garageD + 0.25]}
        position={[-garageW / 2 - WALL_T / 2, houseH / 2, (-garageD + 0.25 + houseFront - houseD) / 2]}
        material={m.brick}
      />
      <Box args={[houseW, houseH, WALL_T]} position={[houseCx, houseH / 2, houseFront - houseD + WALL_T / 2]} material={m.brick} />
      {[2.2, 6.4].map((x) => (
        <group key={x} position={[houseX0 + x, 0.95, houseFront - houseD - 0.001]} rotation={[0, Math.PI, 0]}>
          <WindowUnit w={1.8} h={1.4} m={m} surface />
        </group>
      ))}
      {[-3.5, -8.5].map((z) => (
        <group key={z} position={[houseX0 - 0.001, 0.95, z]} rotation={[0, -Math.PI / 2, 0]}>
          <WindowUnit w={1.5} h={1.4} m={m} surface />
        </group>
      ))}
      <TileRoofBlock width={houseW} depth={houseD} cx={houseCx} cz={houseCz} y={houseH} m={m} />
      <Downpipe x={houseX0 - 0.045} z={houseFront - 0.18} top={houseH - 0.24} gutterX={houseX0 - EAVE - 0.07} m={m} />
    </group>
    </MergeStatic>
  )
})

/** A rectangular downpipe on the wall with a short offset up to the gutter. */
function Downpipe({ x, z, top, gutterX, m }: { x: number; z: number; top: number; gutterX: number; m: HouseMaterials }) {
  const reach = Math.abs(gutterX - x)
  const dir = Math.sign(gutterX - x)
  return (
    <group>
      <Box args={[0.075, top, 0.1]} position={[x, top / 2, z]} material={m.colorbond} />
      <Box args={[reach, 0.075, 0.1]} position={[x + (dir * reach) / 2, top - 0.0375, z]} material={m.colorbond} />
      <Box args={[0.075, 0.12, 0.1]} position={[gutterX, top + 0.02, z]} material={m.colorbond} />
    </group>
  )
}

export function TileRoofBlock({ width, depth, cx, cz, y, m }: { width: number; depth: number; cx: number; cz: number; y: number; m: HouseMaterials }) {
  return (
    <group position={[cx, 0, cz]}>
      <TileRoof width={width} depth={depth} y={y} m={m} />
      <RoofEdge width={width} depth={depth} y={y} m={m} />
    </group>
  )
}

/** Simpler neighbouring houses for context, beyond the side fences. */
export const NeighbourHouse = memo(function NeighbourHouse({
  position,
  width,
  depth,
  m,
  doorColor,
}: {
  position: [number, number, number]
  width: number
  depth: number
  m: HouseMaterials
  doorColor: string
}) {
  const h = 2.7
  const doorW = 4.8
  return (
    <group position={position}>
      <Box args={[width, h, depth]} position={[0, h / 2, -depth / 2]} material={m.brick} />
      <group position={[-width / 2 + 0.8, 0, 0.002]}>
        <mesh position={[doorW / 2, 1.05, 0]} castShadow>
          <planeGeometry args={[doorW, 2.1]} />
          <meshStandardMaterial color={doorColor} roughness={0.5} metalness={0.2} />
        </mesh>
      </group>
      <group position={[width / 2 - 2.6, 0.95, 0.003]}>
        <WindowUnit w={1.8} h={1.5} m={m} surface />
      </group>
      <TileRoofBlock width={width} depth={depth} cx={0} cz={-depth / 2} y={h} m={m} />
    </group>
  )
})
