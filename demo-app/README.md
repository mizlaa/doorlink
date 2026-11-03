# Doorlink interactive demo (demo only)

A clickable copy of the Doorlink app for showing to people. It uses the app's own screens and components from `src/`: the home page with the opening garage door, the 3D designer for garage doors, gates, fences and shutters, quote comparison, bookings, the job board and the dashboards. A browser-only demo layer stands in for the server.

Everything is fictional and stays in the visitor's browser:

- fictional businesses, prices, reviews and people;
- no payments, Stripe charges, orders, emails, texts, push notifications or supplier connections;
- no database, no server calls, and no image generation.

A banner on every page says so.

## Try it

| Role | Email | What to look at |
| --- | --- | --- |
| Customer | customer@demo.doorlink.test | Design, Get installed quotes, book, pay (simulated), review |
| Installer | installer@demo.doorlink.test | Job board: quote on customer jobs |
| Supplier | supplier@demo.doorlink.test | Dashboard, automated prices, listings, enquiries |
| Manufacturer | manufacturer@demo.doorlink.test | Dashboard, catalogue, dealers |
| Admin | admin@demo.doorlink.test | Businesses, price rules, reviews, metrics, reset |

The password for every account is `Demo123!`. The sign-in page also has one-tap "Try it" buttons. The **Demo guide** link in the banner has a ten-step tour.

Things to try:

- **Admin pricing.** As admin, open Admin, then Price rules. Change a price, or raise a business's prices by 5%. Compare quotes again as the customer and the new price is used.
- **Reset.** Account, then Reset demo, or Admin, then Reset demo data. Either puts the sample data back.

## Preview on an iPhone

**Option 1: the single file.** `demo-app/doorlink-demo.html` contains the whole demo: script, styles, fonts and pictures. Put it on any static host and open the link in Safari. GitHub Pages, Netlify Drop and a shared preview link all work. Then tap Share and choose Add to Home Screen to open it full screen.

**Option 2: from a computer on the same Wi-Fi.**

```bash
npm install
npx vite build --config demo-app/vite.config.mts
python3 -m http.server 4300 --directory demo-app/dist --bind 0.0.0.0
```

Find the computer's local IP address, for example `192.168.1.20`. On the iPhone, open `http://192.168.1.20:4300` in Safari. While editing, `npx vite --config demo-app/vite.config.mts` serves a live-reloading copy on port 5199.

## The 3D designer

The demo replaces the app's 3D preview with an upgraded scene in `demo-app/src/three/`. It keeps the same props and exports, so the app's own option controls drive it unchanged. The build swaps it in, together with a copy of the option-to-3D mapping that also passes on the real opening size, insulation and opener.

**Scene:**
- **Built at real size, in metres.** The garage opening is exactly the width and height chosen, from 1800 to 6000 mm wide and 1800 to 3000 mm high.
- **An Australian brick-veneer home:**
  - hipped concrete-tile roofs with ridge capping, fascia, quad gutters, eaves and downpipes;
  - aluminium windows recessed in their openings, with brick sills;
  - a timber entry door under a rendered portal;
  - a lined, lit garage interior;
  - a concrete driveway with saw cuts, footpath, kerb and road;
  - Colorbond fences, bins, a letterbox and the neighbours' houses.
- **Plants:**
  - eucalypts, clipped lilly pillies, bottlebrush and lomandra, drawn as instanced leaf cards;
  - a light breeze in the shader;
  - a ring of background trees.

**Door mechanisms.** Measurements are generic, not any manufacturer's specification.
- **Sectional:** each panel rides its rollers up the vertical track, round a 380 mm radius and back under the ceiling. Hinges, torsion springs, cable drums and lift cables move with it, and so does the opener trolley (belt, chain, direct drive, or none).
- **Roller:** a corrugated curtain coils onto a drum behind the header, as an Archimedean spiral, in side guides with a bottom rail and lock.
- **Tilt:** a one-piece door whose top runs back on tracks while it swings up into a canopy on pivot arms.

**Materials and light:**
- painted-steel door skin with matte, satin and gloss clearcoats, or a timber look;
- raised, ribbed or flush profiles cut into the panel geometry;
- glazing with reflections;
- a CC0 park HDRI for ambient light and reflections;
- a late-morning sun with shadows, ambient occlusion and AgX tone mapping.

**Camera.** View buttons (3/4, Front, Side, Inside), zoom, and a 360° turn. Changing an option never moves the camera. On a phone, a sideways drag turns the view and a vertical swipe scrolls the page.

**Performance:**
- a quality tier chosen from the device, stepped down automatically if the frame rate drops;
- rendering pauses when the preview is off-screen or the tab is hidden;
- the designer and its textures load in the background shortly after the first page opens.

