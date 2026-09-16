# Doorlink — handoff to the frontend/UI team

Read this before changing anything. It is the counterpart to the
`REPLIT_UI_HANDOFF.md` you will write on the way back, and it exists so
that a UI pass improves what is here rather than rediscovering it.

Short version: there is already a design system, the app is real
(database, auth, server actions — not mocks), and a handful of things
that look like missing polish are deliberate and must survive.

---

## 1. Stack and structure

| | |
|---|---|
| Framework | Next.js 15, App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS 3.4 with custom tokens in `tailwind.config.ts` |
| Data | Prisma 5 → PostgreSQL. Supabase is intended but **not connected yet** |
| Mutations | React Server Actions (`useActionState`), not a REST/fetch layer |
| 3D | three.js via `@react-three/fiber` + `drei` + `postprocessing` |
| Motion | `framer-motion` |
| Tests | `vitest` (`npm test`) |

```
src/
  app/                 routes (App Router). Server Components by default.
    <route>/page.tsx   the page — almost always a Server Component
    <route>/actions.ts 'use server' — mutations. BACKEND. Do not restyle.
    <route>/*.tsx      'use client' — the interactive parts. YOURS.
  components/
    ui/                the design system primitives (see §3)
    layout/            Header, Footer, MobileTabBar, DemoBanner, etc.
    three/             the 3D scene
    finder/, marketplace/, admin/, auth/
  lib/                 business logic. BACKEND. Treat as read-only.
prisma/schema.prisma   the database. Do not edit.
```

**The frontend/backend line in this codebase is the file name, not the
folder.** `page.tsx` and `actions.ts` sitting next to each other are
different halves of the app. `actions.ts` and everything in `src/lib/`
is Claude's; the JSX and the CSS are yours.

Commands: `npm run dev`, `npm run build`, `npm run typecheck`,
`npm test`. All four pass on `main` as handed over — please keep them
passing.

**Two things about running it on Replit.**

Replit detects Next.js, infers a Vercel project, and offers to port the
app into its own `PNPM_WORKSPACE` stack. **Decline.** That is a framework
migration, not an import: it moves the real application into
`.migration-backup/` and leaves an empty workspace scaffold at the root.
It has already happened twice. There is a `.replit` in the repo telling
Replit how to run the project as it is — npm, Next.js, port 3000 — so it
should not need to guess. After importing, confirm the file tree has
`src/app/`, `prisma/`, `next.config.mjs` and this file. If it instead
shows `pnpm-workspace.yaml` and an `artifacts/` folder, the port ran and
the import needs redoing.

And: **do not run `npm run build` while `npm run dev` is running.** They
share `.next`, the build overwrites the chunks dev is serving, and then
every script 404s — nothing hydrates, and the app looks completely normal
while every button on it is dead. It presents as a baffling UI bug rather
than a build problem. If interactivity stops for no reason: stop dev,
`rm -rf .next`, start dev again.

---

## 2. What is actually wired up

Do not replace any of this with static markup. It all works against a
real database:

- Auth and role-based access (`src/lib/rbac.ts`), five roles
- The services marketplace: post a job → quote → hire → job lifecycle →
  review, with a commission engine
- Technician profiles, an admin-only verification queue
- Messaging and in-app notifications
- The manuals library, with full-text search inside the PDFs
- The door configurator, backed by a live 3D preview
- Admin: catalogue CRUD, marketplace oversight, commission rate, verification

**Not** wired up, on purpose, and each says so on screen: Stripe,
Supabase auth/storage, email, push. See §4.

---

## 3. The design system that already exists

Please extend these rather than introducing a parallel set. Every screen
already uses them, so improving `Button.tsx` improves the whole app.

**Tokens** — `tailwind.config.ts`. There is a rationale comment at the
top; it is worth two minutes.

- Palette: `paper`, `rail`, `line`, `zinc`/`zinc-deep`,
  `graphite`/`graphite-soft`, `signal` (the one accent),
  `caution`, `good`, `bad`
- Type: `micro`, `display`, `display-lg`; `font-sans` (IBM Plex Sans),
  `font-code` (IBM Plex Mono, reserved for identifiers — model codes,
  part numbers, references)
- Radii are deliberately small (3–6px). Nothing is pill-shaped. This is
  an "industrial, not consumer-app" decision, not an oversight.
- `shadow-panel`, `shadow-lift`; `max-w-prose`, `max-w-shell`

**One rule in the tokens is load-bearing:** amber (`caution`) is reserved
exclusively for provenance and not-connected states. If amber becomes a
decorative accent, those warnings stop reading as warnings. Please pick a
different colour for anything decorative.

