'use client';
import { useEffect, useState } from 'react';
import { business } from '@/data/business';
import { useBooking } from '@/components/booking/BookingProvider';
import { directionsUrl } from '@/lib/maps';

const Icon = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

/** Thumb-reachable [Call] [Book] [Directions]; mobile only. */
export function MobileBar() {
  const { open, isOpen } = useBooking();
  const [dir, setDir] = useState('#visit');
  useEffect(() => setDir(directionsUrl()), []);
  if (isOpen) return null;
  const item = 'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-chrome active:text-gold';
  return (
    <nav aria-label="Quick actions" className="fixed inset-x-3 bottom-3 z-[70] flex items-stretch rounded-2xl border border-white/10 bg-ink/80 shadow-2xl backdrop-blur-xl md:hidden" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <a href={`tel:${business.phoneTel}`} className={item}><Icon d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />Call</a>
      <button onClick={() => open()} className="my-1.5 flex flex-[1.3] items-center justify-center gap-2 rounded-xl bg-gold text-[12px] font-bold uppercase tracking-[0.14em] text-ink">Book</button>
      <a href={dir} className={item}><Icon d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />Directions</a>
    </nav>
  );
}
