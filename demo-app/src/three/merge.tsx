import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Draws a static subtree as one mesh per material. The children mount as
 * usual (so their geometry, materials and click targets stay exactly as
 * written); once mounted, their meshes are baked into a few merged meshes
 * and the originals are hidden. A fence of a thousand slats becomes one
 * draw call. Re-bakes when `bakeKey` changes; instanced and multi-material
 * meshes are left alone.
 */
const KEEP = ['position', 'normal', 'uv'] as const

export function MergeStatic({ children, bakeKey }: { children: ReactNode; bakeKey?: unknown }) {
  const root = useRef<THREE.Group>(null)
  const baked = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    const src = root.current
    const out = baked.current
    if (!src || !out) return
    src.updateWorldMatrix(true, true)
    const inverse = new THREE.Matrix4().copy(src.matrixWorld).invert()
    const groups = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>()
    src.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || !mesh.visible) return
      const g = mesh.geometry
      if (!KEEP.every((name) => g.getAttribute(name))) return
      const part = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry
      for (const name of Object.keys(part.attributes)) if (!(KEEP as readonly string[]).includes(name)) part.deleteAttribute(name)
      part.clearGroups()
      part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld))
      const material = mesh.material as THREE.Material
      const key = `${material.uuid}:${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}:${mesh.renderOrder}`
      let entry = groups.get(key)
      if (!entry) groups.set(key, (entry = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [], meshes: [] }))
      entry.parts.push(part)
      entry.meshes.push(mesh)
    })
    const made: THREE.Mesh[] = []
    const hidden: THREE.Mesh[] = []
    for (const entry of groups.values()) {
      if (entry.parts.length < 2) {
        entry.parts.forEach((p) => p.dispose())
        continue
      }
      const geometry = mergeGeometries(entry.parts, false)
      entry.parts.forEach((p) => p.dispose())
      if (!geometry) continue
      const merged = new THREE.Mesh(geometry, entry.material)
      merged.castShadow = entry.cast
      merged.receiveShadow = entry.receive
      out.add(merged)
      made.push(merged)
      for (const mesh of entry.meshes) {
        mesh.visible = false
        mesh.matrixAutoUpdate = false
        hidden.push(mesh)
      }
    }
    return () => {
      for (const m of made) {
        out.remove(m)
        m.geometry.dispose()
      }
      for (const mesh of hidden) {
        mesh.visible = true
        mesh.matrixAutoUpdate = true
      }
    }
  }, [bakeKey])

  return (
    <group>
      <group ref={root}>{children}</group>
      <group ref={baked} />
    </group>
  )
}
