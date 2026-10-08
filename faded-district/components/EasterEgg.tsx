'use client';
import { useEffect, useState } from 'react';
import { fx } from '@/lib/fx';
import { scrollToTarget } from '@/lib/lenis';
import { useSound } from '@/lib/sound';

/** Type "fade" anywhere: the hero pole spins at full speed with a burst of gold particles. */
export function EasterEgg() {
  const [toast, setToast] = useState(false);
  const { play } = useSound();

  useEffect(() => {
    let buf = '';
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable]')) return;
      buf = (buf + e.key.toLowerCase()).slice(-4);
      if (buf === 'fade') {
        buf = '';
        scrollToTarget(0);
        setTimeout(() => { fx.boost = 1; fx.burst++; play(1400); }, 450);
        setToast(true);
        setTimeout(() => setToast(false), 2600);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play]);

  return (
    <div role="status" aria-live="polite" className={`pointer-events-none fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-full border border-gold/60 bg-ink/80 px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold backdrop-blur transition-all duration-500 ${toast ? 'opacity-100' : '-translate-y-3 opacity-0'}`}>
      {toast ? 'Fade mode engaged' : ''}
    </div>
  );
}
