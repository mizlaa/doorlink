import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { SceneTextures } from './assets'
import type { HouseMaterials } from './materials'
import { extrudeUV, placeAlong } from './geometry'
import { WALL_T } from './House'
import type { DoorLook } from './GarageScene'

/**
 * The three garage-door types, each with its own mechanism. Sizes come
 * straight from the configured opening (metres). Mechanism dimensions
 * are generic (a 380 mm track radius, a 13 mm curtain wrap), not any
 * manufacturer's specification.
 */

/** Door centre plane: just inside the garage, behind the brickwork. */
const DOOR_Z = -WALL_T - 0.035
const TRACK_R = 0.38
const OPEN_SECONDS = 4.2

function thicknessFor(insulation?: string) {
  return insulation === 'insulated' ? 0.042 : insulation === 'backed' ? 0.032 : 0.022
}

/** 0 = closed, 1 = open; moves at a steady speed like a motor, with soft ends. */
function useTravel(isOpen: boolean) {
  const state = useRef({ t: isOpen ? 1 : 0, eased: isOpen ? 1 : 0 })
  useFrame((_, delta) => {
    const s = state.current
    const step = Math.min(delta, 0.25) / OPEN_SECONDS
    const target = isOpen ? 1 : 0
    s.t += THREE.MathUtils.clamp(target - s.t, -step, step)
    s.eased = 0.5 - 0.5 * Math.cos(Math.PI * s.t)
  })
  return state
}

// ------------------------------------------------------------ materials

function finishSettings(look: DoorLook) {
  switch (look.finish) {
    case 'gloss':
      return { roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.06, normalScale: 0.08 }
    case 'matte':
      return { roughness: 0.78, clearcoat: 0, clearcoatRoughness: 0.5, normalScale: 0.35 }
    case 'woodgrain':
      return { roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.4, normalScale: 0.6 }
    default:
      return { roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.25, normalScale: 0.22 }
  }
}

/** Painted steel (or timber-look) door skin, updated in place as options change. */
function useDoorMaterial(look: DoorLook, t: SceneTextures) {
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({ envMapIntensity: 1 }), [])
  useEffect(() => {
    const f = finishSettings(look)
    const wood = look.finish === 'woodgrain'
    material.color.set(look.color)
    material.roughness = f.roughness
    material.metalness = wood ? 0 : Math.min(0.12, look.metalness * 0.4)
    material.clearcoat = f.clearcoat
    material.clearcoatRoughness = f.clearcoatRoughness
    const map = wood ? t.woodColor : null
    const normal = wood ? t.woodNormal : t.steelNormal
    if (material.map !== map || material.normalMap !== normal) {
      material.map = map
      material.normalMap = normal
      material.needsUpdate = true
    }
    material.normalScale.set(f.normalScale, f.normalScale)
  }, [material, look.color, look.finish, look.metalness, t])
  useEffect(() => () => material.dispose(), [material])
  return material
}

function useHardwareMaterial(color: string) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.9, envMapIntensity: 1.3 }), [])
  useEffect(() => {
    material.color.set(color)
  }, [material, color])
  return material
}

// ------------------------------------------------------------ geometry

/**
 * A door section's cross-section, extruded across the door's width: a
 * chamfered joint top and bottom (the V line between sections) and, for
 * the ribbed style, pressed grooves.
 */
function sectionGeometry(width: number, height: number, thickness: number, profile: string) {
  const c = 0.009
  const front = thickness / 2
  const s = new THREE.Shape()
  s.moveTo(-front, -height / 2)
  s.lineTo(front - c, -height / 2)
  s.lineTo(front, -height / 2 + c)
  if (profile === 'ribbed') {
    const ribs = Math.max(2, Math.round(height / 0.125))
    const gw = 0.007
    const gd = 0.0045
    for (let i = 1; i < ribs; i++) {
      const y = -height / 2 + (height * i) / ribs
      s.lineTo(front, y - gw)
      s.lineTo(front - gd, y - gw / 3)
      s.lineTo(front - gd, y + gw / 3)
      s.lineTo(front, y + gw)
    }
  }
  s.lineTo(front, height / 2 - c)
  s.lineTo(front - c, height / 2)
  s.lineTo(-front, height / 2)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, UVGenerator: extrudeUV, curveSegments: 1 })
  // Shape x is depth (→ world z), extrusion is width (→ world x).
  g.rotateY(-Math.PI / 2)
  g.translate(width / 2, 0, 0)
  return g
}

