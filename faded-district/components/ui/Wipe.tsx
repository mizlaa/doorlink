'use client';
import { useEffect, useRef, useState } from 'react';

/** Clip-path wipe reveal when scrolled into view. */
export function Wipe({ children, className = '', axis = 'y', delay = 0 }: { children: React.ReactNode; className?: string; axis?: 'x' | 'y'; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // observe the unclipped wrapper; clip the inner element
    <div ref={ref}>
      <div className={`${axis === 'x' ? 'wipe-x' : 'wipe'} ${on ? 'wipe-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
        {children}
      </div>
    </div>
  );
}
