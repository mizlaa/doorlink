'use client';
import { useState } from 'react';
import { barbers } from '@/data/barbers';
import { useBooking } from '@/components/booking/BookingProvider';
import { SplitText } from '@/components/ui/SplitText';
import { Wipe } from '@/components/ui/Wipe';

export function Barbers() {
  const { open } = useBooking();
  const [flipped, setFlipped] = useState<string | null>(null);
  return (
    <section id="barbers" aria-labelledby="barbers-title" className="section">
      <div className="wrap">
        <p className="eyebrow">The team</p>
        <SplitText as="h2" text="MEET THE BARBERS" className="display h-xl mt-2" />
        <span id="barbers-title" className="sr-only">Meet the barbers</span>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {barbers.map((b, i) => (
            <li key={b.id}>
              <Wipe delay={i * 120}>
                <div className={`flip ${flipped === b.id ? 'is-flipped' : ''}`}>
                  <div className="flip-inner aspect-[4/5]">
                    <div className="flip-face absolute inset-0 overflow-hidden rounded-3xl border border-white/10 bg-charcoal">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.photo} alt={`Portrait of ${b.name}, ${b.role}`} width={800} height={1000} loading="lazy" className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/70 to-transparent p-6 pt-24">
                        <h3 className="display text-4xl">{b.name}</h3>
                        <p className="text-sm text-steel">{b.role}</p>
                      </div>
                      <button
                        className="absolute inset-0" aria-label={`${b.name}: show details`} aria-expanded={flipped === b.id} data-cursor="View"
                        onClick={() => setFlipped(flipped === b.id ? null : b.id)}
                      />
                    </div>
                    <div className="flip-face flip-back flex flex-col justify-between overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-b from-[#1c1a15] to-charcoal p-7">
                      <div>
                        <p className="eyebrow">{b.role}</p>
                        <h3 className="display h-lg mt-2">{b.name}</h3>
                        <p className="mt-4 text-chrome">{b.specialty}</p>
                        {b.instagram && <a href={b.instagram} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm text-gold underline underline-offset-4">Instagram ↗</a>}
                      </div>
                      <div className="flex items-center gap-3">
                        <button className="btn btn-gold flex-1" data-cursor="Book" onClick={() => open({ barberId: b.id })}>Book with {b.name.split(' ')[0]}</button>
                        <button className="btn btn-ghost px-4" aria-label="Flip back" onClick={() => setFlipped(null)}>↺</button>
                      </div>
                    </div>
                  </div>
                </div>
              </Wipe>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