/** Raised (embossed) fields on a section, as one merged mesh. */
function raisedFieldsGeometry(width: number, height: number, rows: number) {
  const across = Math.max(2, Math.round(width / 0.62))
  const gap = 0.09
  const margin = 0.14
  const bevel = 0.022
  const fw = (width - margin * 2 - gap * (across - 1)) / across
  const fh = (height - 0.1 * (rows + 1)) / rows
  const parts: THREE.BufferGeometry[] = []
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < across; i++) {
      const s = new THREE.Shape()
      const w = fw - bevel * 2
      const h = fh - bevel * 2
      s.moveTo(-w / 2, -h / 2)
      s.lineTo(w / 2, -h / 2)
      s.lineTo(w / 2, h / 2)
      s.lineTo(-w / 2, h / 2)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, {
        depth: 0.002,
        bevelEnabled: true,
        bevelThickness: 0.009,
        bevelSize: bevel,
        bevelSegments: 1,
        UVGenerator: extrudeUV,
      })
      const x = -width / 2 + margin + fw / 2 + i * (fw + gap)
      const y = -height / 2 + 0.1 + fh / 2 + r * (fh + 0.1)
      g.translate(x, y, 0)
      parts.push(g)
    }
  }
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

/** Glazed inserts: frames as one mesh, glass as another. */
function windowGeometries(width: number, sectionH: number, style: string) {
  const wide = style === 'top-row-wide'
  const count = wide ? Math.max(4, Math.round(width / 0.48)) : width > 3.7 ? 8 : 4
  const margin = wide ? 0.12 : 0.22
  const slot = (width - margin * 2) / count
  const gw = wide ? slot - 0.05 : Math.min(0.56, slot * 0.62)
  const gh = sectionH * (wide ? 0.62 : 0.5)
  const frames: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const f = 0.03
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + margin + slot * (i + 0.5)
    const outer = new THREE.Shape()
    outer.moveTo(x - gw / 2 - f, -gh / 2 - f)
    outer.lineTo(x + gw / 2 + f, -gh / 2 - f)
    outer.lineTo(x + gw / 2 + f, gh / 2 + f)
    outer.lineTo(x - gw / 2 - f, gh / 2 + f)
    outer.closePath()
    const hole = new THREE.Path()
    hole.moveTo(x - gw / 2, -gh / 2)
    hole.lineTo(x - gw / 2, gh / 2)
    hole.lineTo(x + gw / 2, gh / 2)
    hole.lineTo(x + gw / 2, -gh / 2)
    hole.closePath()
    outer.holes.push(hole)
    frames.push(
      new THREE.ExtrudeGeometry(outer, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, UVGenerator: extrudeUV })
    )
    const pane = new THREE.PlaneGeometry(gw, gh)
    pane.translate(x, 0, -0.002)
    glass.push(pane)
  }
  const result = { frames: mergeGeometries(frames), glass: mergeGeometries(glass) }
  frames.forEach((g) => g.dispose())
  glass.forEach((g) => g.dispose())
  return result
}

const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: '#16232b',
  roughness: 0.03,
  metalness: 0.1,
  envMapIntensity: 2.6,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
})

