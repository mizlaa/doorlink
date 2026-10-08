import { business } from '@/data/business';

/** Opens the platform's native maps app where possible. */
export function directionsUrl(): string {
  const { lat, lng } = business.geo;
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    if (/Android/.test(ua)) return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(business.name)})`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
