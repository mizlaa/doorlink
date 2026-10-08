'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cutStyles, type CutStyle } from '@/data/styles';
import { getService, formatPrice } from '@/data/services';
import { useBooking } from '@/components/booking/BookingProvider';
import { useSound } from '@/lib/sound';
import { SplitText } from '@/components/ui/SplitText';
import { TiltCard } from '@/components/ui/TiltCard';
import { ProfileSvg } from '@/components/ui/ProfileSvg';

const fadeName = (v: number) => (v < 25 ? 'Low Fade' : v < 50 ? 'Mid Fade' : v < 75 ? 'High Fade' : 'Skin Fade');

function FadeSlider() {
  const [v, setV] = useState(40);
  const { play } = useSound();
  return (
    <div className="grid items-center gap-10 rounded-3xl border border-white/10 bg-charcoal p-6 md:grid-cols-[1fr_1.1fr] md:p-12">
      <div className="mx-auto w-full max-w-[320px]">
        <ProfileSvg fade={v} top={60} showLine className="w-full" />
      </div>
      <div>
        <p className="eyebrow">Fade height</p>
        <p className="display h-xl mt-2 text-bone" aria-live="polite" role="status">{fadeName(v)}</p>
        <p className="mt-3 max-w-md text-chrome">Drag to see how high the fade climbs. Lower is subtle and professional; higher is bolder, with sharper contrast.</p>
        <label htmlFor="fade-range" className="sr-only">Fade height</label>
        <input
          id="fade-range" type="range" min={0} max={100} value={v} onChange={(e) => { setV(+e.target.value); play(90); }}
          aria-valuetext={fadeName(v)} data-cursor="Drag"
          className="mt-8 h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-ink via-steel to-gold [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-bone [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bone [&::-webkit-slider-thumb]:shadow-[0_0_0_6px_rgba(201,169,110,0.35)]"
        />
        <div className="mt-3 flex justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-steel"><span>Low</span><span>Mid</span><span>High</span><span>Skin</span></div>
      </div>
    </div>
  );
}

function DetailPanel({ style, onClose }: { style: CutStyle; onClose: () => void }) {
  const { open } = useBooking();
  const svc = getService(style.serviceId);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); prev?.focus?.(); };
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-[120] flex justify-end bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-lenis-prevent>
      <motion.div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={style.name}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-charcoal p-8 outline-none sm:border-l sm:border-white/10 sm:p-12"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <button onClick={onClose} aria-label="Close style details" className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-chrome hover:border-gold hover:text-gold">
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
        <p className="eyebrow">Style</p>
        <h3 className="display h-lg mt-2">{style.name}</h3>
        <div className="mx-auto my-6 w-48"><ProfileSvg fade={style.fade} top={style.top} className="w-full" /></div>
        <p className="text-lg leading-relaxed text-chrome">{style.description}</p>
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
          <div className="bg-charcoal p-5"><dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-steel">Maintenance</dt><dd className="mt-1 text-xl text-bone">Lasts {style.lasts}</dd></div>
          <div className="bg-charcoal p-5"><dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-steel">Price from</dt><dd className="mt-1 text-xl text-gold">{svc ? formatPrice(svc.price) : 'Ask us'}</dd></div>
        </dl>
        <button className="btn btn-gold mt-8 w-full" data-cursor="Book" onClick={() => { onClose(); open({ serviceId: style.serviceId }); }}>Book this cut</button>
      </motion.div>
    </motion.div>
  );
}

export function StyleExplorer() {
  const track = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(0);
  const [sel, setSel] = useState<CutStyle | null>(null);
  const dragged = useRef(false);
  const { play } = useSound();

  useEffect(() => {
    const m = () => { if (track.current) setLimit(Math.min(0, -(track.current.scrollWidth - track.current.parentElement!.clientWidth))); };
    m();
    const ro = new ResizeObserver(m);
    ro.observe(track.current!.parentElement!);
    return () => ro.disconnect();
  }, []);

  return (
    <section id="styles" aria-labelledby="styles-title" className="section overflow-hidden">
      <div className="wrap">
        <p className="eyebrow">Fade style explorer</p>
        <SplitText as="h2" text="FIND YOUR FADE" className="display h-xl mt-2" />
        <span id="styles-title" className="sr-only">Find your fade</span>
      </div>

      <div className="mt-12 pl-[var(--gutter)]">
        <div className="overflow-hidden pr-[var(--gutter)]">
          <motion.div
            ref={track} drag="x" dragConstraints={{ left: limit, right: 0 }} dragElastic={0.08} data-cursor="Drag"
            className="flex w-max cursor-grab gap-5 active:cursor-grabbing"
            onDragStart={() => { dragged.current = true; }}
            onDragEnd={() => setTimeout(() => { dragged.current = false; }, 60)}
          >
            {cutStyles.map((s, i) => (
              <TiltCard key={s.id} label={`${s.name}: view details`} onClick={() => { if (!dragged.current) { play(180); setSel(s); } }}
                className="h-[430px] w-[270px] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#202022] to-[#101011] p-6 sm:w-[300px]">
                <span className="display text-6xl text-white/10">{String(i + 1).padStart(2, '0')}</span>
                <div className="pointer-events-none absolute inset-x-8 top-14 [transform:translateZ(40px)]"><ProfileSvg fade={s.fade} top={s.top} className="mx-auto w-44" /></div>
                <div className="absolute inset-x-6 bottom-6 [transform:translateZ(30px)]">
                  <h3 className="display text-3xl text-bone">{s.name}</h3>
                  <p className="mt-1 text-sm text-steel">{s.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold">Details <span aria-hidden>→</span></span>
                </div>
              </TiltCard>
            ))}
          </motion.div>
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-steel">Drag or swipe →</p>
      </div>

      <div className="wrap mt-24"><FadeSlider /></div>

      <AnimatePresence>{sel && <DetailPanel style={sel} onClose={() => setSel(null)} />}</AnimatePresence>
    </section>
  );
}
