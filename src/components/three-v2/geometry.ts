import * as THREE from 'three'

/**
 * Geometry helpers. Every surface gets UVs in metres, so a texture set up
 * in assets.ts lands at real scale regardless of the mesh's size.
 */

/** A box whose UVs are in metres on every face. */
export function worldBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d)
  const uv = geometry.attributes.uv as THREE.BufferAttribute
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const sizes: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v
      uv.setXY(i, uv.getX(i) * sizes[face][0], uv.getY(i) * sizes[face][1])
    }
  }
  uv.needsUpdate = true
  return geometry
}

/**
 * UVs for extrusions: side walls take (along the extrusion, along the
 * profile), so a panel profile extruded across a door's width gets u
 * across the width and v up the height, both in metres.
 */
export const extrudeUV: THREE.UVGenerator = {
  generateTopUV(_geometry, vertices, a, b, c) {
    return [
      new THREE.Vector2(vertices[a * 3], vertices[a * 3 + 1]),
      new THREE.Vector2(vertices[b * 3], vertices[b * 3 + 1]),
      new THREE.Vector2(vertices[c * 3], vertices[c * 3 + 1]),
    ]
  },
  generateSideWallUV(_geometry, vertices, a, b, c, d) {
    const p = (i: number) => [vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]]
    const [ax, ay, az] = p(a)
    const [bx, by, bz] = p(b)
    const [cx, cy, cz] = p(c)
    const [dx, dy, dz] = p(d)
    if (Math.abs(ay - by) < Math.abs(ax - bx)) {
      return [new THREE.Vector2(az, ax), new THREE.Vector2(bz, bx), new THREE.Vector2(cz, cx), new THREE.Vector2(dz, dx)]
    }
    return [new THREE.Vector2(az, ay), new THREE.Vector2(bz, by), new THREE.Vector2(cz, cy), new THREE.Vector2(dz, dy)]
  },
}

/**
 * A wall with rectangular openings, built in its own plane: x along the
 * wall from 0, y up from 0, thickness extruded towards +z.
 */
export function wallWithOpenings(
  width: number,
  height: number,
  thickness: number,
  openings: Array<{ x: number; y: number; w: number; h: number }>
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(width, 0)
  shape.lineTo(width, height)
  shape.lineTo(0, height)
  shape.closePath()
  for (const o of openings) {
    const hole = new THREE.Path()
    hole.moveTo(o.x, o.y)
    hole.lineTo(o.x, o.y + o.h)
    hole.lineTo(o.x + o.w, o.y + o.h)
    hole.lineTo(o.x + o.w, o.y)
    hole.closePath()
    shape.holes.push(hole)
  }
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
}

export interface HipRoof {
  geometry: THREE.BufferGeometry
  ridge: [THREE.Vector3, THREE.Vector3] | null
  hips: Array<[THREE.Vector3, THREE.Vector3]>
  height: number
}

/**
 * A hipped roof over a rectangle (eaves at y = 0, centred on the origin).
 * UVs run along the eaves (u) and up the slope (v), in metres, so tile
 * courses run parallel to the gutters.
 */
export function hipRoof(width: number, depth: number, pitchDeg: number): HipRoof {
  const t = Math.tan((pitchDeg * Math.PI) / 180)
  const slope = 1 / Math.cos((pitchDeg * Math.PI) / 180)
  const alongX = width >= depth
  const short = alongX ? depth : width
  const long = alongX ? width : depth
  const h = (short / 2) * t
  const r = (long - short) / 2
  const positions: number[] = []
  const uvs: number[] = []
  // Build as if the ridge runs along x, then swap axes if it does not.
  const push = (x: number, y: number, z: number, u: number, v: number) => {
    if (alongX) positions.push(x, y, z)
    else positions.push(z, y, -x)
    uvs.push(u, v)
  }
  const L = long / 2
  const S = short / 2
  // Front slope (z+): trapezoid.
  const front: Array<[number, number, number]> = [
    [-L, 0, S],
    [L, 0, S],
    [r, h, 0],
    [-L, 0, S],
    [r, h, 0],
    [-r, h, 0],
  ]
  for (const [x, y, z] of front) push(x, y, z, x, (S - z) * slope)
  // Back slope (z-).
  const back: Array<[number, number, number]> = [
    [L, 0, -S],
    [-L, 0, -S],
    [-r, h, 0],
    [L, 0, -S],
    [-r, h, 0],
    [r, h, 0],
  ]
  for (const [x, y, z] of back) push(x, y, z, -x, (S + z) * slope)
  // Hip ends.
  const right: Array<[number, number, number]> = [
    [L, 0, S],
    [L, 0, -S],
    [r, h, 0],
  ]
  for (const [x, y, z] of right) push(x, y, z, -z, (L - x) * slope)
  const left: Array<[number, number, number]> = [
    [-L, 0, -S],
    [-L, 0, S],
    [-r, h, 0],
  ]
  for (const [x, y, z] of left) push(x, y, z, z, (x + L) * slope)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()

  const v = (x: number, y: number, z: number) => (alongX ? new THREE.Vector3(x, y, z) : new THREE.Vector3(z, y, -x))
  return {
    geometry,
    ridge: r > 0.01 ? [v(-r, h, 0), v(r, h, 0)] : null,
    hips: [
      [v(-L, 0, S), v(-r, h, 0)],
      [v(L, 0, S), v(r, h, 0)],
      [v(-L, 0, -S), v(-r, h, 0)],
      [v(L, 0, -S), v(r, h, 0)],
    ],
    height: h,
  }
}

/** Orients and stretches a unit-height Y-aligned mesh between two points. */
export function placeAlong(object: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from)
  const length = dir.length()
  object.position.copy(from).addScaledVector(dir, 0.5)
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  object.scale.set(1, length, 1)
}

export const smootherstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** Deterministic pseudo-random numbers, so the garden is the same every visit. */
export function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
