'use client';
import { useEffect, useState } from 'react';
import { business, hoursRows } from '@/data/business';
import { formatHoursRange } from '@/lib/hours';
import { useShopStatus } from '@/lib/useSydneyNow';
import { directionsUrl } from '@/lib/maps';
import { SplitText } from '@/components/ui/SplitText';
import { StatusPill } from '@/components/ui/StatusPill';
import { DarkMap } from '@/components/ui/DarkMap';

export function Visit() {
  const s = useShopStatus();
  const [dir, setDir] = useState(`https://www.google.com/maps/dir/?api=1&destination=${business.geo.lat},${business.geo.lng}`);
  useEffect(() => setDir(directionsUrl()), []);
  const a = business.address;

  return (
    <section id="visit" aria-labelledby="visit-title" className="section">
      <div className="wrap">
        <p className="eyebrow">Visit us</p>
        <SplitText as="h2" text="311 MACQUARIE ST" className="display h-xl mt-2" />
        <span id="visit-title" className="sr-only">Visit us at {a.street}, {a.locality}</span>
        <p className="mt-3 text-xl text-chrome">{a.locality} {a.region} {a.postcode}</p>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="relative h-[420px] overflow-hidden rounded-3xl border border-white/10 lg:h-auto lg:min-h-[560px]">
            <DarkMap />
          </div>
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/10 bg-charcoal p-7 md:p-9">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h3 className="display text-3xl">Hours</h3>
                <StatusPill />
              </div>
              <table className="w-full text-left">
                <caption className="sr-only">Opening hours, Sydney time</caption>
                <tbody>
                  {hoursRows.map((r) => {
                    const today = s?.now.dow === r.days[0];
                    return (
                      <tr key={r.label} aria-current={today ? 'date' : undefined} className={`border-b border-white/10 last:border-0 ${today ? 'text-gold' : 'text-chrome'}`}>
                        <th scope="row" className="py-3.5 pr-4 text-base font-medium">{r.label}{today && <span className="ml-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink">Today</span>}</th>
                        <td className="py-3.5 text-right tabular-nums">{formatHoursRange(r.days[0])}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <a href={dir} className="btn btn-gold !px-3 !text-xs sm:!text-sm" data-cursor="Go">Directions</a>
              <a href={`tel:${business.phoneTel}`} className="btn btn-ghost !px-3 !text-xs sm:!text-sm">Call</a>
              <a href={`sms:${business.smsNumber}`} className="btn btn-ghost !px-3 !text-xs sm:!text-sm">Text</a>
            </div>
            <p className="text-sm text-steel">{business.phone} · bookings by phone or text</p>
          </div>
        </div>
      </div>
    </section>
  );
}
