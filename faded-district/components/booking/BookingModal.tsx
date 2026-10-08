'use client';
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useBooking } from './BookingProvider';
import { BookingFlow } from './BookingFlow';
import { lockScroll } from '@/lib/lenis';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

export function BookingModal() {
  const { close, prefill } = useBooking();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    lockScroll(true);
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); lockScroll(false); prev?.focus?.(); };
  }, [close]);

  return (
    <motion.div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-lenis-prevent>
      <motion.div
        ref={panel} role="dialog" aria-modal="true" aria-label="Book a chair"
        className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-charcoal sm:rounded-3xl"
        initial={{ y: 60, opacity: 0, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <button onClick={close} aria-label="Close booking" className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-chrome hover:border-gold hover:text-gold">
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
        <div className="overflow-y-auto overscroll-contain p-6 pb-8 sm:p-10">
          <BookingFlow initial={prefill} onClose={close} />
        </div>
      </motion.div>
    </motion.div>
  );
}
