'use client';
import { useEffect, useRef, useState } from 'react';
import { business } from '@/data/business';

/** Leaflet + CARTO dark tiles, loaded only when near the viewport. Pulsing gold pin. */
export function DarkMap() {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !host.current) return;
    let map: import('leaflet').Map | undefined;
    let dead = false;
    import('leaflet').then((L) => {
      if (dead || !host.current) return;
      const { lat, lng } = business.geo;
      const touch = window.matchMedia('(pointer: coarse)').matches;
      map = L.map(host.current, { center: [lat, lng], zoom: 16, zoomControl: !touch, scrollWheelZoom: false, dragging: !touch, tap: false, attributionControl: true } as import('leaflet').MapOptions);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap contributors © CARTO',
      }).on('tileerror', () => setFailed(true)).addTo(map);
      L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        keyboard: false, title: business.name,
      }).addTo(map);
      setReady(true);
    });
    return () => { dead = true; map?.remove(); };
  }, [near]);

  return (
    <div className="absolute inset-0" role="img" aria-label={`Map showing ${business.name} at ${business.address.street}, ${business.address.locality}`}>
      <div className="absolute inset-0 bg-[#0e0e0e] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      {!ready && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><div className="pin" /></div>}
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(10,10,10,0.9)]" />
      {failed && <p className="absolute bottom-3 left-3 rounded bg-ink/80 px-3 py-1 text-xs text-steel">Map tiles unavailable. Use Directions below.</p>}
    </div>
  );
}
