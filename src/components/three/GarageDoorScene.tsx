'use client'

import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, RoundedBox, Sky } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { EffectComposer, DepthOfField, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { House } from './House'
import { Garden } from './Garden'
import { GarageInterior } from './GarageInterior'
import { SceneMaterialsProvider, useSceneTextures } from './SceneMaterials'

const BASE_DOOR_WIDTH = 3.2
const BASE_DOOR_HEIGHT = 2.6
const PANEL_GAP = 0.03
const PANEL_DEPTH = 0.14
const NOMINAL_PANEL_COUNT = 4
const JAMB_WIDTH = 0.3
const SUN_POSITION: [number, number, number] = [8, 9, 6]
const ROLLER_SLAT_COUNT = 18

export type DoorKind = 'sectional' | 'roller' | 'tilt'

export interface DoorLook {
  kind: DoorKind
  finish?: string
  /** Relative to the default 2400 mm opening width. */
  widthScale: number
  /** Relative to the default 2100 mm opening height. */
  heightScale: number
  color: string
  hardwareColor: string
  panelCount: number
  profile: string
  windows: string
  roughness: number
  metalness: number
}

export interface SceneDimensions {
  doorWidth: number
  doorHeight: number
  liftHeight: number
  floorY: number
  ceilingY: number
  wallTopY: number
  wallZ: number
  backWallZ: number
}

export function computeSceneDimensions(look: DoorLook): SceneDimensions {
  const doorWidth = BASE_DOOR_WIDTH * look.widthScale
  const doorHeight = BASE_DOOR_HEIGHT * look.heightScale
  const liftHeight = doorHeight + 0.9
  const wallZ = PANEL_DEPTH / 2 + 0.03
  return {
    doorWidth,
    doorHeight,
    liftHeight,
    // Keep the driveway, interior slab and closed door on the same datum.
    // The previous extra drop left a visible gap beneath every door.
    floorY: -doorHeight / 2,
    ceilingY: doorHeight / 2 + 0.45,
    wallTopY: doorHeight / 2 + (liftHeight + 0.6),
    wallZ,
    backWallZ: wallZ - 3.1,
  }
}

function GarageDoorOpener({ dims }: { dims: SceneDimensions }) {
  const railY = dims.ceilingY - 0.3
  const railLength = 2.2
  const frontZ = dims.wallZ - 0.15
  return (
    <group>
      <mesh position={[0, railY, frontZ - railLength / 2]} castShadow>
        <boxGeometry args={[0.1, 0.1, railLength]} />
        <meshStandardMaterial color="#26282a" roughness={0.5} metalness={0.4} envMapIntensity={0.6} />
      </mesh>
      <mesh position={[0, railY - 0.14, frontZ - 0.28]} castShadow>
        <boxGeometry args={[0.42, 0.24, 0.5]} />
        <meshStandardMaterial color="#dcdcda" roughness={0.6} metalness={0.1} />
      </mesh>
      {[ -0.7, 0].map((offset) => (
        <mesh key={offset} position={[0, (railY + dims.ceilingY) / 2, frontZ + offset]}>
          <boxGeometry args={[0.05, dims.ceilingY - railY, 0.05]} />
          <meshStandardMaterial color="#5a5d60" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

function RollerDrumAndGuides({ dims, isOpen }: { dims: SceneDimensions; isOpen: boolean }) {
  const drumRef = useRef<THREE.Mesh>(null)
  const progress = useRef(isOpen ? 1 : 0)

  useFrame((_, delta) => {
    progress.current = THREE.MathUtils.damp(progress.current, isOpen ? 1 : 0, 3, delta)
    if (drumRef.current) {
      drumRef.current.rotation.x = progress.current * Math.PI * 0.35
    }
  })

  const guideX = dims.doorWidth / 2 + 0.08
  const guideHeight = dims.doorHeight + 0.35

  return (
    <group>
      <mesh position={[-guideX, 0, dims.wallZ - 0.06]} castShadow>
        <boxGeometry args={[0.06, guideHeight, 0.12]} />
        <meshStandardMaterial color="#8a8e93" roughness={0.45} metalness={0.55} envMapIntensity={0.8} />
      </mesh>
      <mesh position={[guideX, 0, dims.wallZ - 0.06]} castShadow>
        <boxGeometry args={[0.06, guideHeight, 0.12]} />
        <meshStandardMaterial color="#8a8e93" roughness={0.45} metalness={0.55} envMapIntensity={0.8} />
      </mesh>
      <mesh ref={drumRef} position={[0, dims.ceilingY + 0.08, dims.wallZ - 0.22]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, dims.doorWidth * 0.92, 24]} />
        <meshStandardMaterial color="#3a3d40" roughness={0.35} metalness={0.65} envMapIntensity={0.9} />
      </mesh>
      <mesh position={[0, dims.ceilingY + 0.08, dims.wallZ - 0.35]}>
        <boxGeometry args={[dims.doorWidth + 0.5, 0.28, 0.35]} />
        <meshStandardMaterial color="#E4E2DC" roughness={0.94} envMapIntensity={0.35} />
      </mesh>
    </group>
  )
}

function SectionalTracks({ dims }: { dims: SceneDimensions }) {
  const trackX = dims.doorWidth / 2 + 0.04
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * trackX, 0, dims.wallZ - 0.04]} castShadow>
          <boxGeometry args={[0.05, dims.doorHeight + dims.liftHeight * 0.35, 0.08]} />
          <meshStandardMaterial color="#6a6e73" roughness={0.5} metalness={0.45} envMapIntensity={0.7} />
        </mesh>
      ))}
    </>
  )
}

