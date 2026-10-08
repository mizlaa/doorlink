# Faded District

Cinematic one-page site for **Faded District**, a barbershop at 311 Macquarie St, Liverpool NSW.
Next.js (App Router) · TypeScript · Tailwind · React Three Fiber · GSAP + ScrollTrigger · Framer Motion · Lenis.

Routes: `/` (long-scroll home) · `/services` · `/book` (the booking modal opens from anywhere).

## Setup

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm run typecheck
```

Node 18.18+ required. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL` to the live domain.

## Where to edit content (no component changes needed)

Everything editable lives in **`/data`**:

| File | What it controls |
| --- | --- |
| `business.ts` | Name, phone, address, geo, Instagram, rating, Google link, **opening hours**, booking provider |
| `services.ts` | **Service menu, prices & durations** (booking fee is `booking.fee` in `business.ts`) |
| `reviews.ts` | Reviews shown in the marquee |
| `styles.ts` | Fade Style Explorer cards (links to a service id for pricing / booking prefill) |
| `gallery.ts` | **Gallery** photos & videos (files in `public/work`; add a line per item) |
| `copy.ts` | SEO title/description, hero copy, process steps, chair hotspots |

### Opening hours & the "Open now" pill
Hours are minutes-from-midnight in `data/business.ts`. The pill, the hours table highlight and the booking time slots are all computed in **Australia/Sydney** time with `Intl`, regardless of the visitor's device timezone (`lib/hours.ts`).

## Booking

Bookings are by text or call. `/book` and the modal run a 3-step request flow (service → day/time → name & mobile) and finish by opening the visitor's messaging app with a pre-written `sms:` link to 0406 961 333, plus a "Call instead" button.

**Swapping in Fresha / Square Appointments / Timely:** the UI never builds the SMS itself. It collects a `BookingRequest` and passes it to a provider in `lib/booking/providers.ts`, which returns a `BookingResult` (`sms`, `redirect` or `done`) that the final screen renders generically. Add a provider (API call or deep link), then set `booking.provider` in `data/business.ts`. No UI rebuild is needed.

## 3D: how it works and how to swap models

All scenes are in `components/three/` and are **procedural** (no model downloads, no HDRs):

- `PoleScene.tsx`: hero barber pole (glass shell, chrome caps, generated stripe texture, bloom + chromatic aberration)
- `HeadScene.tsx`: "The Fade" head. A custom shader blends two hair-height maps (long/untidy vs skin fade) driven by scroll, with a clipper line climbing the head
- `ChairScene.tsx`: shop tour (chair, mirror, reflective floor, hotspots)
- `SceneFrame.tsx` / `CanvasHost.tsx`: lazy loading, poster-until-ready, DPR cap, pause when offscreen

**To use a real model** (Draco-compressed GLB recommended, e.g. `gltf-transform optimize in.glb out.glb --compress draco`):

1. Put it in `public/models/chair.glb`.
2. In `ChairScene.tsx`, replace the `<Chair />` component with
   ```tsx
   const { scene } = useGLTF('/models/chair.glb', '/draco/'); // copy three/examples/jsm/libs/draco/gltf → public/draco
   return <primitive object={scene} />;
   ```
   Keep the hotspot positions in `HOTSPOT_POS` aligned with the new model.
3. The same applies to the pole (`Pole`) and head. For the head, keep a `position` attribute plus the `aMask` attribute (0–1 hair-growth mask) and the shader will work unchanged; or drop the custom shader and swap materials.

### Fallbacks & performance
- **Reduced motion / no WebGL / low-end device** (≤4 cores or ≤2 GB): 3D is skipped. Posters are shown and The Fade section scrubs an **image sequence on a 2D canvas**. Scroll-pinning is disabled under reduced motion.
- Mobile caps DPR at 1.5 and skips chromatic aberration. Canvases mount only when near the viewport and stop rendering when offscreen. Three.js is code-split and never in the initial bundle.
- Force modes for testing: `/?3d=on` and `/?3d=off`.

### Regenerating posters & the image sequence
Poster images (`public/posters/*.jpg`) and the 48-frame sequence (`public/sequence/f-000…047.jpg`) are rendered from the real scenes:

```bash
npm run build && npx next start -p 3100 &
npm run capture            # needs Chromium with WebGL; set CHROMIUM_PATH if not found
```
Re-run after changing a scene's look.

## Interactions cheat-sheet
- Custom cursor labels: add `data-cursor="Drag"` (or any text) to an element.
- Sound: off by default, synthesised clipper buzz (WebAudio, no files); toggle in the nav.
- Easter egg: type **fade** anywhere.
- Gyro tilt on mobile: automatic on Android; iOS shows an **Enable tilt** button (permission prompt).

## SEO & accessibility
`BarberShop` JSON-LD (address, geo, phone, hours, 4.9★/57 reviews, Instagram `sameAs`) is generated from `/data` in `app/layout.tsx`. The OG image (`app/opengraph-image.tsx`) is a generated barber-pole + wordmark card. Also: sitemap, robots, skip link, focus rings, `aria-live` status, keyboard-operable booking & menus, and `prefers-reduced-motion` support. Gold (#C9A96E) on ink is ~8.5:1; steel (#8A8F98) on ink is ~6:1.

## Deploy to Vercel
1. Push the repo, then **Add New → Project** on Vercel and import it.
2. If this lives in a monorepo (as in `doorlink`), set **Root Directory** to `faded-district`.
3. Framework preset: Next.js (auto). Add `NEXT_PUBLIC_SITE_URL`. Deploy.
4. Add your domain under *Settings → Domains*.

## Things to replace before launch
- `business.googleReviewsUrl` → the exact Google Maps place link
- Footer "Studio credit" text; `siteUrl` domain
- Map tiles use CARTO dark (free, attribution required). For heavy traffic, use your own Mapbox/Stadia key.
