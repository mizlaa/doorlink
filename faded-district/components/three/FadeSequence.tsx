'use client';
import { useEffect, useRef } from 'react';
import { fx } from '@/lib/fx';

export const SEQUENCE_FRAMES = 48;
const src = (i: number) => `/sequence/f-${String(i).padStart(3, '0')}.jpg`;

/**
 * Low-end / no-WebGL fallback: scrubs a pre-rendered image sequence on a 2D canvas.
 * Frames are produced from the real 3D scene by `npm run capture` (see README).
 */
export function FadeSequence({ className = '', active = true }: { className?: string; active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const imgs: HTMLImageElement[] = [];
    let last = -1, shown = -1, raf = 0, stop = false;

    const best = (i: number) => {
      // nearest loaded frame at or below i, else above
      let k = i;
      while (k >= 0 && !imgs[k]?.naturalWidth) k--;
      if (k < 0) { k = i; while (k < SEQUENCE_FRAMES && !imgs[k]?.naturalWidth) k++; }
      return k;
    };
    const draw = (i: number) => {
      const k = best(i);
      const im = imgs[k];
      if (!im || !im.naturalWidth) return;
      shown = k;
      const w = cv.clientWidth * Math.min(devicePixelRatio, 1.5), h = cv.clientHeight * Math.min(devicePixelRatio, 1.5);
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      const s = Math.min(w / im.naturalWidth, h / im.naturalHeight);
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(im, (w - im.naturalWidth * s) / 2, (h - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
    };

    // load first frame immediately, rest progressively
    const load = (i: number) => { const im = new Image(); im.decoding = 'async'; im.src = src(i); imgs[i] = im; return im; };
    const first = active ? 0 : SEQUENCE_FRAMES - 1;
    load(first);
    let n = 0;
    const pump = () => { if (stop || n >= SEQUENCE_FRAMES) return; for (let j = 0; j < 4 && n < SEQUENCE_FRAMES; j++, n++) if (n !== first) load(n); setTimeout(pump, 120); };
    setTimeout(pump, 200);

    const loop = () => {
      const i = active ? Math.round(fx.fadeProgress * (SEQUENCE_FRAMES - 1)) : SEQUENCE_FRAMES - 1;
      if (i !== last || best(i) !== shown) { last = i; draw(i); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => { last = -1; };
    window.addEventListener('resize', onResize);
    return () => { stop = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [active]);

  return <canvas ref={ref} className={className} role="img" aria-label="Clay head: hair blends from long and untidy to a crisp skin fade" />;
}
