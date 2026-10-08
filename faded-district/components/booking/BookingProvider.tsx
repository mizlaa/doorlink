'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

export type Prefill = { serviceId?: string; barberId?: string };
type Ctx = { open: (p?: Prefill) => void; close: () => void; isOpen: boolean; prefill: Prefill };

const BookingCtx = createContext<Ctx>({ open() {}, close() {}, isOpen: false, prefill: {} });
export const useBooking = () => useContext(BookingCtx);

const BookingModal = dynamic(() => import('./BookingModal').then((m) => m.BookingModal), { ssr: false });

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>({});
  const [seed, setSeed] = useState(0);

  const open = useCallback((p: Prefill = {}) => { setPrefill(p); setSeed((s) => s + 1); setOpen(true); }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, close, isOpen, prefill }), [open, close, isOpen, prefill]);

  return (
    <BookingCtx.Provider value={value}>
      {children}
      {isOpen && <BookingModal key={seed} />}
    </BookingCtx.Provider>
  );
}
