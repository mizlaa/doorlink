'use client';
import { useEffect, useState } from 'react';
import { sydneyNow, shopStatus, type SydneyNow, type ShopStatus } from './hours';

/** Returns null on the server / first paint to avoid hydration mismatch, then ticks every 30s. */
export function useShopStatus(): { now: SydneyNow; status: ShopStatus } | null {
  const [v, setV] = useState<{ now: SydneyNow; status: ShopStatus } | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = sydneyNow();
      setV({ now, status: shopStatus(now) });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return v;
}
