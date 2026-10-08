'use client';
import { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';

/** Perspective tilt + glare highlight that follows the cursor. */
export function TiltCard({ children, className = '', onClick, label }: { children: React.ReactNode; className?: string; onClick?: () => void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.28), rgba(201,169,110,0.08) 35%, transparent 60%)`;

  return (
    <div style={{ perspective: 900 }} className="shrink-0">
      <motion.button
        ref={ref}
        type="button"
        aria-label={label}
        onClick={onClick}
        data-cursor="View"
        className={`relative block text-left [transform-style:preserve-3d] ${className}`}
        style={{ rotateX: rx, rotateY: ry }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          ry.set((px - 0.5) * 16); rx.set(-(py - 0.5) * 16);
          gx.set(px * 100); gy.set(py * 100);
        }}
        onPointerLeave={() => { rx.set(0); ry.set(0); gx.set(50); gy.set(50); }}
        whileTap={{ scale: 0.98 }}
      >
        {children}
        <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-overlay" style={{ background: glare }} />
      </motion.button>
    </div>
  );
}
