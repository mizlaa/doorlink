'use client';
import { useEffect, useRef, useState } from 'react';
import { business } from '@/data/business';
import { copy } from '@/data/copy';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { fx } from '@/lib/fx';
import { useQuality } from '@/lib/quality';
import { useBooking } from '@/components/booking/BookingProvider';
import { useSound } from '@/lib/sound';
import { scrollToTarget } from '@/lib/lenis';
import { SceneFrame } from '@/components/three/SceneFrame';
import { SplitText } from '@/components/ui/SplitText';
import { StatusPill } from '@/components/ui/StatusPill';
import { Magnetic } from '@/components/ui/Magnetic';

type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function Hero() {
  const wrap = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const flood = useRef<HTMLDivElement>(null);
  const q = useQuality();
  const { open } = useBooking();
  const { play } = useSound();
  const [needsGyro, setNeedsGyro] = useState(false);
  const scrolly = q.ready && q.use3D;

  // pointer → tilt
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      fx.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      fx.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // device orientation (iOS needs a permission tap)
  useEffect(() => {
    if (!q.ready || !q.mobile || !q.use3D || typeof DeviceOrientationEvent === 'undefined') return;
    const attach = () => {
      fx.gyro = true;
      window.addEventListener('deviceorientation', (e) => {
        fx.tilt.x = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 35));
        fx.tilt.y = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 35));
      });
    };
    if (typeof (DeviceOrientationEvent as DOE).requestPermission === 'function') setNeedsGyro(true);
    else attach();
  }, [q.ready, q.mobile, q.use3D]);

  const enableGyro = async () => {
    try {
      const r = await (DeviceOrientationEvent as DOE).requestPermission!();
      if (r === 'granted') {
        fx.gyro = true;
        window.addEventListener('deviceorientation', (e) => {
          fx.tilt.x = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 35));
          fx.tilt.y = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 35));
        });
      }
    } catch {}
    setNeedsGyro(false);
  };

  // scroll choreography
  useEffect(() => {
    if (!scrolly || !wrap.current) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: wrap.current, start: 'top top', end: 'bottom bottom',
        onUpdate: (s) => { fx.heroProgress = s.progress; },
      });
      gsap.to(overlay.current, {
        opacity: 0, y: -80, filter: 'blur(18px)', ease: 'none',
        scrollTrigger: { trigger: wrap.current, start: 'top top', end: '38% top', scrub: true },
      });
      gsap.fromTo(flood.current, { opacity: 0 }, {
        opacity: 1, ease: 'none',
        scrollTrigger: { trigger: wrap.current, start: '72% top', end: 'bottom bottom', scrub: true },
      });
    }, wrap);
    return () => { ctx.revert(); fx.heroProgress = 0; };
  }, [scrolly]);

  return (
    <section ref={wrap} id="top" aria-label="Faded District, barber in Liverpool NSW" className={`relative ${scrolly ? 'h-[210vh]' : 'h-[100svh] min-h-[640px]'}`}>
      <div className="sticky top-0 h-[100svh] min-h-[640px] overflow-hidden">
        <SceneFrame
          scene="pole" eager label="3D barber pole" poster="/posters/pole.jpg" posterAlt="A glass and chrome barber pole with black, steel and gold spiral stripes"
          className="absolute inset-0"
          onReady={() => window.dispatchEvent(new Event('fd:hero-ready'))}
        />
        <div data-capture-hide className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,transparent_30%,rgba(10,10,10,0.7)_100%)]" />
        <div ref={flood} className="pointer-events-none absolute inset-0 opacity-0" style={{ background: 'linear-gradient(180deg, rgba(10,10,10,0) 0%, #0a0a0a 85%)' }} />

        <div ref={overlay} data-capture-hide className="absolute inset-0 flex flex-col justify-between px-[var(--gutter)] pb-28 pt-24 md:pb-14">
          <div className="flex items-start justify-between gap-4">
            <StatusPill />
            <a
              href={business.googleReviewsUrl} target="_blank" rel="noopener noreferrer" data-cursor="View"
              className="group hidden items-center gap-3 rounded-full border border-white/15 bg-ink/50 py-2 pl-4 pr-5 backdrop-blur sm:flex"
              aria-label={`${business.rating.value} stars from ${business.rating.count} Google reviews`}
            >
              <span className="display text-2xl text-gold">{business.rating.value}★</span>
              <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.16em] text-chrome">{business.rating.count} Google<br />reviews</span>
            </a>
          </div>

          <div>
            <h1 className="display h-mega text-bone [text-shadow:0_4px_60px_rgba(0,0,0,0.6)] md:flex md:gap-[0.25em]" aria-label="Faded District">
              <SplitText as="span" text={copy.hero.headline[0]} when="loaded" className="block" />
              <SplitText as="span" text={copy.hero.headline[1]} when="loaded" delay={160} className="block" />
            </h1>
            <div className="mt-6 flex flex-col gap-6 md:mt-8 md:flex-row md:items-end md:justify-between">
              <p className="max-w-md text-lg text-chrome md:text-xl">{copy.hero.sub}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Magnetic><button className="btn btn-gold" data-cursor="Book" onClick={() => { play(260); open(); }}>{copy.hero.primary}</button></Magnetic>
                <Magnetic><a className="btn btn-ghost" href="#work" data-cursor="View" onClick={(e) => { e.preventDefault(); scrollToTarget('#work'); }}>{copy.hero.ghost}</a></Magnetic>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-steel">
              <span className="sm:hidden">{business.rating.value}★ · {business.rating.count} Google reviews</span>
              <span className="hidden sm:inline">Scroll</span>
              {needsGyro && <button onClick={enableGyro} className="pointer-events-auto rounded-full border border-gold/50 px-3 py-1.5 text-gold">Enable tilt</button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
