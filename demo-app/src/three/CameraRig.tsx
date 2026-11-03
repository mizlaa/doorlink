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

export type CameraCommand = { type: 'view'; name: ViewName; duration?: number } | { type: 'zoom'; factor: number } | { type: 'spin'; on: boolean }

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
  blockers,
  fitAspect = false,
}: {
  bus: CameraBus
  views: Record<string, CameraView>
  initial: ViewName
  minDistance: number
  maxDistance: number
  minPolar?: number
  maxPolar?: number
  /** Boxes the camera may not enter (buildings): it is pushed out of the nearest face. */
  blockers?: THREE.Box3[]
  /** Pull every view back on screens narrower than 16:10, so the whole product stays in frame. */
  fitAspect?: boolean
}) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, clock } = useThree()
  const flight = useRef<Flight | null>(null)
  const viewsRef = useRef(views)
  viewsRef.current = views
  const placed = useRef(false)
  const limits = useRef({ minDistance, maxDistance })
  limits.current = { minDistance, maxDistance }

  const fit = () => {
    if (!fitAspect) return 1
    const cam = camera as THREE.PerspectiveCamera
    const t = Math.tan((cam.fov * Math.PI) / 360)
    return Math.min(2.2, Math.max(1, Math.tan(Math.atan(t * 1.6)) / Math.tan(Math.atan(t * cam.aspect))))
  }

  // First placement only; later setting changes leave the camera alone.
  if (!placed.current) {
    placed.current = true
    const v = views[initial]
    const k = fit()
    camera.position.set(...v.position).sub(new THREE.Vector3(...v.target)).multiplyScalar(k).add(new THREE.Vector3(...v.target))
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
          to.radius *= fit()
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
          duration: reducedMotion ? 0.01 : command.type === 'zoom' ? 0.45 : command.type === 'view' && command.duration ? command.duration : 1.1,
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
    if (fitAspect) instance.maxDistance = maxDistance * fit()
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
    if (blockers) for (const box of blockers) keepOut(camera.position, instance.target, box)
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

/**
 * Keeps the camera out of a building: if it ends up inside one, it slides
 * along its line of sight towards the target until it is just clear, so a
 * wall never fills the view. (If the target itself is inside, it is pushed
 * out through the nearest side instead.)
 */
const ray = new THREE.Ray()
const hit = new THREE.Vector3()
function keepOut(p: THREE.Vector3, target: THREE.Vector3, box: THREE.Box3) {
  if (!box.containsPoint(p)) return
  if (!box.containsPoint(target)) {
    ray.origin.copy(target)
    ray.direction.copy(p).sub(target).normalize()
    if (ray.intersectBox(box, hit)) {
      p.copy(hit).addScaledVector(ray.direction, -0.15)
      return
    }
  }
  pushOut(p, box)
}

/** Moves a point inside a box out through the nearest side or the top. */
function pushOut(p: THREE.Vector3, box: THREE.Box3) {
  if (!box.containsPoint(p)) return
  const exits: Array<[number, () => void]> = [
    [p.x - box.min.x, () => (p.x = box.min.x)],
    [box.max.x - p.x, () => (p.x = box.max.x)],
    [p.z - box.min.z, () => (p.z = box.min.z)],
    [box.max.z - p.z, () => (p.z = box.max.z)],
    [box.max.y - p.y, () => (p.y = box.max.y)],
  ]
  exits.sort((a, b) => a[0] - b[0])
  exits[0][1]()
}