function SectionFace({
  width,
  height,
  thickness,
  look,
  material,
  windows,
  rows = 1,
}: {
  width: number
  height: number
  thickness: number
  look: DoorLook
  material: THREE.Material
  windows: boolean
  rows?: number
}) {
  const body = useMemo(() => sectionGeometry(width, height, thickness, look.profile), [width, height, thickness, look.profile])
  const raised = useMemo(
    () => (look.profile === 'raised' && !windows ? raisedFieldsGeometry(width, height, rows) : null),
    [look.profile, width, height, windows, rows]
  )
  const glazing = useMemo(
    () => (windows && look.windows !== 'none' ? windowGeometries(width, Math.min(height, 0.62), look.windows) : null),
    [windows, look.windows, width, height]
  )
  useEffect(() => () => body.dispose(), [body])
  useEffect(() => () => raised?.dispose(), [raised])
  useEffect(
    () => () => {
      glazing?.frames.dispose()
      glazing?.glass.dispose()
    },
    [glazing]
  )
  const glazingY = rows > 1 ? height / 2 - Math.min(height, 0.62) / 2 - 0.08 : 0
  return (
    <group>
      <mesh geometry={body} material={material} castShadow receiveShadow />
      {raised && <mesh geometry={raised} material={material} position={[0, 0, thickness / 2 - 0.004]} castShadow receiveShadow />}
      {glazing && (
        <group position={[0, glazingY, thickness / 2]}>
          <mesh geometry={glazing.frames} material={material} castShadow />
          <mesh geometry={glazing.glass} material={glassMaterial} />
        </group>
      )}
    </group>
  )
}

function LockHandle({ material, y = 0 }: { material: THREE.Material; y?: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh material={material} castShadow>
        <boxGeometry args={[0.07, 0.16, 0.008]} />
      </mesh>
      <mesh material={material} position={[0, 0, 0.022]} castShadow>
        <boxGeometry args={[0.15, 0.028, 0.02]} />
      </mesh>
      <mesh position={[0, 0.05, 0.006]}>
        <cylinderGeometry args={[0.011, 0.011, 0.006, 16]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------- sectional tracks

/** A point on a sectional door's track, `s` metres along it from the floor. */
function trackPoint(s: number, verticalH: number, out: THREE.Vector2) {
  if (s <= verticalH) return out.set(s, DOOR_Z)
  const arc = (Math.PI / 2) * TRACK_R
  if (s <= verticalH + arc) {
    const a = (s - verticalH) / TRACK_R
    return out.set(verticalH + TRACK_R * Math.sin(a), DOOR_Z - TRACK_R * (1 - Math.cos(a)))
  }
  return out.set(verticalH + TRACK_R, DOOR_Z - TRACK_R - (s - verticalH - arc))
}

function TrackRail({ x, verticalH, horizontalL, m }: { x: number; verticalH: number; horizontalL: number; m: HouseMaterials }) {
  const geometry = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>()
    path.add(new THREE.LineCurve3(new THREE.Vector3(x, 0, DOOR_Z), new THREE.Vector3(x, verticalH, DOOR_Z)))
    const arc = new THREE.CatmullRomCurve3(
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 8) * (Math.PI / 2)
        return new THREE.Vector3(x, verticalH + TRACK_R * Math.sin(a), DOOR_Z - TRACK_R * (1 - Math.cos(a)))
      })
    )
    path.add(arc)
    path.add(
      new THREE.LineCurve3(
        new THREE.Vector3(x, verticalH + TRACK_R, DOOR_Z - TRACK_R),
        new THREE.Vector3(x, verticalH + TRACK_R, DOOR_Z - TRACK_R - horizontalL)
      )
    )
    return new THREE.TubeGeometry(path, 80, 0.022, 6, false)
  }, [x, verticalH, horizontalL])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={m.steel} castShadow />
}

function helixGeometry(length: number, radius: number, wire: number, turns: number) {
  const pts: THREE.Vector3[] = []
  const steps = turns * 14
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * turns * Math.PI * 2
    pts.push(new THREE.Vector3((i / steps) * length - length / 2, Math.sin(a) * radius, Math.cos(a) * radius))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, wire, 5, false)
}

// --------------------------------------------------------------- opener

