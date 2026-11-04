import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
const brickColor = '/textures/scene/brick_color.webp'
const brickNormal = '/textures/scene/brick_normal.webp'
const renderColor = '/textures/scene/render_color.webp'
const renderNormal = '/textures/scene/render_normal.webp'
const roofColor = '/textures/scene/roof_color.webp'
const roofNormal = '/textures/scene/roof_normal.webp'
const concreteColor = '/textures/scene/concrete_color.webp'
const concreteNormal = '/textures/scene/concrete_normal.webp'
const grassColor = '/textures/scene/grass_color.webp'
const grassNormal = '/textures/scene/grass_normal.webp'
const mulchColor = '/textures/scene/mulch_color.webp'
const mulchNormal = '/textures/scene/mulch_normal.webp'
const woodColor = '/textures/scene/wood_color.webp'
const woodNormal = '/textures/scene/wood_normal.webp'
const steelNormal = '/textures/scene/steel_normal.webp'
const barkColor = '/textures/scene/bark_color.webp'
const barkNormal = '/textures/scene/bark_normal.webp'
const leavesGum = '/textures/scene/leaves_gum.webp'
const leavesShrub = '/textures/scene/leaves_shrub.webp'
const leavesBottlebrush = '/textures/scene/leaves_bottlebrush.webp'
const grassTuft = '/textures/scene/grass_tuft.webp'
const parkHdr = '/textures/scene/park_512.hdr'

/**
 * The scene's textures, generated offline from CC0 sources.
 * Each tile covers a known real-world size (metres), and every mesh that
 * uses one has UVs in metres, so the repeat below puts bricks, roof tiles
 * and grass at true scale on any wall or any door size.
 */
const TILE_M: Record<string, [number, number]> = {
  brickColor: [0.96, 1.032],
  brickNormal: [0.96, 1.032],
  renderColor: [1, 1],
  renderNormal: [1, 1],
  roofColor: [1.32, 1.38],
  roofNormal: [1.32, 1.38],
  concreteColor: [2, 2],
  concreteNormal: [2, 2],
  grassColor: [1.5, 1.5],
  grassNormal: [1.5, 1.5],
  mulchColor: [0.8, 0.8],
  mulchNormal: [0.8, 0.8],
  woodColor: [1.2, 1.2],
  woodNormal: [1.2, 1.2],
  steelNormal: [0.3, 0.3],
  barkColor: [0.5, 1],
  barkNormal: [0.5, 1],
}

const URLS = {
  brickColor,
  brickNormal,
  renderColor,
  renderNormal,
  roofColor,
  roofNormal,
  concreteColor,
  concreteNormal,
  grassColor,
  grassNormal,
  mulchColor,
  mulchNormal,
  woodColor,
  woodNormal,
  steelNormal,
  barkColor,
  barkNormal,
  leavesGum,
  leavesShrub,
  leavesBottlebrush,
  grassTuft,
}

export type SceneTextures = Record<keyof typeof URLS, THREE.Texture>

const COLOR_MAPS = new Set(['brickColor', 'renderColor', 'roofColor', 'concreteColor', 'grassColor', 'mulchColor', 'woodColor', 'barkColor', 'leavesGum', 'leavesShrub', 'leavesBottlebrush', 'grassTuft'])

let configured = false

/** Loads (once, cached) and configures every texture the scenes use. */
export function useSceneTextures(): SceneTextures {
  const anisotropy = Math.min(16, useThree((s) => s.gl.capabilities.getMaxAnisotropy()))
  const textures = useTexture(URLS) as unknown as SceneTextures
  if (!configured) {
    configured = true
    for (const [key, texture] of Object.entries(textures)) {
      const leaf = key.startsWith('leaves') || key === 'grassTuft'
      texture.colorSpace = COLOR_MAPS.has(key) ? THREE.SRGBColorSpace : THREE.NoColorSpace
      texture.anisotropy = anisotropy
      if (!leaf) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        const tile = TILE_M[key]
        if (tile) texture.repeat.set(1 / tile[0], 1 / tile[1])
      }
      texture.needsUpdate = true
    }
  }
  return textures
}

let hdrPromise: Promise<THREE.DataTexture> | null = null

async function loadHdr(url: string): Promise<THREE.DataTexture> {
  let buffer: ArrayBuffer
  if (url.startsWith('data:')) {
    // The single-file build inlines the HDR. Decode it here rather than
    // fetch() a data: URL, which some hosts' content policies refuse.
    const binary = atob(url.slice(url.indexOf(',') + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    buffer = bytes.buffer
  } else {
    buffer = await (await fetch(url)).arrayBuffer()
  }
  const loader = new HDRLoader()
  loader.setDataType(THREE.HalfFloatType)
  const parsed = loader.parse(buffer)
  const texture = new THREE.DataTexture(parsed.data, parsed.width, parsed.height, THREE.RGBAFormat, parsed.type)
  texture.colorSpace = THREE.LinearSRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.flipY = true
  texture.needsUpdate = true
  return texture
}

/** The CC0 park HDRI used for ambient light and reflections (null while loading). */
export function useParkEnvironment(): THREE.DataTexture | null {
  const [texture, setTexture] = useState<THREE.DataTexture | null>(null)
  useEffect(() => {
    let live = true
    hdrPromise ??= loadHdr(parkHdr)
    hdrPromise.then((t) => live && setTexture(t)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return texture
}

/** Warms the texture and HDR caches in the background, so Design opens quickly. */
export function preloadSceneAssets() {
  useTexture.preload(Object.values(URLS))
  hdrPromise ??= loadHdr(parkHdr)
}
