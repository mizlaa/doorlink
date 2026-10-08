'use client';
import { useEffect, useRef, useState } from 'react';
import { copy } from '@/data/copy';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { fx } from '@/lib/fx';
import { useQuality } from '@/lib/quality';
import { SceneFrame } from '@/components/three/SceneFrame';
import { FadeSequence } from '@/components/three/FadeSequence';
import { SplitText } from '@/components/ui/SplitText';

/** Pinned (sticky) section: head rotates and its hair blends to a skin fade as you scroll. */
export function FadeShowcase() {
  const wrap = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const q = useQuality();
  const [active, setActive] = useState(0);
  const steps = copy.fade.steps;
  const pinned = q.ready && !q.reduced;

  useEffect(() => {
    if (!pinned || !wrap.current) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: wrap.current, start: 'top top', end: 'bottom bottom',
        onUpdate: (s) => {
          fx.fadeProgress = s.progress;
          setActive(Math.min(steps.length - 1, Math.floor(s.progress * steps.length * 0.999)));
          if (bar.current) bar.current.style.transform = `scaleY(${s.progress})`;
        },
      });
    }, wrap);
    return () => { ctx.revert(); fx.fadeProgress = 0; };
  }, [pinned, steps.length]);

  return (
    <section ref={wrap} id="fade" aria-labelledby="fade-title" className={`relative ${pinned ? 'h-[520vh]' : ''}`}>
      <div className={`${pinned ? 'sticky top-0 h-[100svh] min-h-[620px]' : 'py-24'} overflow-hidden`}>
        <div data-capture-hide className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,#1d1a14_0%,#0a0a0a_70%)]" />
        <div className="wrap relative grid h-full grid-rows-[auto_1fr] gap-4 pt-24 md:pt-28">
          <div data-capture-hide>
            <p className="eyebrow">{copy.fade.eyebrow}</p>
            <SplitText as="h2" text={copy.fade.title} className="display h-xl mt-2 text-bone" />
            <span id="fade-title" className="sr-only">{copy.fade.title}</span>
          </div>

          <div className="relative min-h-0">
            <div className="absolute inset-x-0 top-0 bottom-60 md:inset-x-[18%] md:bottom-0">
              {q.use3D ? (
                <SceneFrame scene="head" label="3D head: the hair blends from long to a skin fade as you scroll" poster="/sequence/f-000.jpg" posterAlt="Clay head model with long untidy hair" className="h-full w-full" />
              ) : (
                <FadeSequence active={pinned} className="h-full w-full" />
              )}
            </div>

            {/* step captions */}
            <ol data-capture-hide className={`pointer-events-none z-10 ${pinned ? "absolute bottom-24 left-0 h-44 w-[18rem] md:bottom-auto md:top-1/2 md:h-64 md:w-96 md:-translate-y-1/2" : "relative"}`} aria-label="The process">
              {steps.map((s, i) => (
                <li key={s.n} aria-current={i === active} className={pinned
                  ? `absolute bottom-0 left-0 w-full transition-all duration-700 [transition-timing-function:cubic-bezier(.22,1,.36,1)] md:bottom-auto md:top-1/2 md:-translate-y-1/2 ${i === active ? 'opacity-100 blur-0' : 'translate-y-6 opacity-0 blur-md'}`
                  : 'relative mb-10'}>
                  <span className="display text-6xl text-gold md:text-8xl">{s.n}</span>
                  <h3 className="display mt-1 text-4xl text-bone md:text-5xl">{s.title}</h3>
                  <p className="mt-2 text-chrome">{s.text}</p>
                </li>
              ))}
            </ol>

            {pinned && (
              <div data-capture-hide className="absolute right-0 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-3 md:flex" aria-hidden>
                <div className="relative h-56 w-px bg-white/15"><div ref={bar} className="absolute inset-0 origin-top bg-gold" style={{ transform: 'scaleY(0)' }} /></div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-steel [writing-mode:vertical-rl]">Scroll to cut</span>
              </div>
            )}
          </div>
        </div>
        <div data-capture-hide className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink to-transparent" />
      </div>
    </section>
  );
}