function Opener({
  kind,
  y,
  frontZ,
  length,
  trolleyZ,
  m,
}: {
  kind: string
  y: number
  frontZ: number
  length: number
  trolleyZ: React.MutableRefObject<number>
  m: HouseMaterials
}) {
  const trolley = useRef<THREE.Group>(null)
  useFrame(() => {
    if (trolley.current) trolley.current.position.z = trolleyZ.current
  })
  if (kind === 'none') return null
  const backZ = frontZ - length
  const direct = kind === 'direct'
  return (
    <group position={[0, y, 0]}>
      {/* Rail */}
      <mesh position={[0, 0, frontZ - length / 2]} material={m.steel} castShadow>
        <boxGeometry args={[0.045, 0.035, length]} />
      </mesh>
      {/* Belt or chain under the rail */}
      {!direct && (
        <mesh position={[0, -0.022, frontZ - length / 2]}>
          <boxGeometry args={[0.02, kind === 'chain' ? 0.008 : 0.004, length - 0.1]} />
          <meshStandardMaterial color={kind === 'chain' ? '#4a4d50' : '#151617'} metalness={kind === 'chain' ? 0.8 : 0} roughness={0.5} />
        </mesh>
      )}
      {/* Header bracket and hanging strap */}
      <mesh position={[0, 0.02, frontZ + 0.03]} material={m.darkSteel}>
        <boxGeometry args={[0.12, 0.06, 0.04]} />
      </mesh>
      {/* Motor head (fixed at the back unless direct drive) */}
      {!direct && (
        <group position={[0, -0.06, backZ - 0.2]}>
          <mesh castShadow>
            <boxGeometry args={[0.34, 0.18, 0.44]} />
            <meshStandardMaterial color="#e9e9e6" roughness={0.45} />
          </mesh>
          <mesh position={[0, -0.091, 0.05]}>
            <boxGeometry args={[0.22, 0.004, 0.2]} />
            <meshStandardMaterial color="#fffaf0" emissive="#fff3d6" emissiveIntensity={1.4} />
          </mesh>
        </group>
      )}
      {/* Trolley, or the travelling motor on a direct-drive opener */}
      <group ref={trolley}>
        <mesh position={[0, direct ? -0.08 : -0.035, 0]} castShadow>
          <boxGeometry args={direct ? [0.26, 0.16, 0.32] : [0.07, 0.05, 0.12]} />
          <meshStandardMaterial color={direct ? '#e9e9e6' : '#3a3d40'} roughness={0.45} metalness={direct ? 0 : 0.5} />
        </mesh>
      </group>
    </group>
  )
}

// ------------------------------------------------------------ sectional

