import { hours } from '@/data/business';
import { formatClock, sydneyNow } from '../hours';

export type DayOption = { iso: string; dow: number; label: string; long: string; isToday: boolean };

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Next N days starting from today in Sydney. */
export function getDays(count = 14): DayOption[] {
  const n = sydneyNow();
  const out: DayOption[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(n.y, n.m - 1, n.d + i));
    const dow = dt.getUTCDay();
    const iso = dt.toISOString().slice(0, 10);
    const long = `${SHORT[dow]} ${dt.getUTCDate()} ${MONTH[dt.getUTCMonth()]}`;
    out.push({ iso, dow, long, isToday: i === 0, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : SHORT[dow] });
  }
  return out;
}

export type Slot = { time: string; minutes: number; disabled: boolean };

/** Half-hour start times where the whole service fits before closing; past times disabled (Sydney clock, 15 min lead). */
export function getSlots(day: DayOption, duration = 30): Slot[] {
  const h = hours[day.dow];
  const n = sydneyNow();
  const slots: Slot[] = [];
  for (let m = h.open; m + duration <= h.close; m += 30) {
    const past = day.isToday && m <= n.minutes + 15;
    slots.push({ time: formatClock(m), minutes: m, disabled: past });
  }
  return slots;
}
