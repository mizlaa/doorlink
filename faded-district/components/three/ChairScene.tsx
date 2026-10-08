'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Html, Lightformer, MeshReflectorMaterial, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { copy } from '@/data/copy';

const chromeProps = { color: '#e6e8ec', metalness: 1, roughness: 0.12, envMapIntensity: 1.5 } as const;
const leather = { color: '#0c0c0d', roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 0.9 } as const;

const HOTSPOT_POS: Record<string, [number, number, number]> = {
  unhurried: [0, 1.95, 0.35],
  towel: [0.95, 1.25, 0.55],
  kids: [-0.9, 0.55, 1.25],
};

function Hotspot({ id, position, label }: { id: string; position: [number, number, number]; label: string }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      <button
        className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-gold bg-ink/70 text-gold backdrop-blur transition-transform hover:scale-110"
        aria-label={label}
        data-cursor="View"
        onClick={() => window.dispatchEvent(new CustomEvent('fd:hotspot', { detail: id }))}
      >
        <span className="absolute inset-0 animate-ping rounded-full border border-gold/60" />
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </Html>
  );
}

function Chair({ mobile }: { mobile: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (mobile) {
      group.current!.rotation.y = Math.sin(s.clock.elapsedTime * 0.4) * 0.75; // auto-sway (touch scrolls the page)
      s.camera.lookAt(0, 1.45, 0);
    }
  });
  return (
    <group ref={group}>
      <group position={[0, 0, 0]}>
        {/* base */}
        <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.85, 0.95, 0.14, 64]} /><meshStandardMaterial {...chromeProps} /></mesh>
        <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.5, 0.78, 0.14, 64]} /><meshStandardMaterial color="#111" metalness={0.8} roughness={0.3} /></mesh>
        <mesh position={[0, 0.65, 0]}><cylinderGeometry args={[0.13, 0.13, 0.8, 32]} /><meshStandardMaterial {...chromeProps} /></mesh>
        <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.2, 0.2, 0.3, 32]} /><meshStandardMaterial {...chromeProps} /></mesh>
        {/* seat */}
        <RoundedBox args={[1.25, 0.28, 1.15]} radius={0.12} smoothness={4} position={[0, 1.15, 0.1]}><meshPhysicalMaterial {...leather} /></RoundedBox>
        <mesh position={[0, 1.0, 0.1]}><boxGeometry args={[1.0, 0.1, 0.9]} /><meshStandardMaterial {...chromeProps} /></mesh>
        {/* back */}
        <group position={[0, 1.95, -0.5]} rotation={[-0.16, 0, 0]}>
          <RoundedBox args={[1.2, 1.5, 0.28]} radius={0.12} smoothness={4}><meshPhysicalMaterial {...leather} /></RoundedBox>
          {[-0.35, 0, 0.35].map((x) => <mesh key={x} position={[x, 0.05, 0.145]}><boxGeometry args={[0.012, 1.3, 0.01]} /><meshStandardMaterial color="#222" /></mesh>)}
          <RoundedBox args={[0.62, 0.38, 0.22]} radius={0.1} smoothness={4} position={[0, 1.0, 0.04]}><meshPhysicalMaterial {...leather} /></RoundedBox>
          <mesh position={[0, 0.82, -0.02]}><cylinderGeometry args={[0.035, 0.035, 0.3, 16]} /><meshStandardMaterial {...chromeProps} /></mesh>
        </group>
        {/* arms */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.78, 1.55, 0.05]}>
            <mesh position={[0, -0.18, -0.25]}><boxGeometry args={[0.07, 0.5, 0.07]} /><meshStandardMaterial {...chromeProps} /></mesh>
            <mesh position={[0, 0.12, 0.05]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.045, 0.045, 0.9, 20]} /><meshStandardMaterial {...chromeProps} /></mesh>
            <RoundedBox args={[0.2, 0.09, 0.65]} radius={0.04} position={[0, 0.2, 0.0]}><meshPhysicalMaterial {...leather} /></RoundedBox>
          </group>
        ))}
        {/* footrest */}
        <group position={[0, 0.72, 1.05]} rotation={[0.45, 0, 0]}>
          {[-0.28, 0.28].map((x) => <mesh key={x} position={[x, -0.2, -0.1]}><boxGeometry args={[0.05, 0.5, 0.05]} /><meshStandardMaterial {...chromeProps} /></mesh>)}
          <RoundedBox args={[0.95, 0.07, 0.5]} radius={0.03} position={[0, -0.05, 0.1]}><meshStandardMaterial {...chromeProps} /></RoundedBox>
        </group>
        {Object.entries(HOTSPOT_POS).map(([id, pos]) => (
          <Hotspot key={id} id={id} position={pos} label={copy.chair.hotspots.find((h) => h.id === id)!.title} />
        ))}
      </group>
    </group>
  );
}

function Shop({ mobile }: { mobile: boolean }) {
  return (
    <>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        {mobile ? <meshStandardMaterial color="#0b0b0c" metalness={0.85} roughness={0.28} envMapIntensity={0.7} /> : (
          <MeshReflectorMaterial blur={[300, 80]} resolution={512} mixBlur={1} mixStrength={14} mirror={0.7} roughness={0.8} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.3} color="#0d0d0e" metalness={0.6} />
        )}
      </mesh>
      {/* wall + mirror */}
      <mesh position={[0, 4, -3.4]}><planeGeometry args={[30, 10]} /><meshStandardMaterial color="#101010" roughness={0.9} /></mesh>
      <group position={[0, 2.5, -3.3]}>
        <mesh><planeGeometry args={[3.2, 3.6]} /><meshStandardMaterial color="#c8ccd2" metalness={1} roughness={0.04} envMapIntensity={1.4} /></mesh>
        {[[0, 1.85, 3.4, 0.1], [0, -1.85, 3.4, 0.1], [-1.65, 0, 0.1, 3.8], [1.65, 0, 0.1, 3.8]].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.03]}><boxGeometry args={[w, h, 0.08]} /><meshStandardMaterial {...chromeProps} /></mesh>
        ))}
      </group>
      {/* wall lights */}
      {[-2.8, 2.8].map((x) => (
        <group key={x} position={[x, 3.2, -3.25]}>
          <mesh><boxGeometry args={[0.12, 1.6, 0.08]} /><meshStandardMaterial color="#FFE2B0" emissive="#C9A96E" emissiveIntensity={2.5} /></mesh>
          <pointLight intensity={mobile ? 6 : 10} distance={7} color="#ffd9a0" position={[0, 0, 0.6]} />
        </group>
      ))}
    </>
  );
}

export default function ChairScene({ mobile }: { mobile: boolean }) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <spotLight position={[0, 8, 4]} angle={0.6} penumbra={0.9} intensity={mobile ? 220 : 260} color="#fff0d8" />
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#040404']} />
        <Lightformer form="rect" intensity={3} position={[0, 5, 0]} scale={[8, 1, 1]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="rect" intensity={2} position={[-5, 2, 2]} scale={[1, 5, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[5, 2, 2]} scale={[1, 5, 1]} color="#C9A96E" />
      </Environment>
      <Shop mobile={mobile} />
      <Chair mobile={mobile} />
      {!mobile && (
        <OrbitControls
          enablePan={false} enableZoom={false} enableDamping dampingFactor={0.08}
          target={[0, 1.3, 0]}
          minPolarAngle={Math.PI / 2.7} maxPolarAngle={Math.PI / 2.05}
          minAzimuthAngle={-Math.PI / 2.4} maxAzimuthAngle={Math.PI / 2.4}
        />
      )}
    </>
  );
}
