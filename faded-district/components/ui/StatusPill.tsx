'use client';
import { useShopStatus } from '@/lib/useSydneyNow';

export function StatusPill({ className = '' }: { className?: string }) {
  const s = useShopStatus();
  const open = s?.status.open;
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-ink/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone backdrop-blur ${className}`}
    >
      <span className="relative flex h-2 w-2">
        {open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s ? (open ? 'bg-emerald-400' : 'bg-red-400') : 'bg-steel'}`} />
      </span>
      {s ? s.status.label : 'Hours · Sydney time'}
    </span>
  );
}
