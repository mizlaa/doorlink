'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { copy } from '@/data/copy';
import { useQuality } from '@/lib/quality';
import { SceneFrame } from '@/components/three/SceneFrame';
import { SplitText } from '@/components/ui/SplitText';

export function ChairTour() {
  const [active, setActive] = useState<string | null>(null);
  const q = useQuality();
  const spot = copy.chair.hotspots.find((h) => h.id === active);

  useEffect(() => {
    const on = (e: Event) => setActive((e as CustomEvent<string>).detail);
    window.addEventListener('fd:hotspot', on);
    return () => window.removeEventListener('fd:hotspot', on);
  }, []);

  return (
    <section id="chair" aria-labelledby="chair-title" className="section">
      <div className="wrap">
        <p className="eyebrow">Inside the shop</p>
        <SplitText as="h2" text="THE CHAIR" className="display h-mega mt-2" />
        <span id="chair-title" className="sr-only">The chair: a 3D tour of the shop</span>

        <div className="relative mt-10 overflow-hidden rounded-3xl border border-white/10">
          <SceneFrame scene="chair" label="Interactive 3D barber chair. Drag to rotate, tap the plus markers for details." poster="/posters/chair.jpg" posterAlt="A black leather and chrome barber chair in front of a mirror" className="h-[70svh] min-h-[460px] w-full cursor-grab" />
          <div className="pointer-events-none absolute left-5 top-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-steel" data-cursor="Drag">
            {q.mobile ? 'Tap the markers' : 'Drag to look around'}
          </div>
          <AnimatePresence>
            {spot && (
              <motion.div key={spot.id} role="dialog" aria-label={spot.title} className="absolute inset-x-4 bottom-4 max-w-md rounded-2xl border border-gold/40 bg-ink/85 p-6 backdrop-blur-xl md:inset-x-auto md:left-6 md:bottom-6"
                initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                <button onClick={() => setActive(null)} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-steel hover:text-gold">✕</button>
                <h3 className="display text-3xl text-gold">{spot.title}</h3>
                <p className="mt-2 text-chrome">{spot.text}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Keyboard / screen-reader / no-WebGL access to the same hotspots */}
        <ul className="mt-6 flex flex-wrap gap-3" aria-label="Shop highlights">
          {copy.chair.hotspots.map((h) => (
            <li key={h.id}>
              <button onClick={() => setActive(active === h.id ? null : h.id)} aria-pressed={active === h.id} className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-chrome transition-colors hover:border-gold hover:text-gold aria-pressed:border-gold aria-pressed:text-gold">{h.title}</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
