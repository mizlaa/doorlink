'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { fx } from '@/lib/fx';

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

/** Sculpted, clay-style head, built procedurally from a sphere. Facing +Z. Replace with a GLB later (see README). */
function buildHead(detail: number) {
  const g = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75));
  const p = g.attributes.position as THREE.BufferAttribute;
  const mask = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= 0.78; z *= 0.94; y *= 1.04;
    if (y < -0.1) { const t = smooth(-0.1, -1.05, y); x *= 1 - 0.2 * t; z *= 1 - 0.1 * t; }
    // chin / jaw definition
    z += 0.1 * gauss(x, y, 0, -0.95, 0.35, 0.22) * (z > 0 ? 1 : 0);
    // nose, brow, cheeks, eye sockets, lips
    if (z > 0) {
      z += 0.17 * gauss(x, y, 0, -0.12, 0.08, 0.26);
      z += 0.06 * gauss(x, y, 0, 0.16, 0.5, 0.07);
      z -= 0.022 * (gauss(x, y, 0.27, 0.08, 0.14, 0.07) + gauss(x, y, -0.27, 0.08, 0.14, 0.07));
      z += 0.04 * (gauss(x, y, 0.36, -0.25, 0.14, 0.14) + gauss(x, y, -0.36, -0.25, 0.14, 0.14));
      z += 0.035 * gauss(x, y, 0, -0.52, 0.17, 0.045);
      z -= 0.02 * gauss(x, y, 0, -0.62, 0.15, 0.025);
    }
    p.setXYZ(i, x, y, z);
    // hair mask: forehead hairline → temples → above ears → nape
    const a = Math.abs(Math.atan2(x, z));
    const hairline = a < 0.55 ? 0.62 : a < 1.3 ? 0.62 - 0.52 * smooth(0.55, 1.3, a) : 0.1 - 0.62 * smooth(1.3, 2.5, a);
    mask[i] = smooth(hairline - 0.05, hairline + 0.05, y);
  }
  g.computeVertexNormals();
  g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  return g;
}

const vert = /* glsl */ `
  attribute float aMask;
  uniform float uProgress;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vPos;
  varying float vHair;
  varying float vCut;
  varying float vMask;

  float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);
  }

  void main(){
    vec3 p = position;
    float y = p.y;
    // ── hair height map A: long, untidy
    float nA = vnoise(p*3.2) * 0.6 + vnoise(p*11.0) * 0.4;
    float topA = 1.0 + 1.1*smoothstep(0.0, 0.95, y);
    float hA = (0.15 + 0.15*nA) * topA;
    // ── hair height map B: crisp skin fade (skin at the bottom, graduating up)
    float grad = smoothstep(0.02, 0.78, y);
    float nB = vnoise(p*14.0);
    float hB = mix(0.0, 0.085, pow(grad, 1.35)) + 0.008*nB*grad;
    // ── clipper pass climbs from the nape to the crown with scroll
    float cutLine = mix(-0.75, 1.35, uProgress);
    float cut = 1.0 - smoothstep(cutLine - 0.22, cutLine + 0.22, y);
    float h = mix(hA, hB, cut) * aMask;
    vHair = h; vCut = cut; vMask = aMask;
    vec3 np = p + normal * h;
    vPos = np;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(np, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vPos;
  varying float vHair;
  varying float vCut;
  varying float vMask;

  float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }

  void main(){
    vec3 clay = vec3(0.50, 0.50, 0.52);
    vec3 hairC = vec3(0.045, 0.045, 0.05);
    // hair density: full where long, gradient through the fade
    float dens = smoothstep(0.0, 0.07, vHair) * vMask;
    // fine strand streaks
    float st = h3(floor(vPos*vec3(90.0, 38.0, 90.0)));
    float streak = mix(0.75, 1.15, st);
    vec3 base = mix(clay, hairC * streak, dens);
    // light
    vec3 n = normalize(vN);
    vec3 key = normalize(vec3(0.6, 0.7, 0.8));
    vec3 rim = normalize(vec3(-0.8, 0.2, -0.6));
    float d = max(dot(n, key), 0.0);
    float amb = 0.28 + 0.22*n.y;
    float spec = pow(max(dot(reflect(-key, n), vec3(0.0,0.0,1.0)), 0.0), mix(14.0, 40.0, dens)) * mix(0.08, 0.3, dens);
    float fres = pow(1.0 - max(n.z, 0.0), 3.0);
    vec3 col = base * (amb + d*0.95) + spec + vec3(0.78,0.66,0.43) * fres * 0.5 * smoothstep(0.0,1.0,-dot(n,rim)+0.4);
    // glowing clipper line where the cut is happening
    float edge = 1.0 - abs(vCut*2.0 - 1.0);
    edge *= smoothstep(0.02, 0.6, uProgress) * (1.0 - smoothstep(0.92, 1.0, uProgress)) * step(0.001, vMask);
    col += vec3(0.79,0.66,0.43) * pow(edge, 3.0) * 0.55;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Head({ mobile }: { mobile: boolean }) {
  const root = useRef<THREE.Group>(null);
  const geo = useMemo(() => buildHead(mobile ? 160 : 256), [mobile]);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } } }), []);
  const ground = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d')!; const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(201,169,110,0.35)'); g.addColorStop(0.5, 'rgba(201,169,110,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame((s) => {
    const p = fx.fadeProgress;
    mat.uniforms.uProgress.value = THREE.MathUtils.lerp(mat.uniforms.uProgress.value, smooth(0.14, 0.86, p), fx.snap ? 1 : 0.2);
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    const r = root.current!;
    const target = p * Math.PI * 2 + fx.pointer.x * 0.18;
    r.rotation.y += (target - r.rotation.y) * (fx.snap ? 1 : 0.14);
    r.rotation.x += (fx.pointer.y * 0.08 - r.rotation.x) * 0.1;
    r.position.y = Math.sin(s.clock.elapsedTime * 0.7) * 0.03;
  });

  const clay = <meshStandardMaterial color="#808085" roughness={0.85} metalness={0} />;
  return (
    <group ref={root} position={[0, -0.05, 0]} scale={mobile ? 0.9 : 1}>
      <mesh geometry={geo} material={mat} />
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.77, -0.08, -0.02]} scale={[0.09, 0.27, 0.17]} rotation={[0, 0, s * -0.1]}>
          <sphereGeometry args={[1, 32, 32]} />{clay}
        </mesh>
      ))}
      <mesh position={[0, -1.45, -0.08]}><cylinderGeometry args={[0.43, 0.52, 1.0, 48]} />{clay}</mesh>
      <mesh position={[0, -2.0, -0.08]} scale={[1.55, 0.5, 0.82]}><sphereGeometry args={[1, 48, 32]} />{clay}</mesh>
      <mesh position={[0, -2.4, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={4.2}><planeGeometry /><meshBasicMaterial map={ground} transparent depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    </group>
  );
}

export default function HeadScene({ mobile }: { mobile: boolean }) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <spotLight position={[3, 4, 4]} angle={0.5} penumbra={1} intensity={60} color="#fff1dc" />
      <pointLight position={[-3, 1, -2]} intensity={14} color="#C9A96E" />
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#050505']} />
        <Lightformer form="rect" intensity={2.5} position={[-3, 2, 3]} scale={[3, 6, 1]} />
        <Lightformer form="rect" intensity={2} position={[3, 1, -2]} scale={[1.5, 6, 1]} color="#C9A96E" />
      </Environment>
      <Head mobile={mobile} />
    </>
  );
}
