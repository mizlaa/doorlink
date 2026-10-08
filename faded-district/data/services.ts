/**
 * Services menu. Edit freely; every section reads from this array.
 *
 * price       Walk-in price in AUD. `null` = varies (shown as "Varies").
 * duration    Minutes of chair time. Online booking requests only offer times that fit this.
 * Booking requests cost `business.booking.fee` extra per service (see data/business.ts).
 */
export type Service = {
  id: string;
  name: string;
  price: number | null; // AUD, null = varies
  duration: number; // minutes
  description: string;
  kids?: boolean;
};

export const services: Service[] = [
  { id: 'skin-fade', name: 'Skin Fade', price: 40, duration: 30, description: 'Down to the skin and blended seamlessly. The signature.' },
  { id: 'skin-fade-beard', name: 'Skin Fade and Beard', price: 50, duration: 45, description: 'Our skin fade paired with a full beard trim and line-up.' },
  { id: 'beard-trim', name: 'Beard Trim', price: 20, duration: 45, description: 'Shaped, lined and softened with a razor-sharp edge.' },
  { id: 'taper-fade', name: 'Taper', price: 35, duration: 30, description: 'A softer, shorter-to-longer taper around the ears and neckline.' },
  { id: 'classic-cut', name: 'Classic Cut', price: 30, duration: 20, description: 'Clippers and scissors, finished clean. Timeless and tidy.' },
  { id: 'kids-cut', name: 'Kids Cut (under 12)', price: 25, duration: 20, description: 'Patient, friendly and perfect for first haircuts.', kids: true },
  { id: 'hot-wax', name: 'Hot Wax', price: null, duration: 15, description: 'Hot wax for a clean finish. Price depends on the area, so ask in the chair.' },
];

export const getService = (id?: string | null) => services.find((s) => s.id === id) ?? null;

/** Walk-in price label, e.g. "$40" or "Varies". */
export const formatPrice = (n: number | null) => (n === null ? 'Varies' : `$${n}`);

/** Price when booking ahead = walk-in price + booking fee. */
export const bookingPrice = (n: number | null, fee: number) => (n === null ? null : n + fee);
export const formatBookingPrice = (n: number | null, fee: number) => (n === null ? `Varies + $${fee}` : `$${n + fee}`);