function HardwareBracket({ x, color = '#b7bbc0' }: { x: number; color?: string }) {
  return (
    <group position={[x, 0, PANEL_DEPTH / 2 + 0.006]}>
      <mesh castShadow>
        <boxGeometry args={[0.1, 0.08, 0.018]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.75} envMapIntensity={1.2} />
      </mesh>
      <mesh position={[0, 0, 0.013]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.026, 0.026, 0.026, 16]} />
        <meshStandardMaterial color="#8a8e93" roughness={0.22} metalness={0.85} envMapIntensity={1.4} />
      </mesh>
    </group>
  )
}

function PanelFace({
  doorWidth,
  panelHeight,
  look,
  showWindows,
}: {
  doorWidth: number
  panelHeight: number
  look: DoorLook
  showWindows: boolean
}) {
  const embossWidth = doorWidth - 0.34
  const embossHeight = panelHeight - 0.14
  const textures = useSceneTextures()
  const surface = look.finish === 'woodgrain' ? textures.wood : textures.paint

  return (
    <>
      <RoundedBox args={[doorWidth, panelHeight, PANEL_DEPTH]} radius={0.016} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial
          color={look.color}
          roughness={look.roughness}
          metalness={look.metalness}
          envMapIntensity={0.5}
          map={surface.map}
          bumpMap={surface.detail}
          bumpScale={look.finish === 'woodgrain' ? 0.035 : 0.008}
        />
      </RoundedBox>

      {look.profile === 'raised' && (
        <RoundedBox
          args={[embossWidth, embossHeight, 0.03]}
          radius={0.014}
          smoothness={3}
          position={[0, 0, PANEL_DEPTH / 2 + 0.014]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={look.color}
            roughness={Math.max(0.05, look.roughness - 0.07)}
            metalness={look.metalness + 0.04}
            envMapIntensity={0.6}
            map={surface.map}
            bumpMap={surface.detail}
            bumpScale={look.finish === 'woodgrain' ? 0.028 : 0.006}
          />
        </RoundedBox>
      )}

      {look.profile === 'ribbed' &&
        [-0.3, -0.1, 0.1, 0.3].map((offset) => (
          <mesh key={offset} position={[0, offset * panelHeight, PANEL_DEPTH / 2 + 0.006]} castShadow>
            <boxGeometry args={[doorWidth - 0.12, panelHeight * 0.13, 0.012]} />
            <meshStandardMaterial
              color={look.color}
              roughness={look.roughness}
              metalness={look.metalness}
              envMapIntensity={0.5}
              map={surface.map}
              bumpMap={surface.detail}
              bumpScale={look.finish === 'woodgrain' ? 0.026 : 0.006}
            />
          </mesh>
        ))}

      <mesh position={[0, panelHeight / 2 - 0.01, PANEL_DEPTH / 2 + 0.002]}>
        <boxGeometry args={[doorWidth, 0.014, 0.008]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.28} />
      </mesh>

      {showWindows && look.windows !== 'none' && (
        <group position={[0, 0, PANEL_DEPTH / 2 + 0.014 + 0.016]}>
          {(look.windows === 'top-row-wide'
            ? [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25]
            : [-1, -0.34, 0.34, 1]
          ).map((x) => (
            <mesh
              key={x}
              position={[x * (doorWidth / 2 - 0.52) * (look.windows === 'top-row-wide' ? 0.8 : 1), 0, 0]}
            >
              <planeGeometry args={[look.windows === 'top-row-wide' ? 0.3 : 0.4, embossHeight - 0.14]} />
              <meshPhysicalMaterial
                color="#dce6f0"
                emissive="#bcd3e6"
                emissiveIntensity={0.4}
                roughness={0.04}
                metalness={0}
                clearcoat={0.8}
                transmission={0.12}
                envMapIntensity={1.25}
              />
            </mesh>
          ))}
        </group>
      )}

      <HardwareBracket x={-doorWidth / 2 + 0.1} color={look.hardwareColor} />
      <HardwareBracket x={doorWidth / 2 - 0.1} color={look.hardwareColor} />
    </>
  )
}

function SectionalPanel({
  index,
  isOpen,
  look,
  dims,
}: {
  index: number
  isOpen: boolean
  look: DoorLook
  dims: SceneDimensions
}) {
  const ref = useRef<THREE.Group>(null)
  const panelCount = look.panelCount
  const panelHeight = (dims.doorHeight - PANEL_GAP * (panelCount - 1)) / panelCount
  const restY = index * (panelHeight + PANEL_GAP) - dims.doorHeight / 2 + panelHeight / 2
  const progress = useRef(0)
  const order = isOpen ? index : panelCount - 1 - index

  useFrame((_, delta) => {
    if (!ref.current) return
    const target = isOpen ? 1 : 0
    const staggerDelay = order * 0.05
    const laggedDelta = Math.max(delta - staggerDelay * 0.4, delta * 0.15)
    progress.current = THREE.MathUtils.damp(progress.current, target, 3.2, laggedDelta)
    ref.current.position.y = restY + progress.current * dims.liftHeight
  })

  return (
    <group ref={ref} position={[0, restY, 0]}>
      <PanelFace
        doorWidth={dims.doorWidth}
        panelHeight={panelHeight}
        look={look}
        showWindows={index === panelCount - 1}
      />
      {index === 1 && (
        <mesh position={[dims.doorWidth / 2 - 0.74, 0, PANEL_DEPTH / 2 + 0.014 + 0.02]} castShadow>
          <boxGeometry args={[0.16, 0.05, 0.035]} />
          <meshStandardMaterial color="#c9cdd1" roughness={0.22} metalness={0.82} envMapIntensity={1.3} />
        </mesh>
      )}
    </group>
  )
}

function SectionalDoor({ isOpen, look, dims }: { isOpen: boolean; look: DoorLook; dims: SceneDimensions }) {
  return (
    <>
      <SectionalTracks dims={dims} />
      {Array.from({ length: look.panelCount }, (_, i) => (
        <SectionalPanel key={i} index={i} isOpen={isOpen} look={look} dims={dims} />
      ))}
    </>
  )
}

function RollerDoor({ isOpen, look, dims }: { isOpen: boolean; look: DoorLook; dims: SceneDimensions }) {
  const curtainRef = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const slatHeight = (dims.doorHeight - PANEL_GAP * (ROLLER_SLAT_COUNT - 1)) / ROLLER_SLAT_COUNT
  const textures = useSceneTextures()
  const surface = look.finish === 'woodgrain' ? textures.wood : textures.paint

  useFrame((_, delta) => {
    if (!curtainRef.current) return
    progress.current = THREE.MathUtils.damp(progress.current, isOpen ? 1 : 0, 2.8, delta)
    curtainRef.current.position.y = progress.current * (dims.liftHeight + dims.doorHeight * 0.15)
    curtainRef.current.scale.y = 1 - progress.current * 0.12
  })

  return (
    <group ref={curtainRef}>
      {Array.from({ length: ROLLER_SLAT_COUNT }, (_, i) => {
        const y = i * (slatHeight + PANEL_GAP) - dims.doorHeight / 2 + slatHeight / 2
        return (
          <group key={i} position={[0, y, 0]}>
            <RoundedBox args={[dims.doorWidth - 0.08, slatHeight, PANEL_DEPTH * 0.85]} radius={0.008} smoothness={3} castShadow receiveShadow>
              <meshStandardMaterial
                color={look.color}
                roughness={look.roughness}
                metalness={look.metalness}
                envMapIntensity={0.5}
                map={surface.map}
                bumpMap={surface.detail}
                bumpScale={look.finish === 'woodgrain' ? 0.028 : 0.006}
              />
            </RoundedBox>
            <mesh position={[0, slatHeight / 2 - 0.008, PANEL_DEPTH / 2]}>
              <boxGeometry args={[dims.doorWidth - 0.1, 0.012, 0.01]} />
              <meshStandardMaterial color="#000000" transparent opacity={0.22} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function TiltDoor({ isOpen, look, dims }: { isOpen: boolean; look: DoorLook; dims: SceneDimensions }) {
  const panelRef = useRef<THREE.Group>(null)
  const progress = useRef(0)

  useFrame((_, delta) => {
    if (!panelRef.current) return
    progress.current = THREE.MathUtils.damp(progress.current, isOpen ? 1 : 0, 2.6, delta)
    const t = progress.current
    // Closed: vertical in the opening. Open: flat under the header, slid
    // back into the garage so the leaf clears the doorway instead of
    // stopping angled across the middle.
    panelRef.current.rotation.x = -t * (Math.PI / 2)
    panelRef.current.position.y = t * (dims.doorHeight / 2)
    panelRef.current.position.z = -t * (dims.doorHeight / 2)
  })

  return (
    <group ref={panelRef}>
      <PanelFace doorWidth={dims.doorWidth} panelHeight={dims.doorHeight} look={look} showWindows />
    </group>
  )
}

function DoorAssembly({ isOpen, look, dims }: { isOpen: boolean; look: DoorLook; dims: SceneDimensions }) {
  return (
    <group key={look.kind}>
      {look.kind === 'sectional' && <SectionalDoor isOpen={isOpen} look={look} dims={dims} />}
      {look.kind === 'roller' && <RollerDoor isOpen={isOpen} look={look} dims={dims} />}
      {look.kind === 'tilt' && <TiltDoor isOpen={isOpen} look={look} dims={dims} />}
    </group>
  )
}

function Facade({ dims }: { dims: SceneDimensions }) {
  const height = dims.doorHeight + dims.liftHeight + 0.6
  const y = dims.floorY + height / 2
  const jambX = dims.doorWidth / 2 + JAMB_WIDTH / 2
  const textures = useSceneTextures()
  const wallMaterial = (
    <meshStandardMaterial
      color="#e4e2dc"
      map={textures.plaster.map}
      bumpMap={textures.plaster.detail}
      bumpScale={0.018}
      roughness={0.93}
      envMapIntensity={0.42}
    />
  )

  return (
    <group>
      <mesh position={[-jambX, y, dims.wallZ]} castShadow receiveShadow>
        <boxGeometry args={[JAMB_WIDTH, height, 0.4]} />
        {wallMaterial}
      </mesh>
      <mesh position={[jambX, y, dims.wallZ]} castShadow receiveShadow>
        <boxGeometry args={[JAMB_WIDTH, height, 0.4]} />
        {wallMaterial}
      </mesh>
      <mesh position={[0, dims.wallTopY - (dims.liftHeight + 0.6) / 2, dims.wallZ]} castShadow receiveShadow>
        <boxGeometry args={[dims.doorWidth + JAMB_WIDTH * 2, dims.liftHeight + 0.6, 0.4]} />
        {wallMaterial}
      </mesh>

      {/* A subtle stone-look portal and dark perimeter seal make the
          opening read as a built assembly instead of a door placed on a
          flat wall. */}
      <mesh position={[-dims.doorWidth / 2 - 0.055, 0, dims.wallZ + 0.225]} castShadow receiveShadow>
        <boxGeometry args={[0.085, dims.doorHeight + 0.1, 0.085]} />
        <meshStandardMaterial color="#bcb8af" roughness={0.76} />
      </mesh>
      <mesh position={[dims.doorWidth / 2 + 0.055, 0, dims.wallZ + 0.225]} castShadow receiveShadow>
        <boxGeometry args={[0.085, dims.doorHeight + 0.1, 0.085]} />
        <meshStandardMaterial color="#bcb8af" roughness={0.76} />
      </mesh>
      <mesh position={[0, dims.doorHeight / 2 + 0.055, dims.wallZ + 0.225]} castShadow receiveShadow>
        <boxGeometry args={[dims.doorWidth + 0.17, 0.085, 0.085]} />
        <meshStandardMaterial color="#bcb8af" roughness={0.76} />
      </mesh>
      <mesh position={[0, -dims.doorHeight / 2 + 0.035, dims.wallZ + 0.19]} receiveShadow>
        <boxGeometry args={[dims.doorWidth - 0.02, 0.055, 0.045]} />
        <meshStandardMaterial color="#33383b" roughness={0.72} />
      </mesh>
    </group>
  )
}

const CLOSED_RADIUS_BASE = 5.8
const OPEN_RADIUS_BASE = 7.4

function CameraDirector({ isOpen, widthScale }: { isOpen: boolean; widthScale: number }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const closeness = useRef(0)
  const { camera } = useThree()
  const widthNudge = (widthScale - 1) * 1.2

  useFrame((_, delta) => {
    const instance = controls.current
    if (!instance) return

    closeness.current = THREE.MathUtils.damp(closeness.current, isOpen ? 1 : 0, 1.8, delta)
    const t = closeness.current

    const target = instance.target
    const offset = camera.position.clone().sub(target)
    const closedRadius = CLOSED_RADIUS_BASE + widthNudge + 2.1
    const openRadius = OPEN_RADIUS_BASE + widthNudge + 1.7
    const desired = THREE.MathUtils.lerp(closedRadius, openRadius, t)
    offset.setLength(THREE.MathUtils.damp(offset.length(), desired, 2.4, delta))
    camera.position.copy(target).add(offset)

    // Leave azimuth unconstrained so a drag can complete a full orbit.
    // Polar limits stop the camera tipping beneath the ground or flipping.
    instance.minPolarAngle = Math.PI / 2 - 0.48
    instance.maxPolarAngle = Math.PI / 2 + 0.32
    instance.autoRotateSpeed = 0.22 * (1 - t)
    instance.update()
  })

  return (
    <OrbitControls
      ref={controls}
      target={[0, 0.55, 0]}
      enablePan={false}
      enableZoom={false}
      autoRotate
      autoRotateSpeed={0.22}
      minDistance={7.1}
      maxDistance={13}
      enableDamping
      dampingFactor={0.08}
    />
  )
}

export const DEFAULT_LOOK: DoorLook = {
  kind: 'sectional',
  finish: 'satin',
  widthScale: 1,
  heightScale: 1,
  color: '#2C3033',
  hardwareColor: '#b7bbc0',
  panelCount: NOMINAL_PANEL_COUNT,
  profile: 'raised',
  windows: 'top-row',
  roughness: 0.55,
  metalness: 0.16,
}

export interface GarageDoorSceneProps {
  isOpen: boolean
  look?: DoorLook
  revealHeadline: string
  revealWordmark: string
}

export function GarageDoorScene({
  isOpen,
  look = DEFAULT_LOOK,
  revealHeadline,
  revealWordmark,
}: GarageDoorSceneProps) {
  const dims = computeSceneDimensions(look)

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [3.7, 2.8, 7.8], fov: 39 }}
    >
      <SceneMaterialsProvider>
        <Sky sunPosition={SUN_POSITION} turbidity={3.6} rayleigh={1.35} mieCoefficient={0.006} mieDirectionalG={0.82} />
        <fog attach="fog" args={['#cbd5dc', 17, 39]} />

        <Environment resolution={128} frames={1}>
          <Sky
            sunPosition={SUN_POSITION}
            turbidity={3.6}
            rayleigh={1.35}
            mieCoefficient={0.006}
            mieDirectionalG={0.82}
          />
        </Environment>

        <hemisphereLight args={['#edf3f7', '#707b5e', 0.72]} />
        <ambientLight intensity={0.16} />
        <directionalLight
          position={[8, 11, 7]}
          intensity={2.0}
          color="#fff1dd"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0008}
          shadow-normalBias={0.025}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={12}
          shadow-camera-bottom={-10}
        />
        <directionalLight position={[-7, 4, -5]} intensity={0.32} color="#c5d7e4" />

        <Facade dims={dims} />
        <House
          jambOuterX={dims.doorWidth / 2 + JAMB_WIDTH}
          wallTopY={dims.wallTopY}
          wallZ={dims.wallZ}
          floorY={dims.floorY}
          doorWidth={dims.doorWidth}
        />
        {look.kind === 'sectional' && <GarageDoorOpener dims={dims} />}
        {look.kind === 'roller' && <RollerDrumAndGuides dims={dims} isOpen={isOpen} />}
        <GarageInterior
          isOpen={isOpen}
          backWallZ={dims.backWallZ}
          frontZ={dims.wallZ}
          floorY={dims.floorY}
          ceilingY={dims.ceilingY}
          doorWidth={dims.doorWidth}
          headline={revealHeadline}
          wordmark={revealWordmark}
        />
        <DoorAssembly isOpen={isOpen} look={look} dims={dims} />
        <Garden doorWidth={dims.doorWidth} floorY={dims.floorY} wallZ={dims.wallZ} />

        <EffectComposer>
          <DepthOfField focusDistance={8.4} focusRange={9} bokehScale={0.55} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>

        <CameraDirector isOpen={isOpen} widthScale={look.widthScale} />
      </SceneMaterialsProvider>
    </Canvas>
  )
}
