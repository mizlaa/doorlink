'use client';
import { useEffect, useRef, useState } from 'react';

/** Chrome dot → ring on interactive elements, with contextual labels via data-cursor="Drag|View|Book". */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'idle' | 'hover' | 'label'>('idle');

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('has-cursor');
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0;

    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    const loop = () => {
      rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    const over = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const labelled = t?.closest?.('[data-cursor]') as HTMLElement | null;
      if (labelled?.dataset.cursor) { setLabel(labelled.dataset.cursor); setMode('label'); return; }
      if (t?.closest?.('a,button,input,select,textarea,[role="button"],label')) { setLabel(''); setMode('hover'); return; }
      setLabel(''); setMode('idle');
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', over, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerover', over);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed left-0 top-0 z-[150] hidden [@media(hover:hover)_and_(pointer:fine)]:block">
      <div ref={dot} className="absolute -left-[3px] -top-[3px] h-[6px] w-[6px] rounded-full bg-chrome mix-blend-difference" />
      <div ref={ring} className="absolute">
        <div
          className="-translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-chrome/70 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink transition-[width,height,background,border-color] duration-300"
          style={{
            width: mode === 'label' ? 84 : mode === 'hover' ? 54 : 30,
            height: mode === 'label' ? 84 : mode === 'hover' ? 54 : 30,
            background: mode === 'label' ? 'var(--gold)' : mode === 'hover' ? 'rgba(217,220,225,0.12)' : 'transparent',
            borderColor: mode === 'label' ? 'var(--gold)' : undefined,
          }}
        >
          {mode === 'label' ? label : ''}
        </div>
      </div>
    </div>
  );
}
