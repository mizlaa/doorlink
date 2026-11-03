import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * Shadows on demand. The sun and the shadow camera never move, so turning
 * the view needs no new shadow map: it is redrawn only while something in
 * the scene is moving (a door, a gate, a fence going in) or just after a
 * change. Saves a full scene pass on every frame of an orbit.
 */
let until = 0
export function wakeShadows(ms = 1500) {
  until = Math.max(until, performance.now() + ms)
}

export function ShadowsOnDemand({ tier }: { tier: string }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])
  useEffect(() => wakeShadows(2500), [tier])
  useFrame(() => {
    if (performance.now() < until) gl.shadowMap.needsUpdate = true
  })
  return null
}
