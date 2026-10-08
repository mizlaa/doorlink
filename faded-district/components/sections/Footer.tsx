'use client';
import { useEffect, useRef } from 'react';
import { business } from '@/data/business';
import { hoursRows } from '@/data/business';
import { formatHoursRange } from '@/lib/hours';

export function Footer() {
  const mark = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mark.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (r.height + 30)));
      el.style.setProperty('--p', p.toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);

  const a = business.address;
  return (
    <footer className="relative overflow-hidden pb-28 pt-24 md:pb-12">
      <div className="wrap">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="eyebrow">Faded District</p>
            <p className="mt-3 max-w-sm text-lg text-chrome">Precision cuts, fades and beard work in the heart of Liverpool.</p>
          </div>
          <address className="not-italic text-chrome">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-steel">Find us</p>
            <p className="mt-3">{a.street}<br />{a.locality} {a.region} {a.postcode}</p>
            <p className="mt-3"><a className="hover:text-gold" href={`tel:${business.phoneTel}`}>{business.phone}</a></p>
            <p className="mt-1"><a className="hover:text-gold" href={business.instagram.url} target="_blank" rel="noopener noreferrer">@{business.instagram.handle}</a></p>
          </address>
          <div className="text-chrome">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-steel">Hours</p>
            <ul className="mt-3 space-y-1 text-sm">
              {[['Mon–Wed', 1], ['Thu–Sat', 4], ['Sun', 0]].map(([l, d]) => (
                <li key={l as string} className="flex justify-between gap-6"><span>{l}</span><span className="tabular-nums">{formatHoursRange(d as number)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div
        ref={mark} aria-hidden
        className="display mt-16 select-none px-[var(--gutter)] text-center text-[clamp(5.5rem,31vw,9rem)] leading-[0.82] md:text-[15.2vw] md:leading-[0.85]"
        style={{
          ['--p' as string]: 0,
          WebkitTextStroke: '1.5px rgba(217,220,225,0.55)',
          color: 'transparent',
          backgroundImage: 'linear-gradient(to top, #F2EFE9 0%, #8A8F98 calc(var(--p) * 100% * 0.6), rgba(10,10,10,0) calc(var(--p) * 130%))',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
        }}
      >
        <span className="block md:inline">FADED</span> <span className="block md:inline">DISTRICT</span>
      </div>

      <div className="wrap mt-10 flex flex-col justify-between gap-3 text-xs text-steel md:flex-row">
        <p>© {new Date().getFullYear()} {business.name}. All rights reserved.</p>
        <p>Site by <a className="underline underline-offset-4 hover:text-gold" href="#top">Studio credit placeholder</a></p>
      </div>
    </footer>
  );
}
