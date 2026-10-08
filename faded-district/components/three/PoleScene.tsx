'use client';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { fx } from '@/lib/fx';

/** Stripe texture: black → steel → gold gradient bands on the diagonal, so offset animates a spiral. */
function makeStripes() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const N = 4;
  const ramp = (t: number): [number, number, number] => {
    // 0..1 across one period
    const stops: [number, [number, number, number]][] = [
      [0.0, [10, 10, 10]], [0.28, [10, 10, 10]], [0.5, [138, 143, 152]], [0.62, [217, 220, 225]],
      [0.78, [201, 169, 110]], [0.9, [201, 169, 110]], [1.0, [10, 10, 10]],
    ];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const k = (t - t0) / (t1 - t0);
        return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
      }
    }
    return stops[0][1];
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = (((x + y) / S) * N) % 1;
    const [r, g, b] = ramp(t);
    const i = (y * S + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(1, 2.2);
  return tex;
}

const COUNT = 220;
function Burst() {
  const ref = useRef<THREE.Points>(null);
  const seen = useRef(0);
  const life = useRef(0);
  const { pos, vel } = useMemo(() => ({ pos: new Float32Array(COUNT * 3), vel: new Float32Array(COUNT * 3) }), []);
  useFrame((_, dt) => {
    const p = ref.current;
    if (!p) return;
    if (fx.burst !== seen.current) {
      seen.current = fx.burst; life.current = 1.6;
      for (let i = 0; i < COUNT; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = 2 + Math.random() * 5;
        pos.set([0, 0, 0], i * 3);
        vel.set([Math.cos(a) * Math.sqrt(1 - u * u) * s, u * s, Math.sin(a) * Math.sqrt(1 - u * u) * s], i * 3);
      }
    }
    if (life.current > 0) {
      life.current -= dt;
      for (let i = 0; i < COUNT * 3; i++) pos[i] += vel[i] * dt;
      for (let i = 1; i < COUNT * 3; i += 3) vel[i] -= 2.2 * dt;
      (p.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (p.material as THREE.PointsMaterial).opacity = Math.max(0, life.current / 1.6);
      p.visible = true;
    } else p.visible = false;
  });
  return (
    <points ref={ref} visible={false} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial color="#C9A96E" size={0.07} transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function Pole({ mobile }: { mobile: boolean }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const stripes = useMemo(makeStripes, []);
  const { camera } = useThree();
  const chrome = { color: '#e4e6ea', metalness: 1, roughness: 0.14, envMapIntensity: 1.6 } as const;
  const baseScale = mobile ? 0.62 : 0.8;

  useFrame((s, dt) => {
    const p = fx.heroProgress;
    fx.boost = Math.max(0, fx.boost - dt * 0.35);
    const boost = fx.boost;
    const t = s.clock.elapsedTime;
    // spin + stripe spiral speed up with scroll
    spin.current!.rotation.y += dt * (0.28 + p * 2.4 + boost * 16);
    stripes.offset.y -= dt * (0.05 + p * 0.9 + boost * 4);
    // pointer / gyro tilt
    const tx = fx.gyro ? fx.tilt.x : fx.pointer.x, ty = fx.gyro ? fx.tilt.y : fx.pointer.y;
    const g = group.current!;
    g.rotation.z += (-tx * 0.22 - g.rotation.z) * Math.min(1, dt * 4);
    g.rotation.x += (ty * 0.18 - g.rotation.x) * Math.min(1, dt * 4);
    g.position.y = Math.sin(t * 0.8) * 0.08;
    // camera pull-in: 7.5 → 1.15 with ease
    const e = p * p * (3 - 2 * p);
    camera.position.z = 7.5 + (1.15 - 7.5) * e;
    camera.position.x = tx * 0.2 * (1 - e);
    camera.lookAt(0, 0, 0);
    g.scale.setScalar(baseScale + boost * 0.05);
  });

  return (
    <group ref={group} scale={baseScale} rotation={[0, 0, 0.06]}>
      <group ref={spin}>
        {/* stripes core */}
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 3.4, 96, 1, true]} />
          <meshStandardMaterial map={stripes} metalness={0.25} roughness={0.45} envMapIntensity={0.45} side={THREE.DoubleSide} />
        </mesh>
        {/* glass shell */}
        <mesh>
          <cylinderGeometry args={[0.58, 0.58, 3.42, 96, 1, true]} />
          <meshPhysicalMaterial color="#cfd6e0" transparent opacity={0.12} roughness={0.04} metalness={0} clearcoat={1} clearcoatRoughness={0.03} envMapIntensity={2.2} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {/* caps */}
        {[1, -1].map((s) => (
          <group key={s} position={[0, s * 1.76, 0]}>
            <mesh><cylinderGeometry args={[0.66, 0.66, 0.22, 64]} /><meshStandardMaterial {...chrome} /></mesh>
            <mesh position={[0, s * 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.63, 0.035, 24, 96]} /><meshStandardMaterial {...chrome} /></mesh>
            <mesh position={[0, s * 0.22, 0]}><cylinderGeometry args={[s > 0 ? 0.3 : 0.5, 0.66, 0.2, 48]} /><meshStandardMaterial {...chrome} /></mesh>
          </group>
        ))}
        <mesh position={[0, 2.18, 0]}><sphereGeometry args={[0.22, 48, 48]} /><meshStandardMaterial {...chrome} /></mesh>
        <mesh position={[0, -2.05, 0]}><cylinderGeometry args={[0.9, 1.0, 0.1, 64]} /><meshStandardMaterial color="#111" metalness={0.9} roughness={0.25} envMapIntensity={1.2} /></mesh>
      </group>
      <Burst />
    </group>
  );
}

function Effects({ mobile }: { mobile: boolean }) {
  const caRef = useRef<{ offset: THREE.Vector2 } | null>(null);
  useFrame(() => {
    const o = 0.0006 + fx.boost * 0.006 + fx.heroProgress * 0.0014;
    caRef.current?.offset.set(o, o);
  });
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {[
        <Bloom key="b" intensity={0.55} luminanceThreshold={0.62} luminanceSmoothing={0.25} mipmapBlur />,
        // chromatic aberration is desktop-only to keep mobile fast
        ...(mobile ? [] : [<ChromaticAberration key="c" ref={caRef as never} offset={new THREE.Vector2(0.0006, 0.0006)} blendFunction={BlendFunction.NORMAL} radialModulation={false} modulationOffset={0} />]),
      ]}
    </EffectComposer>
  );
}

export default function PoleScene({ mobile }: { mobile: boolean }) {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[4, 3, 4]} intensity={1.6} color="#ffe2b0" />
      <directionalLight position={[-4, 1, 2]} intensity={0.7} color="#a9c4ff" />
      <pointLight position={[0, -2.5, 2]} intensity={6} color="#C9A96E" distance={8} />
      {/* procedural studio lighting, no HDR download */}
      <Environment resolution={mobile ? 64 : 128} frames={1}>
        <color attach="background" args={['#050505']} />
        <Lightformer form="rect" intensity={4} position={[-4, 2, 3]} scale={[3, 8, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={3} position={[4, 0, 2]} scale={[1.5, 8, 1]} color="#ffd9a0" />
        <Lightformer form="ring" intensity={2} position={[0, 4, -3]} scale={6} color="#ffffff" />
        <Lightformer form="rect" intensity={1.5} position={[0, -4, 1]} scale={[8, 1, 1]} color="#C9A96E" />
      </Environment>
      <Pole mobile={mobile} />
      <Effects mobile={mobile} />
    </>
  );
}