export function SectionalDoor({
  look,
  W,
  H,
  isOpen,
  t,
  m,
}: {
  look: DoorLook
  W: number
  H: number
  isOpen: boolean
  t: SceneTextures
  m: HouseMaterials
}) {
  const material = useDoorMaterial(look, t)
  const hardware = useHardwareMaterial(look.hardwareColor)
  const travel = useTravel(isOpen)
  const thickness = thicknessFor(look.insulation)
  const n = Math.max(3, Math.min(6, look.panelCount || 4))
  const DW = W + 0.1
  const doorH = H + 0.04
  const ph = doorH / n
  const verticalH = H + 0.02
  const openTravel = verticalH + (Math.PI / 2) * TRACK_R + 0.06
  const horizontalL = doorH + 0.25
  const panels = useRef<Array<THREE.Group | null>>([])
  const drums = useRef<Array<THREE.Mesh | null>>([])
  const cables = useRef<Array<THREE.Mesh | null>>([])
  const trolleyZ = useRef(DOOR_Z - 0.2)
  const shaftY = verticalH + TRACK_R + 0.12
  const shaftZ = -WALL_T - 0.1
  const railY = verticalH + TRACK_R + 0.09
  const railFront = -WALL_T - 0.22
  const railLength = horizontalL + 0.3
  const springGeometry = useMemo(() => helixGeometry(0.62, 0.045, 0.0055, 46), [])
  useEffect(() => () => springGeometry.dispose(), [springGeometry])

  useFrame(() => {
    const s0 = travel.current.eased * openTravel
    const a = new THREE.Vector2()
    const b = new THREE.Vector2()
    for (let i = 0; i < n; i++) {
      const g = panels.current[i]
      if (!g) continue
      trackPoint(s0 + i * ph, verticalH, a)
      trackPoint(s0 + (i + 1) * ph, verticalH, b)
      g.position.set(0, (a.x + b.x) / 2, (a.y + b.y) / 2)
      g.rotation.x = Math.atan2(b.y - a.y, b.x - a.x)
    }
    // Cable drums turn as the cable winds on.
    for (const d of drums.current) if (d) d.rotation.x = -s0 / 0.055
    // Lift cables from the drums down to the bottom brackets.
    trackPoint(s0, verticalH, a)
    cables.current.forEach((c, i) => {
      if (!c) return
      const x = (i === 0 ? -1 : 1) * (DW / 2 + 0.005)
      placeAlong(c, new THREE.Vector3(x, a.x + 0.04, a.y - 0.015), new THREE.Vector3(x, shaftY - 0.05, shaftZ + 0.03))
    })
    // Opener trolley follows the top section.
    trackPoint(s0 + doorH, verticalH, b)
    trolleyZ.current = THREE.MathUtils.clamp(b.y - 0.18, railFront - railLength + 0.2, railFront - 0.05)
  })

  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <group key={`${n}-${i}`} ref={(el) => (panels.current[i] = el)}>
          <SectionFace width={DW} height={ph} thickness={thickness} look={look} material={material} windows={i === n - 1} />
          {i === Math.min(1, n - 1) && (
            <group position={[0, 0, thickness / 2]}>
              <LockHandle material={hardware} />
            </group>
          )}
          {/* Hinges on the inside face and rollers into the tracks */}
          {[-DW / 2 + 0.06, -DW / 4, 0, DW / 4, DW / 2 - 0.06].map((x) => (
            <mesh key={x} position={[x, ph / 2, -thickness / 2 - 0.006]} material={m.steel}>
              <boxGeometry args={[0.06, 0.12, 0.012]} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (DW / 2 + 0.005), ph / 2, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]} material={m.steel}>
                <cylinderGeometry args={[0.006, 0.006, 0.06, 6]} />
              </mesh>
              <mesh position={[side * 0.03, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.rubber}>
                <cylinderGeometry args={[0.024, 0.024, 0.016, 12]} />
              </mesh>
            </group>
          ))}
          {/* Bottom seal */}
          {i === 0 && (
            <mesh position={[0, -ph / 2 + 0.008, 0]} material={m.rubber}>
              <boxGeometry args={[DW, 0.016, thickness + 0.004]} />
            </mesh>
          )}
        </group>
      ))}

      {[-1, 1].map((side) => (
        <TrackRail key={side} x={side * (DW / 2 + 0.035)} verticalH={verticalH} horizontalL={horizontalL} m={m} />
      ))}
      {/* Rear hangers from the ceiling */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (DW / 2 + 0.035), verticalH + TRACK_R + 0.12, DOOR_Z - TRACK_R - horizontalL + 0.05]} material={m.darkSteel}>
          <boxGeometry args={[0.04, 0.24, 0.04]} />
        </mesh>
      ))}

      {/* Torsion spring assembly above the opening */}
      <group position={[0, shaftY, shaftZ]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={m.steel} castShadow>
          <cylinderGeometry args={[0.013, 0.013, DW + 0.14, 10]} />
        </mesh>
        <mesh geometry={springGeometry} position={[-0.36, 0, 0]} material={m.darkSteel} />
        <mesh geometry={springGeometry} position={[0.36, 0, 0]} material={m.darkSteel} />
        <mesh material={m.darkSteel} position={[0, 0, 0.03]}>
          <boxGeometry args={[0.1, 0.16, 0.012]} />
        </mesh>
        {[-1, 1].map((side, i) => (
          <mesh key={side} ref={(el) => (drums.current[i] = el)} position={[side * (DW / 2 + 0.005), 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.steel}>
            <cylinderGeometry args={[0.055, 0.05, 0.05, 14]} />
          </mesh>
        ))}
      </group>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => (cables.current[i] = el)} material={m.darkSteel}>
          <cylinderGeometry args={[0.0025, 0.0025, 1, 4]} />
        </mesh>
      ))}

      <Opener kind={look.opener ?? 'belt'} y={railY} frontZ={railFront} length={railLength} trolleyZ={trolleyZ} m={m} />
      <OpenerArm travel={travel} openTravel={openTravel} verticalH={verticalH} doorH={doorH} railY={railY} trolleyZ={trolleyZ} kind={look.opener ?? 'belt'} m={m} />
    </group>
  )
}

