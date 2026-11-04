import * as THREE from 'three'

/**
 * A light breeze for leaves and grass, done in the vertex shader so it
 * costs nothing on the CPU. The top of each leaf card or grass tuft
 * (uv.y near 1) moves; the base stays put.
 */
export const windUniforms = {
  uTime: { value: 0 },
  uStrength: { value: 1 },
}

export function withWind<T extends THREE.Material>(material: T, amount: number, key: string): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.uniforms.uStrength = windUniforms.uStrength
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uStrength;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 anchor = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #else
    vec3 anchor = vec3(0.0);
  #endif
  float sway = uStrength * ${amount.toFixed(3)} * clamp(uv.y, 0.0, 1.0);
  float phase = uTime * 1.6 + anchor.x * 0.7 + anchor.z * 0.45 + anchor.y * 0.3;
  transformed.x += (sin(phase) * 0.6 + sin(phase * 2.7) * 0.25) * sway;
  transformed.z += cos(phase * 0.83) * 0.45 * sway;
  transformed.y += sin(phase * 1.9) * 0.08 * sway;
}`
      )
  }
  material.customProgramCacheKey = () => `wind-${key}-${amount}`
  return material
}
