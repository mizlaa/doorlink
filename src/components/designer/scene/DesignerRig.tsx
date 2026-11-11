'use client'

import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { smootherstep } from '@/components/three-v2/geometry'
import { prefersReducedMotion } from '@/components/three-v2/quality'

/**
 * The designer's camera.
 *
 * 3D: one finger (or a mouse drag) orbits around the garage door, a pinch
 * (or the wheel) zooms. The orbit is always centred on the door, limited
 * so the camera stays in front of the house and above the ground.
 *
 * 2D: the same scene seen straight on through a long lens, so it reads as
 * a flat front elevation. One finger pans, a pinch zooms, nothing rotates.
 * Because it is the same scene, the door in 2D is by construction the
 * door in 3D.
 *
 * Changing the door never moves the camera; only the person, the 2D/3D
 * switch or a reset does. Touches on the viewer belong to the viewer, so
 * the page doesn't scroll while someone is turning the house.
 */

export type ViewMode = '3d' | '2d'

/** Buttons outside the canvas (reset, zoom) talk to the rig through this. */
export class RigBus {
  private listeners = new Set<(command: 'reset' | 'zoom-in' | 'zoom-out') => void>()
  send(command: 'reset' | 'zoom-in' | 'zoom-out') {
    this.listeners.forEach((l) => l(command))
  }
  listen(listener: (command: 'reset' | 'zoom-in' | 'zoom-out') => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

// A wide lens from close in, like a phone photo from the driveway: the
// door is large and the upper floor recedes behind it.
const FOV_3D = 52
const FOV_2D = 9
const reducedMotion = prefersReducedMotion()

interface Pose {
  target: THREE.Vector3
  spherical: THREE.Spherical
  fov: number
}

interface Flight {
  start: number
  duration: number
  from: Pose
  to: Pose
}

const rad = (deg: number) => (deg * Math.PI) / 180

export function DesignerRig({
  mode,
  doorW,
  doorH,
  bus,
}: {
  mode: ViewMode
  doorW: number
  doorH: number
  bus: RigBus
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, clock, size, scene } = useThree()
  const flight = useRef<Flight | null>(null)
  const placed = useRef(false)
  const current = useRef<ViewMode>(mode)
  // Where the person left the 3D view, so coming back from 2D returns there.
  const last3d = useRef<THREE.Spherical | null>(null)

  // The orbit pivots on the garage: the middle of the opening, a little
  // above the door so the house sits in frame with the door low in it.
  const centre = useMemo(() => new THREE.Vector3(0, doorH + 0.3, 0), [doorH])

  /** How far back the camera must be for `width` × `height` metres to fit, at a field of view. */
  const distanceToFit = (width: number, height: number, fov: number) => {
    const aspect = size.width / Math.max(1, size.height)
    const tanV = Math.tan(rad(fov) / 2)
    return Math.max(height / (2 * tanV), width / (2 * tanV * aspect))
  }

  const home3d = (): Pose => {
    // From the driveway at eye level, a little right of centre, like a
    // photo taken walking up to the house. The door takes about half the
    // width and two-fifths of the height; a narrow screen backs off far
    // enough to keep the whole door and both piers.
    const radius = distanceToFit(doorW / 0.44, doorH / 0.36, FOV_3D)
    const eye = 1.62
    const polar = Math.acos(THREE.MathUtils.clamp((eye - centre.y) / radius, -0.5, 0.5))
    return { target: centre.clone(), spherical: new THREE.Spherical(radius, polar, rad(13)), fov: FOV_3D }
  }

  const home2d = (): Pose => {
    const radius = distanceToFit(doorW + 2.4, doorH + 2.5, FOV_2D)
    // Stand the house on a strip of ground near the bottom of the frame,
    // whatever shape the viewer is: on a tall screen the sky fills the rest.
    const halfHeight = radius * Math.tan(rad(FOV_2D) / 2)
    return {
      target: new THREE.Vector3(0, halfHeight * 0.76, 0),
      spherical: new THREE.Spherical(radius, Math.PI / 2, 0),
      fov: FOV_2D,
    }
  }

  const apply = (pose: Pose) => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = pose.fov
    cam.updateProjectionMatrix()
    cam.position.copy(pose.target).add(new THREE.Vector3().setFromSpherical(pose.spherical))
    cam.lookAt(pose.target)
    controls.current?.target.copy(pose.target)
  }

  const poseNow = (): Pose => {
    const target = controls.current?.target.clone() ?? centre.clone()
    return {
      target,
      spherical: new THREE.Spherical().setFromVector3(camera.position.clone().sub(target)),
      fov: (camera as THREE.PerspectiveCamera).fov,
    }
  }

  const fly = (to: Pose, duration = 0.75) => {
    const from = poseNow()
    // Turn the short way round.
    let delta = to.spherical.theta - from.spherical.theta
    delta = ((((delta + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI
    to.spherical.theta = from.spherical.theta + delta
    flight.current = { start: clock.elapsedTime, duration: reducedMotion ? 0.01 : duration, from, to }
  }

  // First placement, before the first frame is drawn.
  if (!placed.current) {
    placed.current = true
    apply(mode === '2d' ? home2d() : home3d())
  }

  // Limits and gestures for the current mode.
  const configure = (m: ViewMode) => {
    const c = controls.current
    if (!c) return
    const flat = m === '2d'
    c.enableRotate = !flat
    c.enablePan = flat
    c.screenSpacePanning = true
    c.touches = flat ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    c.mouseButtons = flat
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    if (flat) {
      const fit = home2d().spherical.radius
      c.minDistance = fit * 0.3
      c.maxDistance = fit * 1.25
      c.minPolarAngle = Math.PI / 2
      c.maxPolarAngle = Math.PI / 2
      c.minAzimuthAngle = 0
      c.maxAzimuthAngle = 0
    } else {
      const fit = home3d().spherical.radius
      c.minDistance = Math.min(3.2, fit * 0.5)
      c.maxDistance = fit * 1.9
      // From either side of the door, never round the back, over the roof
      // or through the neighbour's fence.
      c.minPolarAngle = rad(70)
      c.maxPolarAngle = rad(100)
      c.minAzimuthAngle = rad(-58)
      c.maxAzimuthAngle = rad(58)
    }
    // A long lens through the scene's haze would wash the house out.
    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      fog.near = flat ? 600 : 45
      fog.far = flat ? 1200 : 190
    }
    if (!flat) setNear(0.1)
  }

  /** In 2D the camera stands far back; only what is on the block, in front of the house, is drawn. */
  const setNear = (near: number) => {
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.near - near) < 0.25) return
    cam.near = near
    cam.updateProjectionMatrix()
  }

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const element = c.domElement as HTMLElement | undefined
    if (element) element.style.touchAction = 'none'
    configure(current.current)
    c.target.copy(current.current === '2d' ? home2d().target : centre)
    c.update()
    const stop = () => {
      flight.current = null
    }
    c.addEventListener('start', stop)
    return () => c.removeEventListener('start', stop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The 2D / 3D switch.
  useEffect(() => {
    if (mode === current.current) return
    const c = controls.current
    if (!c) return
    if (current.current === '3d') last3d.current = poseNow().spherical
    current.current = mode
    // Open the limits for the flight; they are set for the new mode when it lands.
    c.minPolarAngle = 0
    c.maxPolarAngle = Math.PI
    c.minAzimuthAngle = -Infinity
    c.maxAzimuthAngle = Infinity
    c.minDistance = 0.5
    c.maxDistance = 2000
    c.enableRotate = false
    c.enablePan = false
    if (mode === '3d') setNear(0.1)
    const fog = scene.fog as THREE.Fog | null
    if (fog && mode === '2d') {
      fog.near = 600
      fog.far = 1200
    }
    if (mode === '2d') fly(home2d())
    else {
      const home = home3d()
      if (last3d.current) home.spherical.copy(last3d.current)
      fly(home)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // A resized viewer (full screen, rotation) is reframed for its new shape.
  const shape = useRef(`${size.width}x${size.height}`)
  useEffect(() => {
    const next = `${size.width}x${size.height}`
    if (shape.current === next) return
    shape.current = next
    if (flight.current) return
    if (current.current === '2d') fly(home2d(), 0.35)
    else {
      const pose = poseNow()
      pose.target = centre.clone()
      pose.spherical.radius = home3d().spherical.radius
      fly(pose, 0.35)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height])

  // A different door size moves what the orbit is centred on, gently.
  const sized = useRef(`${doorW}:${doorH}`)
  useEffect(() => {
    const next = `${doorW}:${doorH}`
    if (sized.current === next) return
    sized.current = next
    if (current.current === '2d') fly(home2d(), 0.4)
    else {
      const pose = poseNow()
      pose.target = centre.clone()
      pose.spherical.radius = Math.max(pose.spherical.radius, home3d().spherical.radius * 0.6)
      fly(pose, 0.4)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorW, doorH])

  useEffect(
    () =>
      bus.listen((command) => {
        if (command === 'reset') {
          last3d.current = null
          fly(current.current === '2d' ? home2d() : home3d(), 0.6)
          return
        }
        const c = controls.current
        if (!c) return
        const pose = poseNow()
        pose.spherical.radius = THREE.MathUtils.clamp(
          pose.spherical.radius * (command === 'zoom-in' ? 0.78 : 1.28),
          c.minDistance,
          c.maxDistance
        )
        fly(pose, 0.3)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bus, doorW, doorH, size.width, size.height]
  )

  useFrame(() => {
    const c = controls.current
    if (!c) return
    const element = c.domElement as HTMLElement | undefined
    if (element && element.style.touchAction !== 'none') element.style.touchAction = 'none'
    const f = flight.current
    if (f) {
      const k = smootherstep((clock.elapsedTime - f.start) / f.duration)
      const cam = camera as THREE.PerspectiveCamera
      const fov = THREE.MathUtils.lerp(f.from.fov, f.to.fov, k)
      // Keep what is in frame the same size while the lens changes, so
      // switching between 2D and 3D glides instead of jumping.
      const fromSpan = f.from.spherical.radius * Math.tan(rad(f.from.fov) / 2)
      const toSpan = f.to.spherical.radius * Math.tan(rad(f.to.fov) / 2)
      const radius = THREE.MathUtils.lerp(fromSpan, toSpan, k) / Math.tan(rad(fov) / 2)
      const s = new THREE.Spherical(
        radius,
        THREE.MathUtils.lerp(f.from.spherical.phi, f.to.spherical.phi, k),
        THREE.MathUtils.lerp(f.from.spherical.theta, f.to.spherical.theta, k)
      )
      if (cam.fov !== fov) {
        cam.fov = fov
        cam.updateProjectionMatrix()
      }
      c.target.lerpVectors(f.from.target, f.to.target, k)
      camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(s))
      camera.lookAt(c.target)
      if (k >= 1) {
        flight.current = null
        configure(current.current)
      }
      return
    }
    if (current.current === '2d') {
      // Panning can't lose the house: the view centre stays over the facade.
      c.target.x = THREE.MathUtils.clamp(c.target.x, -(doorW / 2 + 2.5), doorW / 2 + 2.5)
      c.target.y = THREE.MathUtils.clamp(c.target.y, 0.2, Math.max(doorH + 2.4, home2d().target.y))
      c.target.z = 0
      setNear(Math.max(0.1, camera.position.z - 6.2))
    } else {
      c.target.copy(centre)
    }
    c.update()
    if (camera.position.y < 0.35) camera.position.y = 0.35
  })

  return <OrbitControls ref={controls} makeDefault enableZoom zoomSpeed={0.7} rotateSpeed={0.42} panSpeed={0.9} enableDamping dampingFactor={0.1} />
}
