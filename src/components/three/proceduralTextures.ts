import * as THREE from 'three'

export type SurfaceKind = 'paint' | 'wood' | 'plaster' | 'concrete' | 'mulch' | 'roof' | 'grass'

export interface SurfaceTextureSet {
  map: THREE.DataTexture
  detail: THREE.DataTexture
}

export interface SceneTextureSet {
  paint: SurfaceTextureSet
  wood: SurfaceTextureSet
  plaster: SurfaceTextureSet
  concrete: SurfaceTextureSet
  mulch: SurfaceTextureSet
  roof: SurfaceTextureSet
  grass: SurfaceTextureSet
}

const BASE_TONES: Record<SurfaceKind, [number, number, number]> = {
  paint: [246, 246, 244],
  wood: [244, 235, 220],
  plaster: [246, 244, 238],
  concrete: [242, 241, 238],
  mulch: [240, 234, 222],
  roof: [242, 241, 238],
  grass: [246, 246, 242],
}

const STRENGTH: Record<SurfaceKind, number> = {
  paint: 5,
  wood: 13,
  plaster: 9,
  concrete: 15,
  mulch: 24,
  roof: 11,
  grass: 12,
}

function hashNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function smoothNoise(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  const tx = x - cellX
  const ty = y - cellY
  const fadeX = tx * tx * (3 - 2 * tx)
  const fadeY = ty * ty * (3 - 2 * ty)
  const top = THREE.MathUtils.lerp(
    hashNoise(cellX, cellY, seed),
    hashNoise(cellX + 1, cellY, seed),
    fadeX
  )
  const bottom = THREE.MathUtils.lerp(
    hashNoise(cellX, cellY + 1, seed),
    hashNoise(cellX + 1, cellY + 1, seed),
    fadeX
  )
  return THREE.MathUtils.lerp(top, bottom, fadeY)
}

function makeSurfaceData(
  kind: SurfaceKind,
  detailMap: boolean,
  seed: number,
  size: number
): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  const [red, green, blue] = BASE_TONES[kind]
  const strength = STRENGTH[kind]
  const woodGrain = kind === 'wood'

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const fine = hashNoise(x, y, seed) - 0.5
      const broad = smoothNoise((x / size) * 9, (y / size) * 9, seed + 13) - 0.5
      const aggregate = smoothNoise((x / size) * 34, (y / size) * 34, seed + 71) - 0.5
      const grainLine = woodGrain
        ? Math.sin(y * 0.43 + Math.sin(x * 0.035 + seed) * 2.6) * 0.16 +
          Math.sin(y * 0.095 + Math.sin(x * 0.012 + seed) * 1.8) * 0.16
        : 0
      const textureSignal = fine * 0.68 + broad * 0.42 + aggregate * 0.34 + grainLine

      if (detailMap) {
        const bump = 128 + textureSignal * (kind === 'paint' ? 20 : 48)
        data[index] = bump
        data[index + 1] = bump
        data[index + 2] = bump
      } else {
        const variation = textureSignal * strength
        data[index] = THREE.MathUtils.clamp(red + variation, 0, 255)
        data[index + 1] = THREE.MathUtils.clamp(green + variation, 0, 255)
        data[index + 2] = THREE.MathUtils.clamp(blue + variation, 0, 255)
      }
      data[index + 3] = 255
    }
  }

  return data
}

function createSurface(kind: SurfaceKind, seed: number, anisotropy: number): SurfaceTextureSet {
  const size = 256
  const map = new THREE.DataTexture(
    makeSurfaceData(kind, false, seed, size),
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.repeat.set(kind === 'wood' ? 2.4 : 3.2, kind === 'concrete' ? 5.5 : 2.8)
  map.anisotropy = anisotropy
  map.generateMipmaps = true
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.magFilter = THREE.LinearFilter
  map.needsUpdate = true

  const detail = new THREE.DataTexture(
    makeSurfaceData(kind, true, seed + 101, size),
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )
  detail.wrapS = THREE.RepeatWrapping
  detail.wrapT = THREE.RepeatWrapping
  detail.repeat.copy(map.repeat)
  detail.anisotropy = anisotropy
  detail.generateMipmaps = true
  detail.minFilter = THREE.LinearMipmapLinearFilter
  detail.magFilter = THREE.LinearFilter
  detail.needsUpdate = true

  return { map, detail }
}

export function createSceneTextures(anisotropy: number): SceneTextureSet {
  return {
    paint: createSurface('paint', 17, anisotropy),
    wood: createSurface('wood', 83, anisotropy),
    plaster: createSurface('plaster', 137, anisotropy),
    concrete: createSurface('concrete', 211, anisotropy),
    mulch: createSurface('mulch', 307, anisotropy),
    roof: createSurface('roof', 401, anisotropy),
    grass: createSurface('grass', 503, anisotropy),
  }
}

export function disposeSceneTextures(textures: SceneTextureSet): void {
  Object.values(textures).forEach(({ map, detail }) => {
    map.dispose()
    detail.dispose()
  })
}