'use client';
import { useEffect, useState } from 'react';

export type Quality = {
  ready: boolean;
  reduced: boolean;
  mobile: boolean;
  lowEnd: boolean;
  webgl: boolean;
  dpr: number;
  /** true if we should run real 3D */
  use3D: boolean;
};

const SSR: Quality = { ready: false, reduced: false, mobile: false, lowEnd: false, webgl: true, dpr: 1, use3D: false };

function detect(): Quality {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowEnd = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;
  let webgl = false;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {}
  const forced = new URLSearchParams(location.search).get('3d');
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  const use3D = forced === 'off' ? false : forced === 'on' ? webgl : webgl && !reduced && !lowEnd;
  return { ready: true, reduced, mobile, lowEnd, webgl, dpr, use3D };
}

let cached: Quality | null = null;
export function getQuality(): Quality {
  if (typeof window === 'undefined') return SSR;
  return (cached ??= detect());
}

export function useQuality(): Quality {
  const [q, setQ] = useState<Quality>(SSR);
  useEffect(() => setQ(getQuality()), []);
  return q;
}
