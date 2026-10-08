/**
 * Core business facts. Edit here; nothing in components is hard-coded.
 */
export const business = {
  name: 'Faded District',
  shortName: 'Faded District',
  tagline: 'Precision cuts. Liverpool, NSW.',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fadeddistrict.com.au',
  phone: '0406 961 333',
  phoneTel: '+61406961333',
  smsNumber: '0406961333',
  address: {
    street: '311 Macquarie St',
    locality: 'Liverpool',
    region: 'NSW',
    postcode: '2170',
    country: 'AU',
  },
  geo: { lat: -33.924925, lng: 150.9223902 },
  instagram: {
    handle: 'fadeddistrictliverpool',
    url: 'https://www.instagram.com/fadeddistrictliverpool/',
  },
  rating: { value: 4.9, count: 57 },
  // TODO: swap for the exact Google Maps place link (Share → Copy link) once you have it.
  googleReviewsUrl:
    'https://www.google.com/maps/search/?api=1&query=Faded+District+311+Macquarie+St+Liverpool+NSW+2170',
  timezone: 'Australia/Sydney',
  /**
   * Booking provider. 'sms' is the built-in text/call flow. To use a real platform later,
   * set provider to 'external' and fill in externalUrl (see lib/booking/providers.ts).
   */
  booking: {
    provider: 'sms' as 'sms' | 'external',
    externalUrl: 'https://www.fresha.com/', // PLACEHOLDER
  },
} as const;

/** Opening hours as minutes from midnight. Index 0 = Sunday … 6 = Saturday. */
export type DayHours = { open: number; close: number };
export const hours: Record<number, DayHours> = {
  0: { open: 9 * 60, close: 17 * 60 },
  1: { open: 9 * 60, close: 18 * 60 },
  2: { open: 9 * 60, close: 18 * 60 },
  3: { open: 9 * 60, close: 18 * 60 },
  4: { open: 9 * 60, close: 19 * 60 },
  5: { open: 9 * 60, close: 19 * 60 },
  6: { open: 9 * 60, close: 19 * 60 },
};

/** Display rows for the hours table (day indexes are the keys above). */
export const hoursRows = [
  { label: 'Monday', days: [1] },
  { label: 'Tuesday', days: [2] },
  { label: 'Wednesday', days: [3] },
  { label: 'Thursday', days: [4] },
  { label: 'Friday', days: [5] },
  { label: 'Saturday', days: [6] },
  { label: 'Sunday', days: [0] },
];
