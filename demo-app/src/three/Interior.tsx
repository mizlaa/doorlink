import { memo } from 'react'
import * as THREE from 'three'
import type { HouseMaterials } from './materials'
import { WALL_T, type HouseLayout } from './House'

/**
 * Inside the garage: lined walls and ceiling, a batten light, a shelving
 * unit with storage tubs, and the internal door to the house. Seen when
 * the door opens or from the inside view.
 */
export const Interior = memo(function Interior({ layout, m }: { layout: HouseLayout; m: HouseMaterials }) {
  const { garageW, garageD, ceiling } = layout
  const innerW = garageW - WALL_T * 2
  const innerD = garageD - WALL_T * 2
  const z = -garageD / 2
  return (
    <group>
      {/* Linings */}
      <mesh position={[-innerW / 2 + 0.002, ceiling / 2, z]} rotation={[0, Math.PI / 2, 0]} material={m.plaster} receiveShadow>
        <planeGeometry args={[innerD, ceiling]} />
      </mesh>
      <mesh position={[innerW / 2 - 0.002, ceiling / 2, z]} rotation={[0, -Math.PI / 2, 0]} material={m.plaster} receiveShadow>
        <planeGeometry args={[innerD, ceiling]} />
      </mesh>
      <mesh position={[0, ceiling / 2, -garageD + WALL_T + 0.002]} material={m.plaster} receiveShadow>
        <planeGeometry args={[innerW, ceiling]} />
      </mesh>
      <mesh position={[0, ceiling, z]} rotation={[Math.PI / 2, 0, 0]} material={m.plaster} receiveShadow>
        <planeGeometry args={[innerW, innerD]} />
      </mesh>
      {/* Batten light */}
      <mesh position={[0, ceiling - 0.03, z - 0.6]} material={m.lamp}>
        <boxGeometry args={[1.2, 0.04, 0.08]} />
      </mesh>
      <pointLight position={[0, ceiling - 0.35, z - 0.6]} intensity={5} distance={9} decay={2} color="#fff4e2" />
      {/* Internal door to the house */}
      <group position={[-innerW / 2 + 1.1, 0, -garageD + WALL_T + 0.004]}>
        <mesh position={[0, 1.02, 0.01]} castShadow>
          <boxGeometry args={[0.82, 2.04, 0.04]} />
          <meshStandardMaterial color="#f6f5f1" roughness={0.6} />
        </mesh>
        <mesh position={[0.3, 1.0, 0.04]} material={m.steel}>
          <boxGeometry args={[0.12, 0.02, 0.02]} />
        </mesh>
      </group>
      {/* Shelving with storage tubs */}
      <group position={[innerW / 2 - 0.25, 0, z - 0.7]}>
        {[0.05, 0.6, 1.15, 1.7].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={m.darkSteel} castShadow receiveShadow>
            <boxGeometry args={[0.45, 0.025, 1.8]} />
          </mesh>
        ))}
        {[-0.88, 0.88].map((zz) =>
          [-0.2, 0.2].map((xx) => (
            <mesh key={`${zz}${xx}`} position={[xx, 0.9, zz]} material={m.darkSteel}>
              <boxGeometry args={[0.03, 1.8, 0.03]} />
            </mesh>
          ))
        )}
        {[0.6, 1.15].flatMap((y, row) =>
          [-0.55, 0, 0.55].map((zz, i) => (
            <mesh key={`${y}${zz}`} position={[0, y + 0.17, zz]} castShadow>
              <boxGeometry args={[0.4, 0.32, 0.48]} />
              <meshStandardMaterial color={['#d9d7d2', '#4a6b8a', '#c7c4bd'][(i + row) % 3]} roughness={0.55} transparent opacity={0.95} />
            </mesh>
          ))
        )}
      </group>
      {/* A bike leaning on the left wall: two wheels and a frame */}
      <group position={[-innerW / 2 + 0.25, 0, z + 0.4]} rotation={[0, Math.PI / 2, 0]}>
        {[-0.52, 0.52].map((x) => (
          <mesh key={x} position={[x, 0.34, 0]} material={m.rubber}>
            <torusGeometry args={[0.32, 0.025, 8, 28]} />
          </mesh>
        ))}
        <mesh position={[0, 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.018, 0.018, 1.0, 6]} />
          <meshStandardMaterial color="#b6362f" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  )
})

export const interiorLight = new THREE.Color('#fff4e2')