**Primitives** — `src/components/ui/`: `Button`, `Field` (+ `Input`,
`Textarea`, `Select`), `Panel`, `Badge`, `Table`/`SpecList`,
`EmptyState`, `ErrorState`, `Skeleton`, `RevealCard`, `NotConnected`,
`SourceBadge`.

Genuinely missing, and worth adding: **modal, drawer, tabs, toast**.
Nothing uses them yet because they do not exist.

**Button sizes `md` and `lg` are 44px tall on purpose** — the minimum
touch target. This gets used outdoors, often gloved. Please do not shrink
them for visual balance.

---

## 4. Things that must survive the redesign

These are the ones a UI pass is most likely to "clean up", so here is why
each exists. The product brief is explicit that Doorlink must never make
a button look functional when the functionality does not exist.

**`<NotConnected />` — 51 files use it.** It marks a feature whose
provider is genuinely absent. Please restyle it into something handsome;
please do not remove it, and please do not replace it with a disabled
button and a tooltip. The text is specific on purpose — it names what is
missing.

**`/plans` has no Subscribe button.** Not an oversight. There is no
payment provider, so instead of a button each plan states which of three
reasons applies. A beautiful Subscribe button that cannot subscribe
anyone is the exact failure mode the brief rules out. Same for
upgrade/downgrade/cancel on `/account/subscription` — build the pricing
screen, the comparison, the billing-history *layout*, but leave the
action surfaces honest until Stripe is connected.

**`<SourceBadge />` and the document provenance warning.** Every manual
is labelled with whether it is the manufacturer's own file, a
third-party write-up, or unattributed. On `/manuals/[slug]` that warning
sits directly under the title, above the fold, because a technician
relying on the document should see it first. Please keep it there.

**The verification badge wording.** On a technician's public profile the
badge has two states only — verified or not — and beside it a sentence
saying an admin matched the supplied licence details and that Doorlink is
not a licensing authority. Both are load-bearing: "Documents submitted"
shown publicly reads as almost-verified, and the disclaimer is the
difference between a trust signal and a legal claim.

**"Stated by the technician"** on certifications, and **"No reviews yet"**
rather than a zero or an empty star row. An absent rating is not a bad
rating.

**Contact details are hidden until a job is agreed.** The job board shows
the work and the suburb and never the phone number. Please do not surface
contact info on lead cards to make them feel richer.

**The sign-in screen has no password field.** Authentication is a
dev-only stand-in (`src/lib/dev-session.ts`): a plain cookie, no
passwords, and it refuses to run in production. Supabase auth is the
intended provider and is not connected. Please style `/sign-in` and
`/register` as the real thing, but do not add a password input, a
"forgot password" link, or social buttons — none of them would do
anything, and the screen currently explains what it is.

**The demo banner** (`components/layout/DemoBanner.tsx`) says the build
mixes real manufacturer documents with invented sample data. It must
stay visible while that is true.

**`RevealCard` carries `data-reveal`**, and `app/layout.tsx` has a
`<noscript>` rule forcing those elements visible. Scroll-reveal ships at
`opacity: 0` in the server HTML; without that rule, a reader with
JavaScript off gets blank sections. If you build new scroll animations,
carry the same attribute. It also skips animation entirely under
`prefers-reduced-motion` — please keep that.

---

## 5. The 3D scene

`src/components/three/`:

- `GarageDoorScene.tsx` — the scene. Sky, sun, lighting, DoF, the facade,
  the sectional door, the interior, the camera director.
- `House.tsx`, `Garden.tsx`, `Birds.tsx` — the property around it
- `GarageInterior.tsx` — the room behind the door **and the reveal**
- `DoorHero3D.tsx` — the homepage wrapper (WebGL detection + fallback)
- `ConfiguratorScene.tsx` — the configurator wrapper, same scene

**It is parameterised, not duplicated.** `GarageDoorScene` takes a
`look: DoorLook` (colour, hardware colour, panel count, profile, windows,
roughness, metalness). `src/lib/configurator/look.ts` maps a saved
configuration onto it. A colour added to
`src/lib/configurator/options.ts` appears in the hero and the
configurator without being implemented twice — please preserve that.

