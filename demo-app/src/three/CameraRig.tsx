import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { smootherstep } from './geometry'
import { prefersReducedMotion } from './quality'

const reducedMotion = prefersReducedMotion()

// The configurator's four views, or any named view a scene adds (the X-ray stations).
export type ViewName = 'angle' | 'front' | 'side' | 'inside' | (string & {})

export interface CameraView {
  position: [number, number, number]
  target: [number, number, number]
}

export type CameraCommand = { type: 'view'; name: ViewName } | { type: 'zoom'; factor: number } | { type: 'spin'; on: boolean }

/** Buttons outside the canvas talk to the rig inside it through this. */
export class CameraBus {
  private listeners = new Set<(command: CameraCommand) => void>()
  private spinListeners = new Set<(on: boolean) => void>()
  send(command: CameraCommand) {
    this.listeners.forEach((l) => l(command))
  }
  listen(listener: (command: CameraCommand) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  reportSpin(on: boolean) {
    this.spinListeners.forEach((l) => l(on))
  }
  onSpin(listener: (on: boolean) => void) {
    this.spinListeners.add(listener)
    return () => {
      this.spinListeners.delete(listener)
    }
  }
}

interface Flight {
  start: number
  duration: number
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  from: THREE.Spherical
  to: THREE.Spherical
}

/**
 * Orbit, zoom and animated views. Changing a door setting never moves the
 * camera: only the user, or a view button, does. The viewer owns its
 * touches: one finger orbits, two fingers zoom, and the page stays put.
 * Polar and distance limits keep the camera above ground and out of walls.
 */
export function CameraRig({
  bus,
  views,
  initial,
  minDistance,
  maxDistance,
  minPolar = 0.22,
  maxPolar = 1.42,
}: {
  bus: CameraBus
  views: Record<string, CameraView>
  initial: ViewName
  minDistance: number
  maxDistance: number
  minPolar?: number
  maxPolar?: number
}) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, clock } = useThree()
  const flight = useRef<Flight | null>(null)
  const viewsRef = useRef(views)
  viewsRef.current = views
  const placed = useRef(false)
  const limits = useRef({ minDistance, maxDistance })
  limits.current = { minDistance, maxDistance }

  // First placement only; later setting changes leave the camera alone.
  if (!placed.current) {
    placed.current = true
    const v = views[initial]
    camera.position.set(...v.position)
    camera.lookAt(...v.target)
  }

  useEffect(() => {
    const instance = controls.current
    if (!instance) return
    instance.target.set(...viewsRef.current[initial].target)
    instance.update()
    const element = instance.domElement as HTMLElement | undefined
    if (element) element.style.touchAction = 'none'
    const stop = () => {
      flight.current = null
      if (instance.autoRotate) {
        instance.autoRotate = false
        bus.reportSpin(false)
      }
    }
    instance.addEventListener('start', stop)
    return () => instance.removeEventListener('start', stop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () =>
      bus.listen((command) => {
        const instance = controls.current
        if (!instance) return
        if (command.type === 'spin') {
          instance.autoRotate = command.on
          bus.reportSpin(command.on)
          return
        }
        const fromTarget = instance.target.clone()
        const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(fromTarget))
        let toTarget: THREE.Vector3
        let to: THREE.Spherical
        if (command.type === 'view') {
          const v = viewsRef.current[command.name]
          toTarget = new THREE.Vector3(...v.target)
          to = new THREE.Spherical().setFromVector3(new THREE.Vector3(...v.position).sub(toTarget))
        } else {
          toTarget = fromTarget.clone()
          to = from.clone()
          to.radius = THREE.MathUtils.clamp(from.radius * command.factor, limits.current.minDistance, limits.current.maxDistance)
        }
        // Turn the short way round.
        let delta = to.theta - from.theta
        delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
        to.theta = from.theta + delta
        flight.current = {
          start: clock.elapsedTime,
          duration: reducedMotion ? 0.01 : command.type === 'zoom' ? 0.45 : 1.1,
          fromTarget,
          toTarget,
          from,
          to,
        }
      }),
    [bus, camera, clock]
  )

  useFrame(() => {
    const instance = controls.current
    if (!instance) return
    // Touches on the viewer belong to the viewer: drags orbit, pinches
    // zoom, and the page does not scroll or bounce underneath.
    const element = instance.domElement as HTMLElement | undefined
    if (element && element.style.touchAction !== 'none') element.style.touchAction = 'none'
    const f = flight.current
    if (f) {
      const k = smootherstep((clock.elapsedTime - f.start) / f.duration)
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(f.from.radius, f.to.radius, k),
        THREE.MathUtils.lerp(f.from.phi, f.to.phi, k),
        THREE.MathUtils.lerp(f.from.theta, f.to.theta, k)
      )
      instance.target.lerpVectors(f.fromTarget, f.toTarget, k)
      camera.position.copy(instance.target).add(new THREE.Vector3().setFromSpherical(s))
      if (k >= 1) flight.current = null
    }
    instance.update()
    // Belt and braces with the polar limit: never at or below the ground.
    if (camera.position.y < 0.45) camera.position.y = 0.45
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom
      zoomSpeed={0.7}
      rotateSpeed={0.6}
      enableDamping
      dampingFactor={0.09}
      autoRotateSpeed={0.55}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={minPolar}
      maxPolarAngle={maxPolar}
    />
  )
}
