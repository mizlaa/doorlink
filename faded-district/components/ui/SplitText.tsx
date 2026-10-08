'use client';
import { createElement, useEffect, useRef, useState } from 'react';

/** Letters rise from below. `when="loaded"` waits for the preloader to finish. */
export function SplitText({
  text, as = 'h2', className = '', delay = 0, when = 'view',
}: { text: string; as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div'; className?: string; delay?: number; when?: 'view' | 'loaded' }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (when !== 'loaded') return;
    if (document.documentElement.dataset.loaded === 'true') { setLoaded(true); return; }
    const on = () => setLoaded(true);
    window.addEventListener('fd:loaded', on);
    return () => window.removeEventListener('fd:loaded', on);
  }, [when]);

  const go = inView && (when === 'view' || loaded);
  let i = 0;
  const words = text.split(' ');

  return createElement(
    as,
    { ref, className: `${className} ${go ? 'split-in' : ''}`, 'aria-label': text, style: { ['--delay' as string]: `${delay}ms` } },
    words.map((w, wi) => (
      <span key={wi} aria-hidden className="split-word">
        {[...w].map((c, ci) => (
          <span key={ci} className="split-char" style={{ ['--i' as string]: i++ }}>{c}</span>
        ))}
        {wi < words.length - 1 ? ' ' : ''}
      </span>
    ))
  );
}
