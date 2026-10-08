import { business, hours } from '@/data/business';

export type SydneyNow = { y: number; m: number; d: number; dow: number; minutes: number };

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Current wall-clock time in Sydney (independent of the visitor's device timezone). */
export function sydneyNow(date: Date = new Date()): SydneyNow {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: business.timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    y: +get('year'), m: +get('month'), d: +get('day'),
    dow: WD.indexOf(get('weekday')),
    minutes: (+get('hour') % 24) * 60 + +get('minute'),
  };
}

export function formatClock(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h = h24 % 12 || 12;
  return `${h}${m ? ':' + String(m).padStart(2, '0') : ''}${h24 >= 12 ? 'pm' : 'am'}`;
}

export type ShopStatus = { open: boolean; label: string; short: string };

export function shopStatus(now: SydneyNow = sydneyNow()): ShopStatus {
  const today = hours[now.dow];
  if (now.minutes >= today.open && now.minutes < today.close) {
    return { open: true, label: `OPEN NOW · Closes ${formatClock(today.close)}`, short: `Open · closes ${formatClock(today.close)}` };
  }
  if (now.minutes < today.open) {
    return { open: false, label: `CLOSED · Opens ${formatClock(today.open)}`, short: `Closed · opens ${formatClock(today.open)}` };
  }
  const next = hours[(now.dow + 1) % 7];
  return { open: false, label: `CLOSED · Opens ${formatClock(next.open)}`, short: `Closed · opens ${formatClock(next.open)} tomorrow` };
}

export function formatHoursRange(dow: number) {
  const h = hours[dow];
  return `${formatClock(h.open)} – ${formatClock(h.close)}`;
}
