'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type SoundCtx = { enabled: boolean; toggle: () => void; play: (ms?: number) => void };
const Ctx = createContext<SoundCtx>({ enabled: false, toggle() {}, play() {} });
export const useSound = () => useContext(Ctx);

/** Synthesised clipper buzz (no audio files). Off by default. */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const ac = useRef<AudioContext | null>(null);
  const last = useRef(0);

  useEffect(() => {
    try { setEnabled(localStorage.getItem('fd-sound') === '1'); } catch {}
  }, []);

  const play = useCallback((ms = 220) => {
    if (!enabled) return;
    const t0 = performance.now();
    if (t0 - last.current < 120) return;
    last.current = t0;
    try {
      ac.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const c = ac.current;
      if (c.state === 'suspended') c.resume();
      const now = c.currentTime;
      const dur = ms / 1000;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.03);
      gain.gain.setValueAtTime(0.05, now + dur - 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 0.8;
      for (const f of [118, 121, 236]) {
        const o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f;
        o.connect(filter); o.start(now); o.stop(now + dur);
      }
      filter.connect(gain); gain.connect(c.destination);
    } catch {}
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((e) => {
      const n = !e;
      try { localStorage.setItem('fd-sound', n ? '1' : '0'); } catch {}
      return n;
    });
  }, []);

  const value = useMemo(() => ({ enabled, toggle, play }), [enabled, toggle, play]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
