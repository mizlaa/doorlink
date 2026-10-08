'use client';
import Link from 'next/link';
import { business } from '@/data/business';
import { useBooking } from '@/components/booking/BookingProvider';
import { useSound } from '@/lib/sound';
import { scrollToTarget } from '@/lib/lenis';
import { usePathname } from 'next/navigation';
import { Magnetic } from './Magnetic';

const links = [
  { href: '#styles', label: 'Styles' },
  { href: '#services', label: 'Services' },
  { href: '#visit', label: 'Visit' },
];

export function Nav() {
  const { open } = useBooking();
  const { enabled, toggle, play } = useSound();
  const path = usePathname();
  const home = path === '/';

  return (
    <header className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between bg-gradient-to-b from-ink/85 via-ink/40 to-transparent px-[var(--gutter)] pb-6 pt-4">
      <Link href="/" className="display text-2xl tracking-tight text-bone" aria-label="Faded District, home" data-cursor="Home">
        FADED<span className="text-gold">/</span>DISTRICT
      </Link>
      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        {links.map((l) => (
          <a
            key={l.href}
            href={home ? l.href : `/${l.href}`}
            onClick={(e) => { if (home) { e.preventDefault(); scrollToTarget(l.href); } }}
            className="text-sm font-medium uppercase tracking-[0.14em] text-chrome transition-colors hover:text-gold"
          >
            {l.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <button
          onClick={() => { toggle(); }}
          aria-pressed={enabled}
          aria-label={enabled ? 'Sound on. Turn off' : 'Sound off. Turn on'}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-ink/40 text-chrome backdrop-blur transition-colors hover:border-gold hover:text-gold"
          onMouseEnter={() => play(120)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 5 6 9H3v6h3l5 4V5z" />
            {enabled ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></> : <path d="m16 9 5 6M21 9l-5 6" />}
          </svg>
        </button>
        <Magnetic className="hidden md:block">
          <button onClick={() => open()} className="btn btn-gold min-h-[44px] px-6" data-cursor="Book">Book</button>
        </Magnetic>
      </div>
      <span className="sr-only">{business.phone}</span>
    </header>
  );
}
