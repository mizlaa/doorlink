'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { business } from '@/data/business';
import { gallery, type GalleryItem } from '@/data/gallery';
import { SplitText } from '@/components/ui/SplitText';
import { Magnetic } from '@/components/ui/Magnetic';

/**
 * Blurred + dim until hovered (desktop) or centred in the viewport (touch): the fade-to-focus motif.
 * Videos play (muted, looped) only while in focus and pause otherwise.
 */
function Tile({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [focus, setFocus] = useState(false);
  const [hover, setHover] = useState(false);
  const active = focus || hover;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFocus(e.isIntersecting), { rootMargin: '-30% 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (active && !reduced) v.play().catch(() => {});
    else v.pause();
  }, [active]);

  const media = 'h-full w-full scale-110 object-cover blur-[10px] brightness-50 grayscale transition-[filter,transform] duration-[900ms] [transition-timing-function:cubic-bezier(.22,1,.36,1)] group-data-[active=true]:scale-100 group-data-[active=true]:blur-0 group-data-[active=true]:brightness-100 group-data-[active=true]:grayscale-0 motion-reduce:blur-0 motion-reduce:brightness-100 motion-reduce:grayscale-0';

  return (
    <button
      ref={ref} type="button" data-active={active} data-cursor="View" aria-label={`Open: ${item.alt}`}
      onClick={onOpen} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)} onPointerLeave={() => setHover(false)}
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-charcoal text-left"
    >
      {item.type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.src} alt={item.alt} loading="lazy" decoding="async" width={900} height={1604} className={media} style={{ objectPosition: item.position }} />
      ) : (
        <video ref={vid} src={item.src} poster={item.poster} muted loop playsInline preload="none" aria-label={item.alt} className={media} style={{ objectPosition: item.position }} />
      )}
      {item.type === 'video' && (
        <span aria-hidden className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/60 text-gold backdrop-blur">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>
        </span>
      )}
    </button>
  );
}

function Lightbox({ index, onClose, onNav }: { index: number; onClose: () => void; onNav: (d: number) => void }) {
  const item = gallery[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.documentElement.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNav(1);
      if (e.key === 'ArrowLeft') onNav(-1);
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); document.documentElement.style.overflow = ''; prev?.focus?.(); };
  }, [onClose, onNav]);

  const arrow = 'absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-ink/60 text-bone backdrop-blur hover:border-gold hover:text-gold';
  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Gallery viewer" className="fixed inset-0 z-[170] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button ref={closeRef} onClick={onClose} aria-label="Close viewer" className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-bone hover:border-gold hover:text-gold">✕</button>
      <button onClick={() => onNav(-1)} aria-label="Previous" className={`${arrow} left-3 md:left-8`}>←</button>
      <button onClick={() => onNav(1)} aria-label="Next" className={`${arrow} right-3 md:right-8`}>→</button>
      <AnimatePresence mode="wait">
        <motion.figure key={index} className="flex max-h-full max-w-full flex-col items-center" initial={{ opacity: 0, filter: 'blur(14px)', scale: 0.97 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          {item.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.src} alt={item.alt} className="max-h-[82dvh] max-w-full rounded-2xl object-contain" />
          ) : (
            <video src={item.src} poster={item.poster} autoPlay muted loop playsInline controls aria-label={item.alt} className="max-h-[82dvh] max-w-full rounded-2xl" />
          )}
          <figcaption className="mt-4 max-w-md text-center text-sm text-chrome">{item.alt}</figcaption>
        </motion.figure>
      </AnimatePresence>
    </motion.div>
  );
}

export function Gallery() {
  const [open, setOpen] = useState<number | null>(null);
  const nav = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + gallery.length) % gallery.length)), []);
  const close = useCallback(() => setOpen(null), []);

  return (
    <section id="work" aria-labelledby="work-title" className="section">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">The work</p>
            <SplitText as="h2" text="FRESH OFF THE CHAIR" className="display h-xl mt-2" />
            <span id="work-title" className="sr-only">The work: recent cuts from Faded District</span>
          </div>
          <Magnetic><a href={business.instagram.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-cursor="Follow">Follow @{business.instagram.handle}</a></Magnetic>
        </div>
        <ul className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {gallery.map((it, i) => (
            <li key={it.src} className={i % 3 === 1 ? 'md:translate-y-10' : ''}><Tile item={it} onOpen={() => setOpen(i)} /></li>
          ))}
        </ul>
      </div>
      <AnimatePresence>{open !== null && <Lightbox index={open} onClose={close} onNav={nav} />}</AnimatePresence>
    </section>
  );
}
