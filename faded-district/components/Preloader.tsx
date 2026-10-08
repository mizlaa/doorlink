'use client';
import { useEffect, useRef, useState } from 'react';
import { lockScroll } from '@/lib/lenis';

/** Chrome line fading black → gold as assets load; exits by splitting like a curtain. */
export function Preloader() {
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'exit' | 'done'>('loading');
  const target = useRef(0);
  const sig = useRef({ load: false, fonts: false, hero: false });

  useEffect(() => {
    lockScroll(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const update = () => {
      const s = sig.current;
      target.current = 20 + (s.load ? 30 : 0) + (s.fonts ? 25 : 0) + (s.hero ? 25 : 0);
    };
    const mark = (k: 'load' | 'fonts' | 'hero') => () => { sig.current[k] = true; update(); };
    update();
    if (document.readyState === 'complete') mark('load')(); else window.addEventListener('load', mark('load'));
    document.fonts?.ready.then(mark('fonts'));
    const heroEv = mark('hero');
    window.addEventListener('fd:hero-ready', heroEv);
    // Failsafes: never trap the visitor
    const t1 = setTimeout(heroEv, 3500);
    const t2 = setTimeout(() => { sig.current = { load: true, fonts: true, hero: true }; update(); }, 5000);

    let v = 0, raf = 0, start = performance.now();
    const loop = (now: number) => {
      const min = reduced ? 0 : 1100;
      const cap = now - start < min ? Math.min(target.current, ((now - start) / min) * 100) : target.current;
      v += (cap - v) * 0.08;
      if (v > 99.4 && target.current >= 100 && now - start >= min) { v = 100; setPct(100); setPhase('exit'); return; }
      setPct(Math.round(v));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); window.removeEventListener('fd:hero-ready', heroEv); };
  }, []);

  useEffect(() => {
    if (phase !== 'exit') return;
    document.documentElement.dataset.loaded = 'true';
    window.dispatchEvent(new Event('fd:loaded'));
    lockScroll(false);
    const t = setTimeout(() => setPhase('done'), 1300);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'done') return null;
  const exit = phase === 'exit';
  const panel = 'absolute inset-x-0 bg-ink transition-transform duration-[1100ms] [transition-timing-function:cubic-bezier(.76,0,.24,1)]';

  return (
    <div className="fixed inset-0 z-[200]" role="progressbar" aria-label="Loading" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${panel} top-0 h-1/2 ${exit ? '-translate-y-full' : ''}`} />
      <div className={`${panel} bottom-0 h-1/2 ${exit ? 'translate-y-full' : ''}`} />
      <div className={`absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-[var(--gutter)] transition-opacity duration-500 ${exit ? 'opacity-0' : 'opacity-100'}`}>
        <div className="mb-5 flex items-end justify-between">
          <span className="display text-2xl text-bone">FADED<span className="text-gold">/</span>DISTRICT</span>
          <span className="font-mono text-sm tabular-nums text-chrome">{String(pct).padStart(3, '0')}%</span>
        </div>
        <div className="h-px w-full bg-white/10">
          <div className="h-[2px] -translate-y-px origin-left" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #0A0A0A 0%, #8A8F98 45%, #C9A96E 100%)', boxShadow: '0 0 18px rgba(201,169,110,0.5)' }} />
        </div>
      </div>
    </div>
  );
}