function OpenerArm({
  travel,
  openTravel,
  verticalH,
  doorH,
  railY,
  trolleyZ,
  kind,
  m,
}: {
  travel: React.MutableRefObject<{ eased: number }>
  openTravel: number
  verticalH: number
  doorH: number
  railY: number
  trolleyZ: React.MutableRefObject<number>
  kind: string
  m: HouseMaterials
}) {
  const arm = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!arm.current) return
    const top = new THREE.Vector2()
    trackPoint(travel.current.eased * openTravel + doorH - 0.12, verticalH, top)
    placeAlong(arm.current, new THREE.Vector3(0, railY - 0.06, trolleyZ.current), new THREE.Vector3(0, top.x, top.y - 0.03))
  })
  if (kind === 'none') return null
  return (
    <mesh ref={arm} material={m.darkSteel} castShadow>
      <boxGeometry args={[0.03, 1, 0.012]} />
    </mesh>
  )
}

// --------------------------------------------------------------- roller

const PITCH = 0.076
const AMPLITUDE = 0.0065
const R0 = 0.13
const WRAP_K = 0.013 / (Math.PI * 2)
const CLOSED_WRAP = 1.25

/** Angle wound for a given length of curtain on the drum (Archimedean spiral). */
const thetaFor = (length: number) => (-R0 + Math.sqrt(R0 * R0 + 2 * WRAP_K * length)) / WRAP_K