**Gates, fences and shutters** keep the app's own geometry and mechanisms (sliding, swinging with ram motors, rolling). They sit on the same stage and surroundings.

### Assets: what is made here and what would be sourced

**Made for the demo:**
- **Textures:** every surface texture (brick, render, roof tile, concrete, lawn, mulch, timber, bark, steel and the leaf cards) is generated by `demo-app/scripts/make-textures.py`. They are seamless, tileable and scaled to real-world sizes.
- **Geometry:** all geometry is built in code.

**Sourced:** the lighting map is the CC0 "Rooitou Park" HDRI from Poly Haven, via the pmndrs drei-assets mirror, reduced to 512 × 256.

**For a production configurator, source:**
- photo-scanned PBR texture sets, from CC0 libraries such as Poly Haven or ambientCG, or a commissioned scan;
- GLB plant models;
- manufacturer-approved door models and dimensions.

These hosts were not reachable from the build environment, so nothing here pretends to be one of them.

## Doorlink World

Once the hero garage door is fully open, **Explore Doorlink World** (`src/world/`, loaded only when asked for) pulls the camera back from the garage to the whole property. It's built from the designer's own house, landscape, sectional door, gate, fence and pillar parts, with neighbours on both sides and across the street.

- **Transform my property** runs one sequence: a new garage door is fitted while the old one is up, then an automated sliding gate between new pillars, then the old pickets are swapped for a matching slat fence and pedestrian gate, then roller shutters go on the front windows, and finally everything operates together. It can be skipped and replayed.
- Afterwards, tap any product (or its label) to operate it. Each card has an **X-ray** view: gate motor and track, gate hinges and latch, shutter axle and guide rails, fence posts and footings. The garage card also opens the full X-Ray Garage.
- Fence styles (charcoal slats, timber-look slats, pale pickets, solid grey) restyle the gates as well.
- **Night** switches to moonlight, lit windows, wall lanterns, path and garden lights, and closes the gates, shutters and garage in turn.
- The camera orbits all the way round, but stays above the ground, within zoom limits and out of the buildings: if it would enter one, it slides towards its target instead. Portrait screens get a wider lens and views pulled back to the same framing.

## X-Ray Garage

On the home page, open the garage door fully and an invitation appears over the hero: *Ever wondered what makes your garage door work?* **Activate X-ray mode** opens a full-screen, see-through garage (`src/xray/`, loaded only when asked for). It reuses the designer's sectional door, camera rig and lighting.

- **Stations:** springs, motor and opener, tracks and rollers, safety sensors, door panels. Pick one from the chips or tap its label in the scene. The camera flies there and the part glows orange.
- **Test your garage:** a see-through open and close cycle; an obstruction test (a box breaks the photo-eye beam, the door stops and reverses); an insulated vs single-skin thermal view; and a comparison of belt, chain, direct and manual openers.
- Everything is labelled as an illustration. There are no figures for energy, performance or certification, and no instructions for adjusting springs.
- The camera stays above the floor and within zoom limits. Reset view, play/pause and Exit (or Escape) are always available. Reduced motion makes camera moves instant.

## Build

```bash
# Multi-file build into demo-app/dist
npx vite build --config demo-app/vite.config.mts

# Single self-contained file: demo-app/doorlink-demo.html
DEMO_SINGLE=1 npx vite build --config demo-app/vite.config.mts
node demo-app/scripts/single-file.mjs
```

## Tests

```bash
# Unit tests: seed data, quote pricing and GST, admin price edits,
# suspensions, the job board, overlap checks, reset.
npx vitest run --config demo-app/vitest.config.mts

# Type check
npx tsc -p demo-app/tsconfig.json

# Browser checks, against a served build on port 4300:
#   every route for every role, with no errors or sideways scrolling
#   at iPhone width (add --desktop for 1366 px)
node demo-app/tests/e2e-routes.cjs
#   the cross-role flows: post a job, installer quotes, customer accepts,
#   admin price change shows in quotes, suspension, supplier price edit,
#   new listing, messages, moderation, reset
node demo-app/tests/e2e-flows.cjs
```

## How it is kept apart from the real app

- **Separate folder and build.** The demo lives in `demo-app/` and builds with its own Vite config. The Next.js app, its settings and its data are untouched.
- **Server actions replaced.** The real server actions (`src/app/**/actions.ts`) are swapped for local versions in `demo-app/src/actions/` at build time. They use the same validation and the same pricing engine (`src/lib/pricing`), but write to the browser's local storage.
- **Server code blocked.** The build fails if anything imports the database, auth, email or payment modules.
- **Next.js stand-ins.** `next/link`, `next/navigation` and the Prisma enums are replaced by small browser versions in `demo-app/src/stubs/`.
- **Pictures made by the demo itself.** The business portfolio pictures in `public/portfolio/` were rendered by the demo's own 3D designer.
