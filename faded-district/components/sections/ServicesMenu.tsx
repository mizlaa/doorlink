'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { business } from '@/data/business';
import { services, formatPrice, formatBookingPrice } from '@/data/services';
import { useBooking } from '@/components/booking/BookingProvider';
import { SplitText } from '@/components/ui/SplitText';

export function ServicesMenu({ standalone = false }: { standalone?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { open } = useBooking();
  const H = standalone ? 'h1' : 'h2';

  return (
    <section id="services" aria-labelledby="services-title" className="section">
      <div className="wrap">
        <p className="eyebrow">The menu</p>
        <SplitText as={H} text="SERVICES" className="display h-mega mt-2" />
        <span id="services-title" className="sr-only">Services and prices</span>
        <ul className="mt-12 border-t border-white/10">
          {services.map((s, i) => {
            const isOpen = openId === s.id;
            return (
              <li key={s.id} className="group relative border-b border-white/10">
                <span aria-hidden className={`absolute bottom-[-1px] left-0 h-px w-full origin-left bg-gold transition-transform duration-700 [transition-timing-function:cubic-bezier(.22,1,.36,1)] ${isOpen ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} />
                <h3>
                  <button
                    aria-expanded={isOpen} aria-controls={`svc-${s.id}`} onClick={() => setOpenId(isOpen ? null : s.id)}
                    className="flex w-full items-baseline gap-4 py-6 text-left md:gap-8 md:py-8" data-cursor={isOpen ? 'Close' : 'Open'}
                  >
                    <span className="w-8 text-sm font-semibold tabular-nums text-steel md:w-12">{String(i + 1).padStart(2, '0')}</span>
                    <span className={`display flex-1 text-[clamp(1.8rem,5vw,4.5rem)] transition-colors duration-500 ${isOpen ? 'text-gold' : 'text-bone group-hover:text-gold'}`}>{s.name}</span>
                    <span className="hidden flex-1 border-b border-dotted border-white/20 md:block" aria-hidden />
                    <span className="display text-[clamp(1.6rem,4vw,3.5rem)] text-chrome">{formatPrice(s.price)}</span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div id={`svc-${s.id}`} role="region" aria-label={s.name} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                      <div className="grid gap-4 pb-8 pl-12 md:grid-cols-[1fr_auto] md:items-end md:pl-20">
                        <div>
                          <p className="max-w-xl text-lg text-chrome">{s.description}</p>
                          <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-steel">{s.duration} min{s.kids ? ' · Under 12' : ''} · Book ahead {formatBookingPrice(s.price, business.booking.fee)}</p>
                        </div>
                        <button className="btn btn-gold" data-cursor="Book" onClick={() => open({ serviceId: s.id })}>Book {s.name}</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-sm text-steel">Walk-in prices in AUD. Booking ahead adds ${business.booking.fee} to every service. Tap a service for duration and details.</p>
      </div>
    </section>
  );
}