export function RollerDoor({
  look,
  W,
  H,
  isOpen,
  t,
  m,
}: {
  look: DoorLook
  W: number
  H: number
  isOpen: boolean
  t: SceneTextures
  m: HouseMaterials
}) {
  const material = useDoorMaterial(look, t)
  const hardware = useHardwareMaterial(look.hardwareColor)
  const travel = useTravel(isOpen)
  const DW = W + 0.1
  const zGuide = DOOR_Z
  const yGuide = H + 0.06
  const yc = H + 0.33
  const zc = zGuide - 0.19
  const lift = H + 0.01
  const transitionClosed = Math.hypot(yc - yGuide, zc + R0 + WRAP_K * thetaFor(CLOSED_WRAP) - zGuide)
  const total = yGuide + transitionClosed + CLOSED_WRAP
  const rows = Math.ceil(total / 0.0095)
  const bottomRail = useRef<THREE.Group>(null)
  const discs = useRef<Array<THREE.Group | null>>([])
  // The curtain is seen from both sides as it coils.
  useEffect(() => {
    material.side = THREE.DoubleSide
    material.needsUpdate = true
  }, [material])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const positions = new Float32Array(rows * 2 * 3)
    const uvs = new Float32Array(rows * 2 * 2)
    const index: number[] = []
    for (let i = 0; i < rows; i++) {
      const u = (i / (rows - 1)) * total
      uvs.set([0, u, DW, u], i * 4)
      if (i < rows - 1) {
        const a = i * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    g.setIndex(index)
    return g
  }, [rows, total, DW])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const p = travel.current.eased * lift
    const vertical = yGuide - p
    // Iterate once: the wrapped length sets the coil's outer radius,
    // which sets the transition length, which sets the wrapped length.
    let wrapped = total - vertical - transitionClosed
    let rOut = R0 + WRAP_K * thetaFor(wrapped)
    const transition = Math.hypot(yc - yGuide, zc + rOut - zGuide)
    wrapped = Math.max(0.01, total - vertical - transition)
    const thetaTotal = thetaFor(wrapped)
    rOut = R0 + WRAP_K * thetaTotal
    const departY = yc
    const departZ = zc + rOut
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    for (let i = 0; i < rows; i++) {
      const u = (i / (rows - 1)) * total
      let y: number
      let z: number
      let ny: number
      let nz: number
      if (u <= vertical) {
        y = p + u
        z = zGuide
        ny = 0
        nz = 1
      } else if (u <= vertical + transition) {
        const k = (u - vertical) / transition
        y = yGuide + (departY - yGuide) * k
        z = zGuide + (departZ - zGuide) * k
        const ty = departY - yGuide
        const tz = departZ - zGuide
        const len = Math.hypot(ty, tz)
        ny = -tz / len
        nz = ty / len
      } else {
        // Inwards along the spiral from the departure point.
        const d = u - vertical - transition
        const disc = Math.max(0, rOut * rOut - 2 * WRAP_K * d)
        const theta = (rOut - Math.sqrt(disc)) / WRAP_K
        const r = rOut - WRAP_K * theta
        y = yc + r * Math.sin(theta)
        z = zc + r * Math.cos(theta)
        ny = Math.sin(theta)
        nz = Math.cos(theta)
      }
      const wave = AMPLITUDE * Math.sin((u / PITCH) * Math.PI * 2)
      y += ny * wave
      z += nz * wave
      arr.set([-DW / 2, y, z, DW / 2, y, z], i * 6)
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    if (bottomRail.current) bottomRail.current.position.set(0, p, zGuide)
    const spin = thetaTotal - thetaFor(CLOSED_WRAP)
    for (const d of discs.current) if (d) d.rotation.x = -spin
  })

  return (
    <group>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {/* Bottom rail with seal and centre lock */}
      <group ref={bottomRail}>
        <mesh position={[0, 0.03, 0]} material={m.steel} castShadow>
          <boxGeometry args={[DW, 0.05, 0.04]} />
        </mesh>
        <mesh position={[0, 0.005, 0]} material={m.rubber}>
          <boxGeometry args={[DW, 0.012, 0.03]} />
        </mesh>
        <group position={[0, 0.22, 0.012]}>
          <LockHandle material={hardware} />
        </group>
      </group>
      {/* Side guides */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (DW / 2 + 0.01), yGuide / 2, zGuide]}>
          <mesh material={m.darkSteel} position={[0, 0, 0.035]} castShadow>
            <boxGeometry args={[0.06, yGuide, 0.006]} />
          </mesh>
          <mesh material={m.darkSteel} position={[0, 0, -0.035]}>
            <boxGeometry args={[0.06, yGuide, 0.006]} />
          </mesh>
          <mesh material={m.darkSteel} position={[side * 0.03, 0, 0]}>
            <boxGeometry args={[0.006, yGuide, 0.07]} />
          </mesh>
        </group>
      ))}
      {/* Axle, drum wheels and wall brackets */}
      <group position={[0, yc, zc]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={m.steel}>
          <cylinderGeometry args={[0.022, 0.022, DW + 0.3, 10]} />
        </mesh>
        {[-1, 1].map((side, i) => (
          <group key={side} position={[side * (DW / 2 - 0.02), 0, 0]} ref={(el) => (discs.current[i] = el)}>
            {[0, 1, 2, 3].map((k) => (
              <mesh key={k} rotation={[(k * Math.PI) / 4, 0, 0]} material={m.darkSteel}>
                <boxGeometry args={[0.012, R0 * 2, 0.02]} />
              </mesh>
            ))}
            <mesh rotation={[0, 0, Math.PI / 2]} material={m.darkSteel}>
              <torusGeometry args={[R0, 0.01, 6, 20]} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (DW / 2 + 0.13), 0, (zGuide - zc) / 2 + 0.05]} material={m.darkSteel} castShadow>
            <boxGeometry args={[0.008, 0.36, 0.42]} />
          </mesh>
        ))}
        {look.opener && look.opener !== 'none' && (
          <group position={[-(DW / 2 + 0.3), -0.02, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.28, 0.24, 0.22]} />
              <meshStandardMaterial color="#e6e6e3" roughness={0.45} />
            </mesh>
            <mesh position={[0, -0.08, 0.112]}>
              <boxGeometry args={[0.05, 0.02, 0.004]} />
              <meshStandardMaterial color="#77ff9a" emissive="#33ff77" emissiveIntensity={1.5} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  )
}

