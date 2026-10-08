import { business } from '@/data/business';
import type { Service } from '@/data/services';

/**
 * ───────────────────────────────────────────────────────────────
 *  BOOKING PROVIDERS: swap the final step without touching the UI.
 * ───────────────────────────────────────────────────────────────
 * The multi-step UI collects a `BookingRequest` and hands it to the active provider.
 * The provider returns a `BookingResult`, and the final screen renders it generically.
 *
 * To move to Fresha / Square Appointments / Timely:
 *   1. add a provider below (e.g. an API call, or a deep link with prefilled params)
 *   2. return { kind: 'redirect', url } or { kind: 'done', message }
 *   3. set business.booking.provider in /data/business.ts
 */
export type BookingRequest = {
  service: Service;
  dateISO: string; // yyyy-mm-dd (Sydney)
  dateLabel: string; // "Sat 12 Oct"
  time: string; // "11am"
  name: string;
  phone: string;
};

export type BookingResult =
  | { kind: 'sms'; href: string; message: string }
  | { kind: 'redirect'; url: string; message: string }
  | { kind: 'done'; message: string };

export interface BookingProvider {
  id: string;
  submit(req: BookingRequest): Promise<BookingResult>;
}

export function buildSmsMessage(r: BookingRequest): string {
  return `Hi Faded District, I'd like to book a ${r.service.name} on ${r.dateLabel} around ${r.time}. Name: ${r.name}.`;
}

const smsProvider: BookingProvider = {
  id: 'sms',
  async submit(r) {
    const message = buildSmsMessage(r);
    // "?&body=" works on both iOS and Android
    return { kind: 'sms', message, href: `sms:${business.smsNumber}?&body=${encodeURIComponent(message)}` };
  },
};

const externalProvider: BookingProvider = {
  id: 'external',
  async submit(r) {
    const u = new URL(business.booking.externalUrl);
    u.searchParams.set('service', r.service.id);
    u.searchParams.set('date', r.dateISO);
    return { kind: 'redirect', url: u.toString(), message: 'Continue on our booking page to confirm your time.' };
  },
};

const registry: Record<string, BookingProvider> = { sms: smsProvider, external: externalProvider };
export const getBookingProvider = (): BookingProvider => registry[business.booking.provider] ?? smsProvider;
