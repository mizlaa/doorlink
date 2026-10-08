'use client';
import { useEffect, useRef, useState } from 'react';
import { business } from '@/data/business';
import { reviews } from '@/data/reviews';
import { SplitText } from '@/components/ui/SplitText';
import { Magnetic } from '@/components/ui/Magnetic';

function Counter({ to, decimals = 0, suffix = '', run }: { to: number; decimals?: number; suffix?: string; run: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now(), D = 2000;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / D); setV(to * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to]);
  return <span className="tabular-nums">{v.toFixed(decimals)}{suffix}</span>;
}

export function Reviews() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 gap-6 pr-6 md:gap-10 md:pr-10" aria-hidden={hidden || undefined}>
      {reviews.map((r) => (
        <li key={r.author + r.quote.slice(0, 8)} className="w-[82vw] shrink-0 md:w-[46vw] lg:w-[34vw]">
          <figure className="flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-charcoal p-7 md:p-10">
            <div className="text-gold" aria-label="5 out of 5 stars">★★★★★</div>
            <blockquote className="mt-5 flex-1 text-[clamp(1.2rem,2.2vw,2rem)] font-medium leading-[1.25] text-bone">“{r.quote}”</blockquote>
            <figcaption className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-steel">{r.author}</figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="section overflow-hidden">
      <div className="wrap" ref={ref}>
        <p className="eyebrow">Straight from Google</p>
        <SplitText as="h2" text="WORD ON THE STREET" className="display h-xl mt-2" />
        <span id="reviews-title" className="sr-only">Customer reviews</span>
        <div className="mt-12 flex flex-wrap items-end gap-x-16 gap-y-6">
          <div>
            <div className="display text-[clamp(5rem,16vw,14rem)] leading-[0.8] text-gold"><Counter to={business.rating.value} decimals={1} run={seen} />★</div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-steel">Google rating</p>
          </div>
          <div>
            <div className="display text-[clamp(5rem,16vw,14rem)] leading-[0.8] text-bone"><Counter to={business.rating.count} run={seen} /></div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-steel">Reviews</p>
          </div>
        </div>
      </div>

      <div className="no-scrollbar mt-14 overflow-hidden motion-reduce:overflow-x-auto" tabIndex={0} role="region" aria-label="Customer reviews, scrolling">
        <div className="marquee">{row(false)}{row(true)}</div>
      </div>

      <div className="wrap mt-12">
        <Magnetic><a href={business.googleReviewsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-gold" data-cursor="Read">Read all reviews on Google ↗</a></Magnetic>
      </div>
    </section>
  );
}