// ----------------------------------------------------------------- tilt

export function TiltDoor({
  look,
  W,
  H,
  isOpen,
  t,
  m,
}: {
  look: DoorLook
  W: number
  H: number
  isOpen: boolean
  t: SceneTextures
  m: HouseMaterials
}) {
  const material = useDoorMaterial(look, t)
  const hardware = useHardwareMaterial(look.hardwareColor)
  const travel = useTravel(isOpen)
  const thickness = thicknessFor(look.insulation) + 0.01
  const DW = W + 0.06
  const DH = H + 0.03
  const door = useRef<THREE.Group>(null)
  const arms = useRef<Array<THREE.Mesh | null>>([])
  const trolleyZ = useRef(DOOR_Z - 0.2)
  const railY = DH + 0.1
  const railFront = -WALL_T - 0.22
  const railLength = (DH * 2) / 3 + 0.5
  const openTop = DH - (DH - H + 0.1)

  useFrame(() => {
    const phi = travel.current.eased * (Math.PI / 2)
    const s = Math.sin(phi)
    const c = Math.cos(phi)
    const topY = DH - (DH - openTop) * s
    const topZ = DOOR_Z - ((2 * DH) / 3) * s
    const g = door.current
    if (g) {
      g.position.set(0, topY - (DH / 2) * c, topZ + (DH / 2) * s)
      g.rotation.x = -phi
    }
    // Pivot arms from the jamb to a point a third of the way down the door.
    const lambda = DH * 0.36
    const py = topY - lambda * c
    const pz = topZ + lambda * s
    arms.current.forEach((arm, i) => {
      if (!arm) return
      const x = (i === 0 ? -1 : 1) * (DW / 2 + 0.03)
      placeAlong(arm, new THREE.Vector3(x, DH * 0.45, -WALL_T - 0.05), new THREE.Vector3(x, py, pz))
    })
    trolleyZ.current = THREE.MathUtils.clamp(topZ - 0.15, railFront - railLength + 0.15, railFront - 0.05)
  })

  return (
    <group>
      <group ref={door}>
        <SectionFace width={DW} height={DH} thickness={thickness} look={look} material={material} windows={look.windows !== 'none'} rows={3} />
        {look.profile === 'raised' && look.windows !== 'none' && <TiltRaisedLower width={DW} height={DH} thickness={thickness} material={material} />}
        <group position={[0, -DH / 2 + 1.0, thickness / 2]}>
          <LockHandle material={hardware} />
        </group>
      </group>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => (arms.current[i] = el)} material={m.darkSteel} castShadow>
          <boxGeometry args={[0.03, 1, 0.012]} />
        </mesh>
      ))}
      {/* Top-roller tracks and jamb springs */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (DW / 2 + 0.03), DH, DOOR_Z - DH / 3]} material={m.steel}>
            <boxGeometry args={[0.04, 0.05, (DH * 2) / 3 + 0.1]} />
          </mesh>
          <mesh position={[side * (DW / 2 + 0.05), DH * 0.28, -WALL_T - 0.05]} material={m.darkSteel}>
            <cylinderGeometry args={[0.018, 0.018, DH * 0.42, 8]} />
          </mesh>
        </group>
      ))}
      <Opener kind={look.opener ?? 'belt'} y={railY} frontZ={railFront} length={railLength} trolleyZ={trolleyZ} m={m} />
    </group>
  )
}

/** On a glazed tilt door, the raised fields go below the window row. */
function TiltRaisedLower({ width, height, thickness, material }: { width: number; height: number; thickness: number; material: THREE.Material }) {
  const lowerH = height - 0.8
  const geometry = useMemo(() => raisedFieldsGeometry(width, lowerH, 2), [width, lowerH])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} position={[0, -height / 2 + lowerH / 2, thickness / 2 - 0.004]} castShadow receiveShadow />
}
