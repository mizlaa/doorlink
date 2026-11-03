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
