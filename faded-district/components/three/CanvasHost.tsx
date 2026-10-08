'use client';
import { lazy, Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

const scenes = {
  pole: lazy(() => import('./PoleScene')),
  head: lazy(() => import('./HeadScene')),
  chair: lazy(() => import('./ChairScene')),
};
export type SceneName = keyof typeof scenes;

const cameras = (mobile: boolean): Record<SceneName, { position: [number, number, number]; fov: number }> => ({
  pole: { position: [0, 0, 7.5], fov: 35 },
  head: { position: [0, 0.1, mobile ? 7.4 : 5.6], fov: 32 },
  chair: { position: mobile ? [0, 2.2, 11] : [0, 1.7, 5.3], fov: mobile ? 36 : 38 },
});

function Ready({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(() => { if (++n.current === 3) onReady(); });
  return null;
}

export default function CanvasHost({ scene, active, dpr, mobile, onReady }: { scene: SceneName; active: boolean; dpr: number; mobile: boolean; onReady: () => void }) {
  const Scene = scenes[scene];
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, dpr]}
      camera={cameras(mobile)[scene]}
      gl={{ antialias: !mobile, powerPreference: 'high-performance', alpha: scene === 'head' }}
      style={{ touchAction: scene === 'chair' && mobile ? 'pan-y' : 'auto' }}
    >
      {scene !== 'head' && <color attach="background" args={['#0a0a0a']} />}
      <Suspense fallback={null}>
        <Scene mobile={mobile} />
        <Ready onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