**The reveal.** When the door opens, two layers at different depths show
a wordmark and the line *"App developed for automated doors and gates."*
It is drawn **inside** the scene so the door panels genuinely occlude it
and the camera gives it real parallax. The text is painted to a 2D canvas
and used as a texture rather than loaded through drei's `<Text>`, because
troika fetches its typeface from a font CDN at runtime and a hero that
loses its headline to a blocked request is not a hero. Please do not
convert the reveal to an HTML overlay — an overlay cannot be hidden
behind the door, which turns it into the popup the brief rules out.

**The camera director** narrows the allowed azimuth as the door opens
rather than seizing the camera, so someone mid-drag keeps dragging within
a closing arc. It also pulls *back*, not in, so the house stays in frame.

Realism is the clearest remaining gap and the most valuable thing you
could improve: the materials, the lighting, the landscaping and the house
are all built from primitives. Better geometry and better materials here
would lift the whole product. Two constraints: it must keep working at
390px, and `DoorHero3D` must keep its WebGL-absent fallback — some phones
genuinely have no WebGL and a blank canvas is worse than a static panel.

---

## 6. Responsive state as handed over

Every route was checked for horizontal overflow at 390px and is clean.
Please re-check after your pass; the failure mode that bit us twice was a
`shrink-0` element wider than the viewport refusing to wrap.

Mobile already has a bottom tab bar (`MobileTabBar.tsx`, 5 tabs,
role-aware) and a hamburger sheet (`MobileNavToggle.tsx`). The app is an
installable PWA — manifest, icons, offline fallback, install prompt.

Navigation is role-aware in `Header.tsx`: the account menu is assembled
from the session's permissions, so a technician sees Job board / Trade
profile / Earnings and a customer does not. If you restructure the nav,
keep it driven by `can(session.role, …)` rather than hard-coding menus.

---

## 7. Screens that do not exist yet

So you do not design around something that is not there, or assume
something is missing when it is deliberate:

- **Universal search exists** at `/search` (manuals, products, technicians,
  services, parts). Individual areas still have their own search too.
- **Onboarding exists** at `/welcome` (setup checklist after registration).
- **Admin** includes catalogue, marketplace, verification, settings, and
  also **users**, **reports**, **disputes**, **subscriptions**, and
  **metrics** — all wired, plain UI.
- No worker availability UI (the schema exists).
- No message attachments (blocked on storage).
- No user-facing report/safety flow (admin **reports** queue exists).
- No worker reply to a review (the column exists).

`DEVELOPMENT.md` has the full history and the reasoning behind the
decisions. It is long, but the "Status by module" and "Still needs you,
not code" sections at the end are the quick version.

---

## 8. Claude is working in parallel — how we avoid collisions

**Neither side commits to `main`.** Replit works on `replit-ui-improvements`;
Claude Code works on `claude/<feature>`. Both merge back through pull
requests only. See `WORKFLOW.md` for the day-to-day steps.

To keep merges clean, Claude stays **additive in the visual layer**:

- **Claude will not touch** `src/components/ui/`, `tailwind.config.ts`,
  or the markup of screens that already exist. Those are yours for the
  duration.
- **Claude will add** new routes, new `src/lib/` modules, and new server
  actions. New screens are built from the existing primitives, so they
  inherit your improvements to `Button`, `Field`, `Panel` and the rest
  automatically.
- **Shared files we may both edit:** nav lists (`Header.tsx`'s
  `NAV_LINKS`/`accountLinks`, `MobileTabBar.tsx`'s `tabs`,
  `admin/layout.tsx`'s `ADMIN_NAV`); `package.json` and
  `package-lock.json` (union both sides); route `page.tsx` files (you own
  markup inside `return()`, backend owns logic above it); `.replit` (must
  stay npm + Next — see `replit.md`). On nav conflicts, keep **every**
  entry from both sides; they are permission-gated.

If you find a screen that is not in this document, it was added after
your branch was cut. It will be using the primitives correctly but will
not have had your eye on it — worth a pass before you call it done.

---

## 9. What would help most

In rough order of value:

1. **The 3D scene's realism** — materials, lighting, the house, the
   landscaping. The biggest single gap between this and a premium
   product.
2. **The missing primitives** — modal, drawer, tabs, toast. Their absence
   shapes several screens awkwardly.
3. **The admin section** — functional and plain. It has had the least
   design attention of anything in the app.
4. **Dashboard density** — `/account`, `/jobs`, `/leads` and `/earnings`
   are honest but flat. They would benefit most from hierarchy.
5. **Empty and loading states** — they exist and are consistent, but they
   are the plainest thing in the product.

If you change a shared primitive or a token, please say so in
`REPLIT_UI_HANDOFF.md` — those ripple across every screen, and that is
the change most worth flagging on the way back.
