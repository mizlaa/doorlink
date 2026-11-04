import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SceneTextures } from './assets'
import { withWind } from './wind'

export interface HouseMaterials {
  brick: THREE.MeshStandardMaterial
  render: THREE.MeshStandardMaterial
  renderFeature: THREE.MeshStandardMaterial
  plaster: THREE.MeshStandardMaterial
  roof: THREE.MeshStandardMaterial
  ridge: THREE.MeshStandardMaterial
  colorbond: THREE.MeshStandardMaterial
  fenceSheet: THREE.MeshStandardMaterial
  soffit: THREE.MeshStandardMaterial
  frame: THREE.MeshStandardMaterial
  glass: THREE.MeshPhysicalMaterial
  curtain: THREE.MeshStandardMaterial
  timber: THREE.MeshStandardMaterial
  concrete: THREE.MeshStandardMaterial
  slab: THREE.MeshStandardMaterial
  asphalt: THREE.MeshStandardMaterial
  lawn: THREE.MeshStandardMaterial
  mulch: THREE.MeshStandardMaterial
  bark: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  darkSteel: THREE.MeshStandardMaterial
  rubber: THREE.MeshStandardMaterial
  lamp: THREE.MeshStandardMaterial
  leafGum: THREE.MeshStandardMaterial
  leafShrub: THREE.MeshStandardMaterial
  leafBottlebrush: THREE.MeshStandardMaterial
  leafTuft: THREE.MeshStandardMaterial
  leafDepth: Record<'gum' | 'shrub' | 'bottlebrush' | 'tuft', THREE.MeshDepthMaterial>
  core: THREE.MeshStandardMaterial
}

function leaf(map: THREE.Texture, color: string, wind: number, key: string) {
  const material = new THREE.MeshStandardMaterial({
    map,
    color,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.78,
    metalness: 0,
    envMapIntensity: 0.6,
  })
  return withWind(material, wind, key)
}

function leafDepth(map: THREE.Texture) {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 })
}

/** One set of materials, shared by every mesh in the scene. */
export function useHouseMaterials(t: SceneTextures): HouseMaterials {
  const materials = useMemo<HouseMaterials>(
    () => ({
      brick: new THREE.MeshStandardMaterial({ map: t.brickColor, normalMap: t.brickNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.9 }),
      render: new THREE.MeshStandardMaterial({ color: '#f1efe9', map: t.renderColor, normalMap: t.renderNormal, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.93 }),
      renderFeature: new THREE.MeshStandardMaterial({ color: '#56595a', map: t.renderColor, normalMap: t.renderNormal, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.9 }),
      plaster: new THREE.MeshStandardMaterial({ color: '#efede8', roughness: 0.95 }),
      roof: new THREE.MeshStandardMaterial({ map: t.roofColor, normalMap: t.roofNormal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.72, envMapIntensity: 0.7 }),
      ridge: new THREE.MeshStandardMaterial({ color: '#45484b', roughness: 0.7 }),
      // Colorbond-style trims in a dark "Monument"-like grey.
      colorbond: new THREE.MeshStandardMaterial({ color: '#34363a', roughness: 0.42, metalness: 0.35, envMapIntensity: 0.9 }),
      fenceSheet: new THREE.MeshStandardMaterial({ color: '#6c6e68', roughness: 0.5, metalness: 0.3, normalMap: t.steelNormal, normalScale: new THREE.Vector2(0.4, 0.4) }),
      soffit: new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.9 }),
      frame: new THREE.MeshStandardMaterial({ color: '#232527', roughness: 0.38, metalness: 0.55, envMapIntensity: 1.1 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#1b2830',
        roughness: 0.04,
        metalness: 0.05,
        envMapIntensity: 2.4,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0.8,
      }),
      curtain: new THREE.MeshStandardMaterial({ color: '#e6dfd2', roughness: 1, map: t.renderColor }),
      timber: new THREE.MeshStandardMaterial({ color: '#8a5a37', map: t.woodColor, normalMap: t.woodNormal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.55 }),
      concrete: new THREE.MeshStandardMaterial({ map: t.concreteColor, normalMap: t.concreteNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.88 }),
      slab: new THREE.MeshStandardMaterial({ color: '#c9c5bd', map: t.concreteColor, roughness: 0.6, envMapIntensity: 0.5 }),
      asphalt: new THREE.MeshStandardMaterial({ color: '#56595c', map: t.concreteColor, normalMap: t.concreteNormal, roughness: 0.96 }),
      lawn: withLawnVariation(new THREE.MeshStandardMaterial({ map: t.grassColor, normalMap: t.grassNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.98, envMapIntensity: 0.5 })),
      mulch: new THREE.MeshStandardMaterial({ map: t.mulchColor, normalMap: t.mulchNormal, roughness: 1 }),
      bark: new THREE.MeshStandardMaterial({ color: '#b3a998', map: t.barkColor, normalMap: t.barkNormal, roughness: 0.85 }),
      steel: new THREE.MeshStandardMaterial({ color: '#a7abb0', roughness: 0.32, metalness: 0.9, envMapIntensity: 1.2 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: '#3b3e42', roughness: 0.45, metalness: 0.7 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.85 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff6e6', emissive: '#fff1d6', emissiveIntensity: 1.6, roughness: 0.4 }),
      leafGum: leaf(t.leavesGum, '#c9d4c0', 0.16, 'gum'),
      leafShrub: leaf(t.leavesShrub, '#ffffff', 0.07, 'shrub'),
      leafBottlebrush: leaf(t.leavesBottlebrush, '#ffffff', 0.09, 'bottlebrush'),
      leafTuft: leaf(t.grassTuft, '#d9e3c4', 0.12, 'tuft'),
      leafDepth: {
        gum: leafDepth(t.leavesGum),
        shrub: leafDepth(t.leavesShrub),
        bottlebrush: leafDepth(t.leavesBottlebrush),
        tuft: leafDepth(t.grassTuft),
      },
      core: new THREE.MeshStandardMaterial({ color: '#203a22', roughness: 1 }),
    }),
    [t]
  )
  useEffect(
    () => () => {
      for (const value of Object.values(materials)) {
        if (value instanceof THREE.Material) value.dispose()
      }
    },
    [materials]
  )
  return materials
}

/**
 * Lawn as a real lawn looks from a distance: patches a little greener,
 * drier or shaded, at two scales, from the world position. Breaks up the
 * texture's repeat at no texture cost.
 */
function withLawnVariation(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLawnXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLawnXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vLawnXZ;
float lawnHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lawnNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lawnHash(i), lawnHash(i + vec2(1.0, 0.0)), f.x), mix(lawnHash(i + vec2(0.0, 1.0)), lawnHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float n = lawnNoise(vLawnXZ * 0.07) * 0.6 + lawnNoise(vLawnXZ * 0.33) * 0.4;
  diffuseColor.rgb *= mix(vec3(0.84, 0.9, 0.78), vec3(1.08, 1.06, 0.93), n);
}`
      )
  }
  material.customProgramCacheKey = () => 'lawn-variation'
  return material
}
