'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useQuality } from '@/lib/quality';
import type { SceneName } from './CanvasHost';

const CanvasHost = dynamic(() => import('./CanvasHost'), { ssr: false });

/**
 * Lazy-loads a 3D canvas: shows a static poster until the scene has rendered,
 * only mounts when near the viewport, and pauses rendering when offscreen.
 * Reduced-motion / low-end / no-WebGL visitors keep the poster.
 */
export function SceneFrame({
  scene, poster, posterAlt, className = '', eager = false, onReady, label, children,
}: {
  scene: SceneName; poster: string; posterAlt: string; className?: string; eager?: boolean;
  onReady?: () => void; label: string; children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuality();
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting);
      if (e.isIntersecting) setNear(true);
    }, { rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const live = q.ready && q.use3D && (near || eager);

  useEffect(() => {
    if (q.ready && !q.use3D) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.ready, q.use3D]);

  return (
    <div ref={ref} className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} overflow-hidden ${className}`} role="img" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster} alt={posterAlt} width={1200} height={1200}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${ready ? 'opacity-0' : 'opacity-100'}`}
        decoding="async" fetchPriority={eager ? 'high' : 'auto'} loading={eager ? 'eager' : 'lazy'}
      />
      {live && (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <CanvasHost scene={scene} active={visible} dpr={q.dpr} mobile={q.mobile} onReady={() => { setReady(true); onReady?.(); }} />
        </div>
      )}
      {children}
    </div>
  );
}
