# DoorLink — development log

Everything for your door, in one place.

---

## Session 1

### Module 0 — Project audit

**Finding: there is no existing codebase.** The workspace contained only the brief.
No package.json, no prior framework, no database, no assets, no technical debt.
So there is nothing to refactor around and no working code to protect — DoorLink
starts greenfield, which removes the "broken hybrid architecture" risk in §9 of the brief.

**Environment constraint, stated plainly:** this session ran inside a sandbox with
**no network access**, so `npm install` could not run. That means the code below is
written but **not compiled, not type-checked and not executed**. Treat every file as
reviewed-by-eye, not verified. First action on a connected machine:

```bash
npm install && npx prisma generate && npm run typecheck
```

Expect a small number of import and Prisma-type fixes on that first pass. Nothing in
the architecture depends on them.

### Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Matches the brief; server components keep authorisation on the server |
| Data | PostgreSQL via Prisma | Relational from the start — the compatibility engine is a join table, not JSON blobs |
| Auth | Provider-agnostic `getSession()` behind one interface | Supabase drops in without touching call sites; dev cookie works today and refuses to run in production |
| Money | Integer minor units everywhere | No float drift in a marketplace |
| Provenance | `DataSource` enum on every catalogue record | Brief rules 28 and 35 enforced in the schema, not by convention |
| Integrations | Central registry in `src/lib/integrations.ts` | One place decides whether a feature is live; UI renders an honest "not connected" state otherwise |
| Styling | Tailwind with a fixed token set | No arbitrary hex values in components |

### Module 1 — Design system

Palette drawn from the subject matter: spec-sheet white, powder-coat charcoal,
galvanised zinc greys, one signal blue for every interactive affordance, and amber
reserved **exclusively** for provenance and not-connected warnings so a caution can
never read as decoration. Type is IBM Plex Sans throughout, with IBM Plex Mono
restricted to identifiers — model codes, part numbers, order references — because
those are the data a technician reads off a plate. Radius is 3px: industrial, not
consumer-app.

Built: `Button`, `Panel`/`PanelHeader`/`PanelBody`, `Badge`, `SourceBadge`,
`Input`/`Select`/`Textarea`/`Field`, `Table`/`Th`/`Td`/`SpecList`,
`EmptyState`, `ErrorState`, `Skeleton`, `NotConnected`.

Quality floor built in, not announced: 44px minimum touch targets on `md`/`lg`
buttons (technicians use this outdoors, often gloved), visible keyboard focus on
every interactive element, `prefers-reduced-motion` respected globally, skip link
in the root layout.

### Module 2 — Public website (partial)

Done: root layout with metadata template and font loading, header with real mobile
navigation, footer, homepage, `/find`, `/find/unknown`, `/data-sources`, 404.

The homepage leads with the **working finder** rather than a hero image, because the
finder is the product. Demo-mode banner sits above everything.

### Module 4 — Database architecture (complete)

`prisma/schema.prisma` — 30 models covering identity and organisations, the
catalogue tree, documents, compatibility, marketplace, orders, leads, jobs, support,
notifications, audit log, staged imports and platform settings. Notable choices:

- `Compatibility` is a first-class model with `kind` and `confidence`, queried in
  both directions. It is never hardcoded in a component.
- `Document.supersedesId` forms a revision chain, so an old installation keeps its
  correct manual instead of being shown the current one.
- `OrderItem` carries `orgId` and its own status, so a multi-vendor basket fulfils
  per seller.
- `ImportJob` stages and validates rows; nothing reaches the catalogue until `APPLIED`.

### Module 6 — Product finder (partial)

`/api/finder` drives all five steps from one endpoint. Each step only offers
options that actually exist downstream — the category step, for example, lists only
categories the chosen brand has products in, so the cascade can never dead-end.
Breadcrumbs are clickable to step back. "I don't know my model" is built.

### Module 28 — Seed data

Three **invented** manufacturers (Northgate, Veltrix, Harbrook). No real brand,
model, manual or price appears anywhere in the seed. Fabricating those would be
worse than an empty catalogue, because a technician could act on it. Every seeded
row is `DataSource.DEMO` and renders a caution badge.

---

## Session 2

**Correction to Session 1's account of itself.** Session 1's own audit said the
workspace held only the brief and that the code below "is written but not
compiled, not type-checked and not executed." That was optimistic in one
respect: `prisma/schema.prisma` and the entire `src/` tree it describes were
never actually committed. Only the config and meta files reached the repo
(`package.json`, `next.config.mjs`, `tailwind.config.ts`, `DEVELOPMENT.md`,
`README.md`, `.env.example`, `.gitignore`, `tsconfig.json`, `postcss.config.mjs`).
`npx prisma generate` failed outright — there was no schema file to find — and
`npm run typecheck` "passed" only because there was no source for `tsc` to check.

Everything under `prisma/` and `src/` on this branch as of this session is a
**good-faith reconstruction from DEVELOPMENT.md and README.md's own
descriptions**, written this session — not a recovery of whatever the original
Session 1 code actually contained. The architecture decisions, module scope,
and status table above were treated as the spec. Model names, field names,
route shapes, and component boundaries in the current code are this session's
implementation choices, not the original ones. If the real Session 1 files
turn up later, expect real differences, not just cosmetic ones.

### What this session actually verified, and how

1. **Postgres + schema + seed.** Provisioned a local PostgreSQL 16 instance,
   pointed `DATABASE_URL`/`DIRECT_URL` at it, and ran `npx prisma db push`.
   All 30 models created their tables cleanly with no migration errors. Ran
   `npm run db:seed`; it completed and produced the expected row counts (5
   users, 3 manufacturers, 4 categories, 5 models, 9 specs, 5 documents, 2
   compatibility rows, 1 listing), checked directly with `psql`. Nothing
   broke in this step.
2. **Finder cascade, in an actual browser.** Ran `npm run dev` and drove the
   five-step cascade with a real Chromium instance (Playwright), not just
   `curl`: category → manufacturer → productLine → model → confirm. Confirmed
   at each step that only options with a downstream match are offered — e.g.
   choosing "Garage Door Openers" offers only Northgate as a manufacturer;
   choosing "Smart Locks" offers only Harbrook. Also exercised the edge case
   where a manufacturer has models in a category but no product line for it
   (Northgate's remote): the product-line step correctly shows an empty state
   with a working "skip" path through to the model step instead of a dead
   end. Breadcrumb back-navigation correctly clears everything selected after
   the target step. One unrelated issue surfaced in the browser console: a
   404 for `/favicon.ico` — there is no favicon in the project. Cosmetic, not
   fixed yet.
3. **No-database behavior — a real gap, not fixed.** Unset `DATABASE_URL`/
   `DIRECT_URL` and restarted the dev server. The site does **not** crash —
   the shell, header, footer, and every page other than the finder's live
   data still render — but this does not match what the README promises
   ("the finder shows an honest 'catalogue not connected' state rather than
   fake products"). What actually happens: `/api/finder` throws an uncaught
   `PrismaClientInitializationError` and returns a bare 500, and the finder
   panel falls back to the generic `<ErrorState>` ("Something went wrong /
   Could not load options. Try again.") — the same message a real transient
   failure would produce. There is no code today that checks
   `isConnected('catalogue')` (no such check exists in
   `src/lib/integrations.ts`) or renders `<NotConnected />` for the finder.
   This is left as a known, reported gap rather than patched in the same pass
   that was supposed to be verification, not repair.

### Dependency bumps considered this session

- **`vitest` 2.x → 5.x**: taken. Self-contained — no test files exist yet to
  migrate, and no other package in this project depends on the vitest 2 API
  surface. Resolves the one `critical` npm audit advisory.
- **`next` 15 → 16**: not taken this session. It removes `next lint`, which
  would require rewriting the `lint` script to call `eslint` directly and
  adding an ESLint config and dependency that don't exist in this project
  yet — a larger, unrelated change bundled into what should be a small
  version bump. Left as a deliberate follow-up rather than done quietly
  alongside the vitest bump.

### Module 6 (continued) — model profile page

Built `/model/[id]` — specs, documents, compatible parts (both directions of
the `Compatibility` join, with a confidence badge), and active listings.
Linked to it from the finder's confirm step ("View full product page").
Verified in a browser against the seeded data, not just typechecked:

- DR-700's page shows its three specs, its two documents behind a
  `<NotConnected>` panel (storage isn't configured, so titles are listed but
  nothing is downloadable), its `REMOTE_PAIR` link to RC-2, and correctly
  shows no listings (none were seeded for it).
- RC-2's page shows both of its compatibility links (`CONFIRMED` to DR-700,
  `LIKELY` to DR-900) and its one seeded listing from Demo Door Supplies.
- An unknown id renders the real `not-found.tsx` page with a `404` status,
  not a crash.
- If the catalogue database itself is unreachable, the page catches the
  Prisma error and renders `<NotConnected feature="The product catalogue" />`
  instead of a 500 — this page does check, unlike `/api/finder` (see the
  no-database finding above, which was left as-is rather than fixed here).

### Follow-up — `/api/finder`'s no-database gap (finding 3, above) is fixed

Added `src/lib/db-errors.ts`: `isDatabaseUnreachable(error)` recognizes
`Prisma.PrismaClientInitializationError` and the connection-shaped
`PrismaClientKnownRequestError` codes (P1000–P1017 family — auth failure,
can't reach server, timeout, TLS error, etc.), as opposed to a bug in a
query. `/api/finder`'s handler now wraps its database calls in `try/catch`
and returns `503 { error: 'catalogue_not_connected', message }` when
`isDatabaseUnreachable` is true, instead of letting the error escape as a
bare 500. `FinderCascade` checks for a `503` response and renders
`<NotConnected feature="The product catalogue" />` in place of the
options list or the confirm panel, instead of the generic `<ErrorState>`
it used to fall back to. The model page's own catch was tightened to use
the same helper too, so a real query bug there gets rethrown to Next's
error handling instead of being silently relabelled "not connected."

Verified two different unreachable-database scenarios, not just the
missing-env-var case from finding 3:

- **`DATABASE_URL` unset** (finding 3's original case): still 503 /
  `<NotConnected>`, not the old bare 500.
- **`DATABASE_URL` set but Postgres stopped** (`service postgresql stop`,
  a closer match to a real outage than a missing env var): `curl` against
  `/api/finder?step=category` returned the same 503 payload; a real
  Chromium browser showed `<NotConnected>` on both the homepage finder and
  `/model/[id]`. Restarted Postgres and re-ran the full five-step cascade
  in the browser afterward to confirm the fix doesn't regress the working
  case — all four categories, correct manufacturer/product-line/model
  narrowing, and the confirm panel all still work exactly as in finding 2.

---

## Session 3 — Module 3, sign-in and registration

Built the two screens Module 3 was missing, against the existing
`getSession()` interface rather than adding a new one.

**Dev-only mechanism, kept out of the provider interface.** `src/lib/
dev-session.ts` (`'use server'`) holds three Server Actions —
`devSignInAction`, `devRegisterAction`, `devSignOutAction` — that read and
write the same `doorlink-dev-session` cookie `DevCookieSessionProvider`
already read (constant factored out to `src/lib/session-cookie.ts` so both
sides import it instead of duplicating the string). These actions are
deliberately *not* part of the `SessionProvider` interface in `auth.ts`:
when Supabase gets wired in, this whole file is replaced, not extended.
Both actions refuse outright in production, same as the provider already
did — checked with `process.env.NODE_ENV !== 'production'` in the page
components too, so production renders `<NotConnected feature="Sign-in" />`
instead of a form that can't do anything.

**Registration doesn't touch the catalogue.** Registering as a supplier
creates an `Organization` + `SupplierProfile` (`verified: false`, same as
the seed). Registering as a manufacturer creates only an `Organization` —
deliberately *not* a `Manufacturer` catalogue row. Linking a manufacturer's
account to a verified `Manufacturer` entity is left for an admin to do
(Module 5, still outstanding); letting a signup form create that link
itself would let anyone inject an unverified catalogue entry, which is
exactly what the `DataSource` provenance system exists to prevent.

**A robustness fix this forced:** `Header` now calls `getSession()` on
every single page (it needs to know whether to show "Sign in" or a name +
sign-out button), so a database error inside `getSession()` would have
taken down every page on the site, not just the finder. Tightened
`DevCookieSessionProvider.getSession()` to catch a database-unreachable
error (via the same `isDatabaseUnreachable` helper) and return `null`
instead of throwing — failing to "signed out" rather than crashing.

### What was verified, in a real browser and against the database directly

- Signed in via a demo-account quick-select button on `/sign-in`; header
  updated from "Sign in" to the account's name + "Sign out". Clicked
  "Sign out"; header reverted. (The first pass of this test used
  `page.waitForURL()` after already being on that URL, which no-ops — the
  server log showed the sign-out `POST` correctly getting a `303`, so the
  first "sign-out didn't work" reading was a test bug, not an app one;
  re-tested waiting on the actual header content and confirmed it works.)
- Signing in with an email that doesn't exist shows "No account found with
  that email." inline and stays on `/sign-in` (`POST /sign-in` returned
  `200`, not a redirect) — confirmed via the rendered DOM, since Next's own
  built-in route announcer also uses `role="alert"`, which the first
  Playwright selector matched ambiguously before this was narrowed down.
- Registered one account of each of the four self-registrable roles
  (`CUSTOMER`, `TECHNICIAN`, `SUPPLIER`, `MANUFACTURER`) and checked the
  result directly with `psql`, not just the UI: the `TechnicianProfile` row
  exists for the technician; `Organization` + `OrganizationMember(OWNER)`
  exist for both the supplier and manufacturer; `SupplierProfile` exists
  only for the supplier's organization; and — the specific thing worth
  checking — the `Manufacturer` catalogue table has zero rows matching the
  test manufacturer's name after registering it.
- Registering a second account with an email already in use stays on
  `/register` instead of creating a duplicate `User` row.
- Signed in, then stopped Postgres mid-session with the session cookie
  still set: `GET /` and `GET /find` both still returned `200` (header
  fell back to "Sign in" rather than the page crashing), and
  `/api/finder` still returned its `503` from the Session 2 fix. No
  unhandled exceptions in the server log. Restarted Postgres afterward.

---

## Session 4 — Module 5, admin catalogue CRUD (partial, by design)

Scoped this to a real, fully-verified vertical slice rather than thin CRUD
across every catalogue entity: **Manufacturers and Categories** are done.
Models, Documents, and Compatibility admin screens are not — the `/admin`
dashboard says so plainly (`Admin screen not built yet.` on those three
stat tiles) rather than linking to something that doesn't exist.

**Every mutation re-checks permission itself.** `/admin`'s layout gates on
`can(session.role, 'catalogue:write')` and redirects, but Server Actions
are directly callable regardless of which page rendered them — so
`createManufacturerAction`, `updateManufacturerAction`,
`deleteManufacturerAction`, and their category equivalents each call
`requirePermission()` again before touching the database. The layout gate
is for navigation; the actions are the actual boundary.

**Delete is blocked when a row is in use, with a real reason shown.**
Deleting a manufacturer that still has models, or a category that still
has models or subcategories, catches Prisma's `P2003` (foreign key
violation) and returns a specific error inline — "Cannot delete: this
manufacturer still has product lines or models linked to it" — rather than
either crashing or silently failing.

**A real bug this surfaced, not just a design choice:** the first pass at
verifying category deletion found that deleting a parent category with a
child did *not* get blocked — it succeeded silently and orphaned the child
into a top-level category. Root cause: `parentId` is an optional field, and
Prisma's default `onDelete` for an *optional* relation is `SetNull`, unlike
the `Restrict` default for the required relations (`Model.categoryId`, for
instance) everywhere else in the schema. Fixed by adding an explicit
`onDelete: Restrict` to `Category.parent` in `schema.prisma`, then
`prisma db push` to apply it — confirmed the new constraint's delete action
directly with `psql` (`SELECT confdeltype FROM pg_constraint ...` now
reads `r`, not the `SetNull` default), not just by re-testing the UI.

**Registration's earlier catalogue safeguard (Session 3) still holds
here too** — nothing in these admin screens lets a `MANUFACTURER`-role
user's own organization write directly into the `Manufacturer` catalogue
table; that link stays admin-only and manual, on purpose.

### What was verified, in a real browser and against the database directly

- RBAC gating on `/admin`: signed out → redirected to `/sign-in`; signed in
  as `customer@demo.doorlink` → redirected to `/`, no "Admin" link shown in
  the header; signed in as `admin@demo.doorlink` → "Admin" link appears,
  dashboard loads with counts matching `psql` directly (3 manufacturers, 4
  categories, 5 models, 5 documents, 2 compatibility links).
- Manufacturer CRUD: created one, confirmed it in the list; edited its name,
  confirmed the change; attempted to delete Northgate (has product lines
  and models) and got the in-use error with the row count unchanged;
  deleted the unused test manufacturer and confirmed it was gone.
- Category CRUD, including the bug above: created a parent and a child
  with the parent selected via the dropdown, confirmed the child's row
  shows the parent's name; attempted to delete the parent while the child
  still pointed at it (this is what caught the `SetNull` bug); after the
  schema fix, re-ran the same sequence and got the correct in-use error
  instead, then deleted the child and confirmed the parent could then be
  deleted successfully; separately confirmed deleting Smart Locks (has a
  seeded model) is blocked the same way.
- Test debris cleanup: the crashed first attempt at the category test left
  two orphaned rows in the database from before the selector bug was
  fixed — found and removed directly with `psql`, then confirmed row
  counts were back to the original 3/4/5 baseline.

### Module 5 (continued) — Model admin CRUD

Added `/admin/models`: list, create, edit, delete. Manufacturer and
category are required selects; product line is optional and the form
filters its options client-side to only the chosen manufacturer's lines
(a plain UX convenience — the action re-validates the pairing
server-side regardless, since the client-side filter is trivially
bypassable). Slug auto-generates as `{manufacturer-slug}-{name}` when
left blank, mirroring the seed's own naming convention. Model deletion
relies on the schema's existing cascade behavior rather than needing a
new fix: `ModelSpec`, `Document`, `Compatibility`, and `Favorite` all
cascade-delete with their model (they're meaningless without it); `Job`
and `Lead` null out their optional reference; `Listing` is a required
relation with no cascade specified, so it defaults to `Restrict` —
deleting a model that's still listed for sale is blocked, same pattern
as manufacturers and categories.

Verified in a real browser and against the database: created a model
under Northgate / Garage Door Openers / Drive Series and confirmed it
appeared correctly attributed in the list; attempted a second model
with a model code already used by the same manufacturer and confirmed
it was rejected without creating a row (`POST .../new` returned `200`,
not a redirect — checked in the server log, since the rendered error
text was once again obscured by the same Next.js route-announcer
`role="alert"` collision noted in Session 3, not an app bug); edited
the model's name and confirmed the change; deleted it and confirmed
removal; then attempted to delete RC-2 (has a seeded active listing)
and got the same in-use error pattern as manufacturers/categories.
Model count was back at the 5-row baseline afterward, confirming no
test debris was left behind this time.

### Module 8 (continued) — Compatibility link admin CRUD

Added `/admin/compatibility`: list, create, edit, delete. Unlike
manufacturers, categories, and models, this is a leaf table — nothing
references a `Compatibility` row, so delete needed no in-use check at
all; the action comment says so explicitly rather than leaving the
absence of that check looking like an oversight. Two validations that
do matter here: a model can't be linked to itself (`fromModelId !==
toModelId`, checked with a Zod `.refine()`), and the same
`(fromModelId, toModelId, kind)` triple can't be created twice, since
that's the schema's own unique constraint — checked explicitly first so
the error names the actual problem instead of surfacing a raw
constraint-violation message.

Verified in a real browser and against the database: created a
cross-manufacturer link (Veltrix's RS-40 → Harbrook's SL-200, kind
Accessory) and confirmed it rendered correctly in the list; attempting
the identical triple again was rejected (confirmed via the server log's
`200` non-redirect response, same verification style as the Model
duplicate-code case); attempting a self-link (same model both sides)
was rejected the same way; edited the link's confidence from Likely to
Confirmed and confirmed the change; deleted it and confirmed removal.
Row count was back at the 2-link baseline afterward.

That's four of the five catalogue entities with working admin CRUD —
Documents is the one left, and it stays blocked on Supabase storage
being connected (see "Still needs you, not code").

## Session 5 — Modules 13–15, marketplace listing and product pages

Built both halves: a public browse page (`/marketplace`, showing only
`ACTIVE` listings) and supplier-side listing management
(`/supplier/listings` — list, create, edit, delete), scoped to the
signed-in supplier's own organization.

**The provenance boundary from Session 3 extends here too.** A supplier
creating their own listing cannot choose its `DataSource` — it's hardcoded
to `COMMUNITY_SUBMITTED` in the action, never exposed as a form field.
Letting a supplier mark their own listing `ADMIN_VERIFIED` or
`MANUFACTURER_VERIFIED` would be self-attested verification, which is
exactly what the whole `DataSource` system exists to prevent. This is the
same shape of decision as "registering as a manufacturer doesn't create a
`Manufacturer` catalogue row" — a different entity, the same principle.

**Two layers of ownership enforcement, not one.** `/supplier`'s layout
gates on `can(session.role, 'listing:write:own') && session.organizationId`
and redirects otherwise — but as with `/admin`, Server Actions are
directly callable regardless of which page rendered them, so
`createListingAction`, `updateListingAction`, and `deleteListingAction`
each re-check both the permission and the organization requirement via
`assertCanManageOwnListings()`, and update/delete additionally verify the
target listing's `organizationId` actually matches the caller's before
touching it. The edit *page* does the same ownership check before ever
rendering the form (not just the action) — a supplier can't view another
supplier's listing pre-filled into an edit form even read-only, and a
mismatch renders the real `not-found.tsx`, not a distinguishable
"forbidden" response, so probing listing ids can't be used to enumerate
which ones exist.

### What was verified, in a real browser and against the database directly

- Public `/marketplace` shows the seeded RC-2 listing (Demo Door Supplies,
  $45.00) with no sign-in required.
- Signed in as `supplier@demo.doorlink`: header shows "My listings" and
  not "Admin" (confirming the nav computation is permission-specific, not
  a blanket "any signed-in user" check); `/supplier/listings` shows their
  own seeded listing.
- Created a listing for Northgate's DR-700, status Active: appeared in
  both the supplier's own list and the public marketplace immediately.
  Edited it to Paused: disappeared from the public marketplace but stayed
  visible in the supplier's own list (status filtering, not deletion).
  Deleted it: gone from both.
- Signed in as `customer@demo.doorlink` and confirmed `/supplier/listings`
  redirects to `/` (customers don't have `listing:write:own`).
- Registered a **second, brand-new** supplier account through `/register`
  and confirmed it starts with zero listings, then tried to load the
  *first* supplier's seeded listing's edit URL directly
  (`/supplier/listings/demo-listing-rc-2/edit`) while signed in as the
  second supplier — got a real `404`, not the listing's data and not a
  permission page. This is the actual cross-tenant boundary test, not
  just a same-account round trip.
- Listing count was back at the 1-row baseline afterward.

## Session 6 — cart

Added add/remove/view for the cart: an "Add to cart" button on both
`/marketplace` and the model page's listings section (shown only when
signed in — signed out sees a plain "Sign in to buy" link instead of a
form that would just reject them), `/cart` itself with per-item quantity
controls and removal, and a running total. A cart is created lazily on
first add (`prisma.cart.upsert`) rather than at signup — most users will
never need one.

**Checkout is checked, not built — same pattern as documents and
finder.** `/cart` renders a real "Checkout" button only when
`isConnected('payments')`, and `<NotConnected feature="Checkout" />`
otherwise, which is what actually renders today since Stripe isn't
configured. The cart itself (add, view, adjust quantity, remove) is fully
functional independent of that — it doesn't need Stripe to be useful, only
to complete a purchase.

**Ownership check exists, but wasn't exploit-tested live like the
supplier-listing one was — worth being explicit about the difference.**
`updateCartItemAction` and `removeCartItemAction` both verify
`item.cart.userId === session.userId` before touching a row, the same
shape of check used for supplier listings. What's different: supplier
listings have a guessable, addressable `/supplier/listings/[id]/edit` URL,
which is what made a real cross-tenant test possible (register a second
account, hit the first account's URL directly). Cart items have no
equivalent addressable-by-id route — the only way to act on one is through
a hidden form field the server itself populates from the caller's own
cart query, and `id`s are opaque `cuid`s, not sequential. So there's no
realistic UI path to even attempt what the supplier-listing test did.
The ownership check is there and correct by inspection, but that's a
weaker form of verification than actually running the attack, and this
entry says so rather than implying the same rigor was applied both times.

### What was verified, in a real browser and against the database directly

- Signed out, `/marketplace` shows "Sign in to buy" instead of a cart
  form. Signed in as `customer@demo.doorlink`, added RC-2 to the cart from
  the marketplace grid; header updated to "Cart (1)". Added the same
  listing again — header stayed at "Cart (1)" (one distinct line item,
  quantity incremented), confirmed by `/cart` showing quantity 2 and a
  $90.00 total ($45 × 2, matching the seeded listing's price).
  Updated the quantity to 5 and confirmed the total became $225.00.
  Removed the item and confirmed the cart returned to its empty state and
  the header's badge disappeared.
- `CartItem` count was back at 0 afterward (the `Cart` row itself persists
  empty, same as a real user's cart would).

## Session 7 — marketplace search and filtering

`/marketplace` now has a keyword search plus category, manufacturer, and
condition filters. Built as a plain server-rendered `<form method="GET">`
— no client-side JavaScript needed, filters are just URL search params
(`?q=...&categoryId=...&manufacturerId=...&condition=...`), and the page
re-renders server-side against them. Keyword search matches the listing
title, the model's name, or its model code (case-insensitive), combined
with the other filters as AND conditions via an explicit
`Prisma.ListingWhereInput[]` array rather than trying to merge nested
`model: {...}` filter objects by hand, which gets error-prone once more
than one nested condition needs to apply at once.

Two different empty states, not one generic one: "No active listings yet"
when the catalogue genuinely has nothing for sale, versus "No listings
match your filters" with a "Clear filters" link when the problem is the
search, not the data. Conflating those would tell a user their search
term doesn't exist in a marketplace that actually just has zero listings
overall, or vice versa.

### What was verified, in a real browser and against the database directly

Temporarily created two extra listings via the supplier UI (a Northgate
DR-700 opener marked Refurbished, a Harbrook SL-200 lock marked New) to
have enough spread across models, manufacturers, and conditions to
actually test filtering against — one listing can't exercise a filter.
Checked, against three live listings:

- No filter: all three. Keyword search for the DR-700 listing's own
  model code returned only that one.
- Category filter (Garage Door Openers) returned only the DR-700 listing,
  not the Remotes & Accessories or Smart Locks ones.
- Manufacturer filter (Northgate) returned both Northgate listings (RC-2
  and DR-700), excluding the Harbrook one.
- Condition filter (Refurbished) returned only the one listing set to
  that condition.
- Combined filter (Northgate + New) returned only RC-2 — the Northgate
  DR-700 test listing was Refurbished, so it correctly dropped out.
- A search term matching nothing showed "No listings match your filters"
  with a working "Clear filters" link, not the "no active listings"
  message — and clicking it returned to the full unfiltered list.

Deleted both temporary listings afterward and confirmed the listing count
was back at the 1-row baseline via `psql` directly, not just the UI.

## Session 8 — pivot to a peer-to-peer marketplace

The user corrected the marketplace's whole shape: DoorLink is meant to be
Facebook-Marketplace-like — anyone meets up and buys directly off anyone
else — not a storefront where only businesses registered as a "Supplier"
can sell. Two decisions came out of a direct question rather than a
guess: **anyone signed in can list an item** (not gated behind a business
registration), and **a buyer connects with a seller by seeing their
contact email on request**, not through in-app messaging or a formal
order/payment flow.

**Schema change:** `Listing.organizationId` went from required to
optional, and a new optional `Listing.sellerId` (→ `User`) was added — a
listing is sold by exactly one of an organization (the existing business
path) or an individual (the new peer-to-peer path), enforced in the
create/update actions rather than at the schema level (Prisma has no
native "exactly one of two nullable columns" constraint). Pushed with
`prisma db push`; the existing seeded listing, which sets
`organizationId`, needed no changes.

**RBAC:** `listing:write:own` moved from `SUPPLIER`-only to every role.
The comment in `rbac.ts` says why: this is a capability of having an
account at all, not something a role gates.

**Renamed `/supplier/listings` → `/my-listings`** (`git mv`, not a
delete-and-recreate, so history follows the files) since the old name
actively misdescribed what it now does. The ownership logic changed from
"does this listing's `organizationId` match mine" to "does it match
_either_ my `organizationId` (if I have one) _or_ my `userId` as
`sellerId`" — a `sellerAssignment()`/`ownsListing()` pair in `actions.ts`
that both the layout guard, the actions, and the edit page's own
independent ownership check now share the same logic for. A user who
happens to have a supplier organization (e.g. `supplier@demo.doorlink`)
keeps listing through their org exactly as before; everyone else lists
personally, automatically — no seller-type toggle in the form, it falls
out of who's signed in.

**Contact reveal, not messaging:** `src/lib/listing-contact.ts` holds one
Server Action, `revealListingContactAction`, called directly from a
client component's `onClick` (not wrapped in a `<form>`, since it just
takes a listing id) rather than embedded in the page's initial HTML —
so a signed-out visitor or a scraper can't harvest emails just by loading
the marketplace; the email is only ever sent to the client after a
signed-in click. For a personal listing it resolves to the seller's own
email; for a business listing, no schema field held a contact email at
all, so it resolves to the organization's `OWNER` member's email instead
(one extra query, acceptable) — the button and its label
("I'm interested") work identically either way; the caller doesn't need
to know or care which kind of seller they're contacting.

**Everywhere a listing's seller was displayed as `listing.organization.name`
directly needed updating** now that it's optional — three sites
(`/marketplace`, `/model/[id]`, `/cart`) all switched to
`listing.organization?.name ?? listing.seller?.name ?? 'a DoorLink member'`
rather than crashing on a listing with no organization.

### What was verified, in a real browser and against the database directly

- The old `/supplier/listings` URL now correctly `404`s (route removed,
  not just hidden).
- `supplier@demo.doorlink`'s existing seeded listing still shows up
  correctly at the new `/my-listings` URL — the business path wasn't
  broken by the change.
- Signed in as `customer@demo.doorlink` — an account with **no**
  organization — created a listing through `/my-listings/new`: it
  appeared in their own list, and on the public `/marketplace` it showed
  "Sold by Demo Customer" (their own name, not an organization).
- Signed in as a **different** account (`technician@demo.doorlink`),
  found that same listing on the marketplace, clicked "I'm interested",
  and the customer's actual seeded email (`customer@demo.doorlink`)
  appeared inline — the real cross-account contact-reveal flow, not a
  same-account round trip.
- Signed out, confirmed there is no "I'm interested" button rendered at
  all (only "Sign in to buy") — contact info has no signed-out code path
  to leak through.
- Deleted the test listing afterward and confirmed the listing count was
  back at the 1-row baseline via `psql` directly.

## Session 9 — Modules 16–18, support tickets

Built the support ticket system: `/support` (a user's own tickets + "New
ticket"), `/support/new`, `/support/[id]` (message thread + reply), and
`/support/queue` (every ticket, admin-only). No RBAC changes needed —
`support:read:own` (every role) and `support:write:any` (`ADMIN` only)
already existed in the matrix from the original schema/RBAC pass and
mapped onto this cleanly.

**Ownership pattern reused, not reinvented, a fourth time now.** Same
shape as `/my-listings` and the cart: the thread page checks
`ticket.userId === session.userId || can(session.role, 'support:write:any')`
before rendering anything, a mismatch renders the real `not-found.tsx`
(not a distinguishable "forbidden"), and the mutating actions
(`addMessageAction`, `updateTicketAction`) re-check independently of
whatever page rendered the form — `updateTicketAction` specifically
requires `support:write:any`, so a ticket's owner can reply but not
change its own status or priority (that's triage, an agent's call).

**A small owner-reopens-on-reply behavior**, not asked for but consistent
with how support tools normally work: if the ticket owner replies to a
ticket that isn't already `OPEN`, it flips back to `OPEN` automatically
(an agent replying doesn't trigger this — only the requester coming back
with something new should reopen it).

### What was verified, in a real browser and against the database directly

- Signed in as `customer@demo.doorlink`, created a ticket; got redirected
  to its thread showing the subject and first message; confirmed the
  ticket owner does not see the admin status/priority controls at all.
- Confirmed the ticket appears in "Your tickets" and that a non-admin sees
  no "All tickets (admin)" link.
- Signed in as `admin@demo.doorlink`: the same "All tickets (admin)" link
  now appears, `/support/queue` lists the customer's ticket with their
  name, replying from the admin side appends to the same thread, and
  changing status to Pending and priority to High persisted correctly.
- Signed in as a **third, unrelated** account (`technician@demo.doorlink`,
  neither the ticket's owner nor an admin) and hit the ticket's URL
  directly — got a real `404`, not the ticket's content. The same account
  hitting `/support/queue` directly was redirected to `/support`, not shown
  an empty or partial queue.
- Deleted the two test tickets created during verification directly via
  `psql`, which cascade-deleted their messages too (confirmed both tables
  back at 0 rows) — the schema's own `onDelete: Cascade` on
  `SupportMessage.ticket`, not application code, did that.

## Session 10 — Module 19, SEO

Added the two Next.js App Router special files: `src/app/sitemap.ts`
(static public routes plus every model page, generated from the
database — degrades to just the static routes if the database is
unreachable, rather than a 500) and `src/app/robots.ts` (disallows
`/admin`, `/my-listings`, `/cart`, `/support`, `/sign-in`, `/register` —
none of them are useful to a crawler without a session, and `/admin`
doubly shouldn't be discoverable). Added a sitewide `WebSite` JSON-LD
block in the root layout, a `Product` JSON-LD block on `/model/[id]`
(name, sku, brand, category, description, and `offers` when active
listings exist — a structured mirror of what the page already shows
visibly, nothing asserted to a crawler beyond what a person looking at
the page can already see), and `description` + `alternates.canonical`
on the model page and every static public page. The marketplace page's
canonical points at the bare `/marketplace` path regardless of which
filters are in the URL, so search engines don't treat every filter
combination as separate duplicate content.

**A real XSS gap found and fixed while building this, not a
hypothetical.** `JSON.stringify()` piped straight into
`dangerouslySetInnerHTML` is unsafe the moment a string field can
contain a literal `</script>` — the browser's HTML parser closes the
script tag early and renders whatever follows as markup. `Model.summary`
is admin/manufacturer-editable content (`/admin/models`), not something
this codebase fully controls, so this wasn't a remote edge case. Added
`src/lib/json-ld.ts` (`toJsonLd()`), which escapes every `<` to `<`
before the JSON hits the page — defusing `</script>` and a stray
`<script>` the same way — and used it in both the layout's `WebSite`
block and the model page's `Product` block instead of raw
`JSON.stringify`.

### What was verified, in a real browser and against the database directly

- `curl`'d `/sitemap.xml` and `/robots.txt` directly: the sitemap listed
  all 5 static routes plus all 5 seeded models with correct
  `lastmod` timestamps; robots.txt disallowed exactly the six private
  paths and pointed at the sitemap.
- Checked the rendered HTML of the homepage and a model page for the
  actual `<link rel="canonical">` and `<meta name="description">` tags,
  and extracted both JSON-LD `<script>` blocks with a real HTML parse
  (not just a substring check) to confirm they're well-formed — RC-2's
  page correctly included an `offers` entry matching its seeded $45.00
  listing; DR-700's (no listings) correctly omitted `offers` entirely
  rather than emitting an empty array.
- **Proved the XSS fix, didn't just reason about it:** used `psql` to set
  a real model's `summary` to `Injected payload </script><script>alert(1)
  </script> end.`, fetched the rendered page, and confirmed the payload
  came through as `</script><script>alert(1)</script>`
  inside the JSON string — not as literal HTML — and that the raw
  unescaped string does not appear anywhere in the response. Reverted the
  test data immediately after and confirmed the original summary was
  restored.

## Session 11 — Leads reimagined as "request a technician", and `/account`

Picked defaults for the two roadmap items left waiting on product
decisions (items 15–16 above) rather than leaving them blocked, per the
user's steer to build the remaining UI to a professional standard using
my own judgement.

**Leads, redesigned for the peer-to-peer marketplace instead of ported
from the pre-pivot schema.** The old idea — a lead assigned to a supplier
organization for follow-up — assumed the storefront model Session 8
replaced. What fits the current shape of the app is a public, no-signup
"Request a technician" form (`/request-technician`): name, email, phone
(optional), an optional model picker, and a message. Submitting one never
requires an account, matching the low-friction, contact-by-email pattern
`/my-listings`'s "I'm interested" already established for the
marketplace. A technician (or admin) sees it queued at `/leads`, split
into "Open requests" (unclaimed, contact hidden) and "Your requests"
(claimed by this technician or their organization, contact shown, status
editable); admins additionally see everyone else's claimed requests
under "Claimed by others". Claiming is first-come: responding to an
open request assigns it to the caller and reveals contact details in the
same action; a second technician hitting the same open request after
someone else claimed it is turned away with "Someone else already
claimed this request" rather than silently reassigning it.

**Schema change:** added `Lead.assignedUserId`/`assignedUser`, mirroring
`Listing.organizationId`/`sellerId` — a claim belongs to either a
technician's organization or a technician personally, the same duality
`Listing` already uses and for the same reason: a technician doesn't
need a registered business to pick up work. `Lead.assignedOrgId` (the
original field) is unchanged. Added `lead:write:own` to the RBAC matrix
(granted to `TECHNICIAN`; `ADMIN` already had `lead:write:any` from the
original schema/RBAC pass, which now doubles as "see and claim
anything").

**`/account`, one hub instead of four speculative per-role
dashboards.** Every signed-in account gets the same page: name, role,
organization (if any), and cards linking to `/my-listings`, `/support`,
and — only for roles that can handle them — `/leads`, each showing a
real count pulled from the database rather than a static description of
what the role "can do". This is deliberately smaller than the
originally-scoped Module 9–12 portal screens: `/my-listings`, `/cart`,
and `/support` already cover most of what an individual account needs
day to day regardless of role, so `/account` is a landing point that
surfaces those, not a fourth parallel set of screens duplicating them.

### What was verified, in a real browser and against the database directly

- `npm run typecheck` clean.
- Ran a Playwright script driving five separate browser contexts: an
  anonymous visitor submitted a request through `/request-technician` and
  landed on the thanks page; `technician@demo.doorlink` saw it appear in
  "Open requests" at `/leads`; `customer@demo.doorlink` (no lead
  permission) hitting `/leads` directly was redirected away, never seeing
  the queue; the technician clicked "Respond", which revealed the
  requester's email in the same click and moved the request into "Your
  requests" on reload; `admin@demo.doorlink` (`lead:write:any`) saw the
  same now-claimed request listed under "Claimed by others"; the
  technician changed its status to `QUALIFIED` via the inline form and
  confirmed it persisted after a reload; `/account` for the technician
  showed a "Requests you've claimed" card, while `/account` for the
  customer showed listings and support cards but no leads card at all
  (permission-gated, not just hidden by role name).
- Confirmed via direct `psql`/Prisma query that exactly one test lead
  existed after the run (the one the script created), then deleted it and
  re-confirmed the `Lead` table was back to 0 rows.

## Session 12 — a 3D hero, and taking the app mobile

The user asked for more "wow" — something interactive and 3D — plus a
more app-like, engaging experience on a phone, and asked about the App
Store. Confirmed two decisions up front (`AskUserQuestion`): a real 3D
centerpiece rather than CSS-only depth effects, and "installable PWA"
plus "App Store downloadable" for mobile.

**A real interactive 3D garage door on the homepage**, not a video or a
static render. Added `three`, `@react-three/fiber`, and `@react-three/drei`
(`--legacy-peer-deps`, since `@react-three/fiber`'s peer range hadn't
caught up to React 19.3 yet — a real but harmless version-range lag, not
an actual incompatibility). `src/components/three/GarageDoorScene.tsx`
builds a four-panel sectional door procedurally (boxes, not an imported
model): drag to orbit, and an "Open the door"/"Close the door" button
lifts the panels up behind a facade header that occludes them — the same
z-buffer trick a real compositing shot would use, not a scripted
animation pretending panels vanish. Panels are staggered per-index
(`THREE.MathUtils.damp`) so they don't move in lockstep, approximating —
not simulating — how a real sectional door folds. `DoorHero3D.tsx` wraps
it with real WebGL feature detection (`canvas.getContext('webgl')`) and
falls back to a static illustration rather than a blank canvas on
devices without it; the dynamic import with `ssr: false` had to live in
its own client-only wrapper (`DoorHero3DClientOnly.tsx`) since
`next/dynamic(..., { ssr: false })` isn't allowed directly inside a
Server Component, which the homepage is.

**A real rendering bug found and fixed during this, not styling
polish.** The first pass rendered nothing visible — not broken, just
invisible: the door's panel color (`#cdd2d6`) was close enough to the
sky-gradient background that a dark charcoal door on a light background
had accidentally become a light door on a light background. Confirmed it
was a contrast problem and not a broken pipeline by temporarily dropping
a solid red test cube into the scene — it rendered fine, proving the
canvas, camera, and lighting all worked — then recolored the door to the
brand's own powder-coat charcoal (`#2C3033`, from `tailwind.config.ts`)
and warmed the facade for contrast, rather than picking an arbitrary
color.

**PWA: installable, with an honest offline story.** Added
`src/app/manifest.ts` (Next's special manifest route), a shared icon
generator (`src/lib/app-icon.tsx`, using `next/og`'s `ImageResponse` to
draw a "D" monogram at request time — no external image tool needed) and
`icon.tsx`/`apple-icon.tsx`/`icons/[size]/route.tsx`/
`icons/maskable/[size]/route.tsx` so the manifest, favicon, and iOS
home-screen icon all render from the one source. `public/sw.js` is
deliberately minimal, on purpose: it does not cache pages or API
responses, because DoorLink's whole design philosophy is that nothing
pretends to be live or verified when it isn't — caching a marketplace
listing page would mean serving stale listings while offline with no
indication they're stale. Its only job is a `fetch` handler on
navigation requests (satisfying Chrome's installability requirement) and
falling back to a static, honestly-worded `public/offline.html` (says
outright "this page is a static fallback, not a cached copy of the
site") when the network is actually down. `InstallPrompt.tsx` listens for
Chrome/Android's `beforeinstallprompt` and offers a real install button;
iOS Safari has no equivalent API, so on iOS it honestly says "tap Share,
then Add to Home Screen" rather than pretending to trigger something
that doesn't exist there. `MobileTabBar.tsx` adds a persistent bottom
tab bar (Home/Find/Market/Account) below `sm`, the pattern people expect
from an installed app rather than a website — the existing hamburger menu
still covers everything else.

**App Store / native wrapper: scaffolded, explicitly not completed.**
DoorLink is server-rendered (database-backed pages, Server Actions) —
it can't become a static-exported Capacitor bundle the way most
"Capacitor apps" work. The honest path is a native WebView shell pointed
at the real deployed site (`capacitor.config.ts`'s `server.url`), so
every request still hits the live Next.js server; nothing gets bundled
or faked as working offline. Added `@capacitor/core` and `@capacitor/cli`
as dependencies and a documented `capacitor.config.ts`, but did not run
`npx cap add ios` or `npx cap add android` — both need a real deployed
URL to point at (still blocked on the Supabase/hosting step the user is
doing later) and platform SDKs this sandbox doesn't have (Xcode requires
macOS; no Android SDK is installed here, only a bare JDK and Gradle).
See "Still needs you, not code" for the concrete runbook once hosting
exists.

### What was verified, in a real browser and against the database directly

- `npm run typecheck` clean.
- Found and fixed a real infrastructure gap while testing, unrelated to
  this session's own changes: the sandbox's local Postgres cluster
  (`pg_lsclusters` showed it `down`, a stale PID file from a prior
  container) wasn't running, so `/find` was correctly showing
  `<NotConnected>` rather than lying about it — exactly the behavior
  Session 2 built. Restarted it (`pg_ctlcluster 16 main start`) and
  confirmed all prior data was intact (5 models, 10 users, 1 listing,
  0 leads — the last of those matching Session 11's cleanup exactly),
  not a fresh empty database.
- Screenshotted the 3D hero at desktop and mobile viewports in both the
  closed and open states via a real headless Chromium session (software
  WebGL/SwiftShader, since this sandbox has no GPU) — confirmed the door
  is visible, the "Open the door" button lifts the panels behind the
  header convincingly (floor visible through the opening once open), and
  the button's own label swaps to "Close the door".
- Ran a Playwright pass across `/`, `/find`, `/marketplace`, a real
  model page, `/request-technician`, `/data-sources`, and `/sign-in` on
  a mobile viewport checking for console/page errors after the layout,
  footer, and manifest changes — zero errors. The one 404 the first pass
  hit was a bug in the test script itself (it reused a model's `slug` as
  its `id` — `/model/[id]` looks up by `id`, not `slug` — a fresh find
  against the database confirmed the model existed and the correct URL
  returned `200`), not a regression in the app.
- Confirmed `/manifest.webmanifest`, `/icon`, `/apple-icon`,
  `/icons/192`, `/icons/512`, `/icons/maskable/192`,
  `/icons/maskable/512`, `/sw.js`, and `/offline.html` all return `200`,
  and that the rendered homepage's `<head>` actually contains the
  `<link rel="manifest">`, `<link rel="icon">`, and
  `<link rel="apple-touch-icon">` tags Next generated from those files —
  not just that the routes exist in isolation.
- Screenshotted the mobile tab bar at both the top and the true bottom of
  a page's scroll — confirmed the footer's own links render fully above
  the fixed tab bar rather than being clipped underneath it.

## Session 13 — 3D realism pass, and decluttering the header

Direct feedback on Session 12: make the 3D "more realistic and just
better," and make the interface "easier to follow." Treated as two
separate, concrete jobs rather than vague polish.

**3D realism.** `GarageDoorScene.tsx` went from flat boxes and a CSS
gradient to: `RoundedBox` panel geometry (soft edges catch light the way
real rolled steel does, not the hard edges of a CSS-shaped box); a second
ribbed groove per panel plus a thin highlight line, echoing an actual
sectional door's corrugated profile instead of one flat seam; small
roller/hinge hardware brackets at each panel's edges (a real mechanism
has visible fixings, a flat slab doesn't); real shadow mapping
(`castShadow`/`receiveShadow` everywhere, a shadow-casting directional
light) replacing the blurred `ContactShadows` blob from Session 12; a
procedural `Sky` (drei's atmospheric-scattering shader, not an image —
no external asset to fail to load) plus distance fog for a real horizon
instead of a flat two-stop CSS gradient; warm key light / cool fill light
in place of one flat ambient wash; and ACES filmic tone mapping so
highlights roll off instead of clipping to flat white. The window insets
switched from a flat emissive material to `meshPhysicalMaterial` with
`clearcoat`/`transmission` for an actual glass-like look.

**A real timing bug surfaced while verifying this, not a regression in
the scene itself.** An early screenshot came back completely blank —
not just low-contrast this time, empty — while a screenshot taken
seconds later after clicking the open/close button looked correct.
Suspected a shader-compile stall specific to `Sky` (an atmospheric
scattering shader, more expensive to compile than a flat material)
running under this sandbox's software-rendered WebGL (SwiftShader, no
GPU here), which is far slower at first-use shader compilation than a
real GPU. Confirmed by screenshotting the same page at 3, 6, and 9
seconds after load with no interaction in between — 3 seconds was
already fully correct and identical to 6 and 9 — so the first blank
capture was a one-off (most likely a Fast Refresh reload mid-capture
while a file was still being edited), not a reproducible defect;
recorded here rather than silently dropped since "blank first frame"
is exactly the kind of thing worth being able to rule back in if a real
user ever reports it.

**Decluttering the header.** Signed in, the desktop header had grown to
up to 9 items in one row (4 public links + Cart, My listings, Requests,
Account, Support, Admin, the user's name, and Sign out) — exactly the
kind of thing that makes an interface hard to follow, not because any
one link is wrong but because nothing is prioritized. Added
`AccountMenu.tsx`: the public nav (Find your part, Marketplace, Request
a technician, Data sources) stays exactly as visible as before, but
every account-specific destination now lives behind a single "[Name] ▾"
trigger, opening a dropdown (Cart, Account, My listings, Requests,
Support, Admin — each still permission-gated exactly as before) with a
`framer-motion` open/close transition — the first real use of that
dependency, installed back in Session 12 but unused until now. Closes on
Escape and on an outside click. The mobile hamburger menu is deliberately
untouched: on a phone there's no crowded single row to protect, and the
bottom tab bar from Session 12 already surfaces the few things worth one
tap.

**A "how it works" section** was added to the homepage, directly below
the 3D hero: three short numbered steps (Identify → Compare & connect →
Get it sorted) giving a first-time visitor a one-glance map of what the
site actually does, since DoorLink is genuinely three things (a product
finder, a marketplace, and a technician-request flow) and nothing on the
page previously said so in one place.

### What was verified, in a real browser and against the database directly

- `npm run typecheck` clean.
- Screenshotted the new 3D scene at three points in time (3s/6s/9s after
  load, no interaction) to rule the blank-first-frame timing issue in or
  out, as described above — confirmed stable and correct at all three.
- Ran a signed-in Playwright pass (as `technician@demo.doorlink`) across
  `/`, `/find`, `/marketplace`, `/request-technician`, `/data-sources`,
  `/leads`, `/account`, `/my-listings`, and `/support` — all `200`, zero
  page errors.
- Directly tested the account menu's interaction contract: opened it,
  confirmed "Sign out" was visible, clicked an unrelated element on the
  page, and confirmed the menu closed — not just eyeballed from a
  screenshot.
- Screenshotted the mobile hamburger menu (as `admin@demo.doorlink`) and
  confirmed it still lists every item it did before (public links, Cart,
  Account, My listings, Requests, Support, Admin) plus the name/sign-out
  row — the header refactor only changed desktop's presentation, not
  what's reachable on mobile.

## Session 14 — a second realism pass on the 3D door

Direct follow-up: "I still want the 3d to be better." Session 13's pass
improved lighting and shadows but the panels themselves were still flat
boxes with painted-on lines standing in for detail — the actual geometry
hadn't changed. This pass replaced the illusion with the real thing.

**Embossed panels are now real geometry, not a painted line.** Each
panel got a second, smaller `RoundedBox` — the classic "raised panel"
sectional-door profile — physically inset from the panel's stile/rail
border and protruding slightly forward. Real shadow mapping now defines
its edges on its own; nothing is painted on to fake the look. The old
two-groove overlay is gone, replaced by one thin seam line at the actual
panel-to-panel joint (the one real seam a stacked sectional door has).
Hardware brackets moved outward from `±(DOOR_WIDTH/2 - 0.32)` to
`±(DOOR_WIDTH/2 - 0.1)` so they sit on the flat stile beside the raised
field instead of overlapping it — on a real door the hardware isn't
mounted on top of the embossed panel.

**Environment reflections, baked once, not per-frame.** Added drei's
`<Environment resolution={128} frames={1}>` fed by a second, offscreen
instance of the same procedural `Sky` used for the background —
`frames={1}` bakes it a single time at mount rather than every frame, so
this is a one-time cost, not an ongoing one. Every `meshStandardMaterial`
in the scene now picks up real sky-tinted reflections automatically
(three.js applies `scene.environment` globally) instead of showing flat
diffuse color with no sense of a reflective surface at all — most
noticeable on the hardware brackets and window glass, which read as
genuinely metal/glass now rather than matte-colored shapes.

**Material tuning to match:** panel metalness dropped from 0.35 to
0.16 (real powder-coated steel is a matte-satin polymer coating, not
shiny bare metal — the previous value read more like polished metal than
a painted door) with roughness raised to 0.55; hardware brackets kept
higher metalness (0.75–0.85) since they're the one genuinely bare-metal
element on a real door.

### What was verified, in a real browser and against the database directly

- `npm run typecheck` clean.
- Screenshotted the scene cropped tightly to just the canvas, both closed
  and open, at 4 seconds after load (longer than Session 13's timing
  investigation called for, specifically to give the environment bake and
  shadow-map compilation time to finish under this sandbox's
  software-rendered WebGL) — confirmed the embossed panels, hardware
  brackets, and seam line all render correctly with no blank-frame
  repeat of Session 13's transient issue.
- Re-ran the full signed-in Playwright regression across `/`, `/find`,
  `/marketplace`, `/request-technician`, `/data-sources`, `/leads`,
  `/account`, `/my-listings`, and `/support`, plus the account-menu
  open/outside-click-closes check and the mobile hamburger content
  check — all still passing, zero errors, after the scene changes.
- Screenshotted the homepage at a 390px mobile viewport and measured
  page load time (1.85s to `networkidle` in this software-rendered
  sandbox) — confirmed the embossed geometry and reflections still
  render correctly at phone width, and that the one-time environment
  bake didn't introduce a large, visible load delay.

## Session 15 — a house and garden around the door, and a full codebase audit

Two explicit asks: put the door in an actual scene (a house, sun, birds,
garden, backdrop softly blurred so the door stays the clear subject), and
"go thoroughly through the code and check for any errors."

### The scene

Added `House.tsx` (two wing walls starting just outside the door's own
jambs — never overlapping the door's footprint, so there's no z-fighting
between the two — a pitched roof spanning the full width, two windows,
a chimney), `Garden.tsx` (lawn either side of the existing concrete
driveway apron, raised 0.003 units to avoid z-fighting with it, plus
bushes and flower beds), and `Birds.tsx` (three small silhouettes on
slow circular flight paths). Added a real sun (drei's procedural `Sky`
already draws one, plus an explicit unlit glow sphere along the same sun
direction for a more definite highlight) and switched from
`@react-three/drei`'s `ContactShadows` blur to actual depth-of-field via
`@react-three/postprocessing`, focused on the door with the house/garden/
sky falling out of focus behind it.

**A real, fully-blown-out-white rendering bug, not a styling choice.**
The first working version of the DoF pass rendered the entire background
as flat white — sky, roof, everything. Diagnosed by disabling
`DepthOfField` entirely first (confirming the underlying scene was
correctly lit and colored without it) then re-adding it: the renderer's
own `gl.toneMapping = ACESFilmicToneMapping` was tone-mapping (clamping
to 0-1) every frame *before* `DepthOfField` captured it for blurring, so
the blur was operating on already-clipped, blown highlights instead of
proper HDR data — spreading white instead of a soft sky. Fixed by
removing tone mapping from the renderer entirely and adding a
`<ToneMapping mode={ACES_FILMIC}>` effect *inside* the same
`EffectComposer`, positioned after `DepthOfField` in the chain, so tone
mapping is the last thing applied to the final composited image rather
than something baked into the intermediate blur input.

**The DoF focus itself needed the library's newer API, not the one most
examples still show.** The commonly-documented `focusDistance`/
`focalLength` props (normalized 0-1 / deprecated) produced a uniformly
soft image with no real point of sharpness. Checked the installed
`postprocessing` package's own type definitions directly rather than
guessing further, which named `focusDistance`/`focusRange` in actual
world units as the current, non-deprecated API (`focalLength` is
explicitly marked deprecated in the JSDoc). Computed the real distance
from the fixed camera position to the door (~5.7 units) and used that
directly — the door is now genuinely sharp with the house and garden
softly out of focus behind it, confirmed by comparing crops before and
after the fix.

**Birds were invisible, not broken.** They rendered — confirmed by
capturing repeated frames over time and finding a bird in one of them —
but their original flight height (4-5 units) sat entirely above what the
camera's ~32° FOV framing on the door actually shows (roughly y -0.9 to
y 2.3 at this distance, worked out from the fixed camera distance and
FOV, not guessed). Lowered their orbit height and radius and enlarged
them slightly so they show up as part of normal viewing rather than a
one-in-eight-screenshots rarity.

### The audit

Ran a systematic pass rather than a spot check: a dependency
vulnerability check (`npm audit`), a grep sweep for common smells
(`console.log`, `any`, `TODO`, empty catches — none found), a read-through
of every `'use server'` action file, a check that every page/route
touching Prisma follows the established
`isDatabaseUnreachable`-degrades-gracefully pattern (all of them do), and
— critically — an actual production build (`npm run build`), which
catches a category of bug `npm run typecheck` and `npm run dev` both
miss.

**A real production build failure, not a hypothetical.** The build
crashed prerendering `/support`: `TypeError: Cannot read properties of
null (reading 'userId')`. Root cause: several pages
(`support/page.tsx`, `support/[id]/page.tsx`, `my-listings/page.tsx`,
`my-listings/[id]/edit/page.tsx`) read `session!.userId` — a non-null
assertion — commented "the layout above already guarantees a session,"
trusting the parent layout's own `if (!session) redirect(...)` instead
of re-checking. That's true for a real request, but not during Next's
static-generation build pass, where these specific pages get invoked
without that same guarantee holding, so the assertion was live during a
`next build`, not just a theoretical gap. Fixed all four by replacing the
assertion with the same explicit `if (!session) redirect('/sign-in')`
guard every OTHER page in the app already uses (`/leads`, `/account`,
`/my-listings/new` never had this problem, because they never trusted a
parent layout to have already handled it) — consistent with the
project's own established discipline that every layer re-verifies its
own assumptions independently, which this was the one place violating.

**A smaller, related gap fixed across five files.** Every admin CRUD
action's `delete` handler caught `P2003` (foreign-key constraint) but
not `P2025` (record already gone), and every `update` handler didn't
handle "record not found" at all — an update or delete against a
since-deleted row (two admins, or a stale page) would throw an uncaught
Prisma exception instead of a normal form error. Added
`isRecordNotFound()` to `src/lib/db-errors.ts` and wired it into
`admin/categories`, `admin/manufacturers`, `admin/models`,
`admin/compatibility`, and `support`'s `updateTicketAction` — the same
"turn a real, reachable outcome into an honest message" principle the
`isDatabaseUnreachable` pattern already applies everywhere else.

**Noted but not changed:** `npm audit` reports 5 vulnerabilities (4
moderate, 1 high) — all transitive, all in build-time/dev-only tooling
(PostCSS, bundled inside Next.js's own build pipeline; `uuid`, pulled in
by `@capacitor/cli`'s `xcode` dependency, only relevant if the native-app
step from Session 12 is ever run). Fixing either requires
`npm audit fix --force`, which would bump Next.js to 16.x or Capacitor's
CLI to a new major version — real breaking changes affecting a
currently-working app, not something to do silently as part of an audit.
Also noted: no root `error.tsx` exists, so an unhandled exception
anywhere falls back to Next's default error page rather than a branded
one — not a bug (the app already works without it), just a polish gap
worth a future session if it comes up again.

There is one narrower, lower-severity gap left deliberately unfixed:
every admin "create" action checks for a slug/code clash with a
`findUnique`/`findFirst` immediately before `.create()`, which is not
atomic — two admins submitting the exact same slug at the exact same
moment could both pass that check and the second `.create()` would throw
an uncaught `P2002` (unique constraint) error, the same failure shape as
the bugs just fixed above. Left alone because it needs simultaneous
action from two trusted, permission-gated admin accounts on the identical
value to ever manifest — real, but narrow enough that fixing the
concrete, demonstrated build-breaking bug and its close relatives took
priority over hardening a race window nobody has hit.

### What was verified, in a real browser, a real production build, and against the database directly

- `npm run typecheck` clean throughout.
- `npm run build` — the actual test that caught the bug — failed once
  (proving the bug was real, not theoretical), then passed cleanly after
  the fix: all 35 routes generated successfully, confirmed by re-running
  the full build a second time after a later edit to make sure nothing
  in between had reintroduced the problem.
- Grepped the entire `src/` tree for the `session!` pattern after fixing
  the four known instances — zero remaining.
- Screenshotted the new scene (closed and open) confirming the door
  reads sharp against a visibly blurred house, garden and sky — not just
  "no crash," an actual visual comparison against the pre-fix blown-out
  and pre-tuning uniformly-soft versions.
- Re-ran the full signed-in Playwright regression across every page
  touched this session or previously built, plus a dedicated runtime
  check hitting `/support`, `/support/[id]` (with a real ticket actually
  created through the UI, not a fabricated ID), and `/my-listings` as a
  signed-in customer — all `200`, zero page errors. The first version of
  this check had its own bug (a URL-matching regex that matched
  `/support/new` as if it were a real ticket ID, the same class of test
  mistake logged back in Session 9) — caught by noticing the "created
  ticket" URL was suspicious, fixed the regex, re-ran, and confirmed a
  real ticket ID.
- Confirmed via direct Prisma queries that the test ticket created during
  that check (in fact created *twice*, once by each version of the test
  script — the buggy regex hadn't stopped the real server-side action
  from running, just from being observed correctly) was fully cleaned up
  afterward, and that every table's row count matched the exact baseline
  from before this session started.

## Session 16 — fixing the garden, the blur, the birds, and a couple of glitches Session 15 introduced

Direct follow-up: "more realistic garden, less blur, better garage,
better aspects overall nicer interface and experience." Two of the four
asks turned into bug fixes for regressions from Session 15's own pass,
not just further polish — worth being explicit about since they're a
useful reminder that "add more detail" and "make it look right" aren't
the same task.

**Less blur:** `DepthOfField`'s `bokehScale` dropped from 3 to 1.5 and
`focusRange` widened from 2.8 to 5.5 — the house and garden are now
clearly visible with only a gentle softness, instead of the heavy blur
Session 15 tuned in.

**The garden had a real regression, not just "more realism" left on the
table.** Session 15's bushes and hedges were positioned at z~1.0-1.5 —
closer to the camera than the door itself (z~0.1). At this camera's
fairly tight framing, anything nearer than the focal subject reads
*larger*, not smaller, so the landscaping was looming oversized and
getting cropped at the frame edges instead of sitting as modest
background planting. Fixed by giving `Garden` a `wallZ` prop and pulling
every foundation element (hedge, flower row, bushes) back to hug the
actual house wall (`wallZ + 0.25` to `wallZ + 0.4`) instead of drifting
toward the driveway. Added mowed-stripe lawn (alternating green shades,
the cheapest real "someone mows this" cue), a foundation hedge, a
flower row, and two full trees (trunk + layered canopy) for scale and
depth, all sized down from the first draft.

**The birds had a real, reproducible rendering glitch, not a styling
preference.** Screenshotted with the door open and found two small
black "X" shapes hanging in the sky where birds should be. Root cause:
each bird was two separate thin box meshes rotated to form wing
"planks," flapped by rotating each independently — a design that, from
certain viewing angles (camera orbit × bird flight angle × flap phase,
three moving variables at once), can present the two planks crossing
each other and reading as a plain X instead of a V. Reducing the flap
amplitude first (0.35 → 0.12) didn't fix it — confirmed by
re-screenshotting — because the crossing was a property of the
two-separate-mesh geometry, not the animation range. Replaced the whole
approach with a single flattened, stretched sphere per bird (one
continuous mesh, gently rolled rather than flapped) — a shape that
cannot glitch into a crossing artifact from any angle because there's
nothing separate left to cross.

**Better garage:** `RoundedBox` smoothness bumped from 3 to 4 for
cleaner curves on the panel edges. Added a garage door opener (rail,
motor unit, and mounting struts) mounted just below the header's bottom
edge — occluded by the closed door the same way the header hides
raised panels, so it only comes into view through the opening once the
door lifts, which was the single biggest tell that the "open" shot
revealed an empty box rather than an actual garage interior. Also added
a visible interior ceiling plane so the rail and motor have something
to visually hang from, rather than floating in an undefined white void.

**Nicer interface:** added `RevealCard` (`src/components/ui/RevealCard.tsx`),
a small `framer-motion` wrapper that fades/slides a card in the first
time it scrolls into view and lifts it slightly on hover — applied to
the homepage's three "how it works" steps and its two bottom link
cards. Added tactile `active:scale-[0.97]` feedback to the shared
`Button` component, which every button in the app already uses, so this
one small change reaches every button sitewide rather than needing to
be repeated per page.

### What was verified, in a real browser, against the database, and by direct comparison

- `npm run typecheck` clean.
- Screenshotted the door closed and open before and after every fix in
  this session, not just after — confirmed the oversized-garden and
  X-shaped-bird issues were real by seeing them, then confirmed each fix
  by seeing them gone, rather than reasoning about the code changes in
  the abstract.
- Specifically re-screenshotted the birds after only reducing flap
  amplitude (the cheaper fix) and confirmed the X still appeared before
  concluding the geometry itself needed to change, rather than assuming
  the first plausible fix had worked.
- Re-ran the full signed-in Playwright regression across every page in
  the app plus the account-menu and mobile-hamburger checks — all `200`,
  zero errors, after the scene and homepage changes.
- Screenshotted the homepage at a 390px mobile viewport and confirmed
  the door, garden proportions, and bottom tab bar all still render
  correctly at phone width.
- Scrolled the homepage and screenshotted the reveal cards in their
  settled (post-animation) state to confirm they end up fully visible
  and correctly styled, not stuck invisible mid-transition.
- Confirmed via direct Prisma query that every table's row count matched
  the exact baseline from before this session (no test data leaked by
  the read-only verification scripts used this time).

---

## Session 17 — the Doorlink re-brief: manuals, and a real marketplace

This session started with a new, much larger brief. DoorLink stops being
a parts finder with a lead form bolted on and becomes **Doorlink**: a
product experience, a searchable manual library, a customer-to-technician
marketplace with Doorlink taking a commission, accounts for customers,
workers and businesses, paid subscriptions, Stripe, Supabase, and a
premium 3D landing page.

### What the re-brief changes about earlier decisions

Two entries under "Still needs you, not code" were written against the
old scope and are now wrong. They are corrected here rather than quietly
deleted, because the reasoning that produced them was sound at the time:

- **"DoorLink is free to use — no Stripe, no payment processing"** is
  reversed. The brief asks for Stripe, a Doorlink commission on completed
  jobs, and paid subscriptions. The commission engine is built (below);
  Stripe itself is not connected and everything says so.
- **"the marketplace is peer-to-peer"** still holds for *parts* — the
  `/marketplace` listings are unchanged. It never applied to *services*,
  which is what this session built: there, Doorlink is a party to the
  transaction and takes a fee.

### User manuals (committed separately, `a204181`)

Five PDFs were supplied. Three were real; two were 837-byte empty Safari
print artifacts, and were reported as such rather than ingested as blank
"manuals".

The interesting problem was honesty about provenance. Two documents are
FAAC's own E045 control-board manual (revisions B and C, document 732786
— read out of the documents, not guessed). The third is a page captured
from AGG Doors' website about a BFT product: useful, but not BFT's
manual. Presenting it as one would be a lie a technician might act on.

So `DataSource` (how much the *record* is trusted) was separated from a
new `DocumentOrigin` (where the *file* came from). The FAAC files are
`ADMIN_VERIFIED` / `MANUFACTURER_ORIGINAL`: a Doorlink admin confirmed
they are the genuine FAAC files, but FAAC did not supply them to us and
saying they did would be a claim we cannot back. The BFT file is
`THIRD_PARTY_GUIDE` with a provenance note naming AGG Doors, and its
badge is amber, not green. On the document page that warning sits
directly under the title, because if a document is someone's write-up
rather than the manufacturer's own file, that is the first thing a
technician relying on it should see.

Search reads the text *inside* the PDFs (`pdftotext` at ingest into
`Document.searchText`), not just titles — verified by searching
"BUS-2EASY", a term that appears only in the body of the FAAC manuals,
and getting both back with a real snippet.

The demo banner was rewritten in the same pass: it used to assert the
whole catalogue was invented sample data, which stopped being true the
moment real manufacturer documents landed next to the seeded models.

### The services marketplace (`97ea012`)

`post a job -> technicians quote -> customer hires -> job tracked to
completion -> customer reviews`, end to end.

**Money.** Commission is basis points, so 12.5% is the integer 1250 and
never a float. The worker's payout is the *remainder* of the split, not a
second independent rounding — rounding both halves separately is how
marketplaces end up a cent short and cannot reconcile. `commission.test.ts`
asserts this over 88 amount/rate combinations. The rate lives in
`PlatformSetting`, not in code, because the brief is explicit that an
admin must be able to change it without a rebuild; `DEFAULT_COMMISSION_BPS`
is 1000 as a starting point, not as a business decision anyone has made.
When a quote is accepted the rate is **snapshotted onto the Transaction**,
so changing the platform rate next month cannot rewrite the economics of
a job two people already shook hands on.

**The state machine** lives in `src/lib/marketplace.ts` as data keyed by
actor, not as conditionals spread across the pages that happen to trigger
them. It is deliberately asymmetric: a technician can say "started" and
"done", only the customer can cancel outright, and neither side can
declare a dispute resolved. The job page renders exactly the buttons the
person looking at it is allowed to press, because it asks the same
function the server action validates against.

**Accepting a quote** is one transaction: accept this quote, decline
every rival quote, assign the lead, create the job, create the
transaction. A customer cannot accidentally hire two people for one job,
and a half-completed hire cannot exist.

**Contact details** are withheld until a job exists. The job board shows
the work and the suburb and never the phone number; both sides get each
other's details at the moment they have agreed to work together. The
customer's number comes from the request they filled in rather than their
account record, which may have no number on it at all.

**Nothing pretends to take money.** The transaction records the agreed
split and stays `PENDING` — only a real provider webhook will ever mark
it `PAID`. The job page says plainly that no payment provider is
connected and that the two sides should settle directly for now.

Subscription plans are seeded with the one price that has been decided
($4.99/week). Monthly and annual exist with `priceCents: null`, and a
null price means the plan cannot be subscribed to and the UI will say
"pricing not set" rather than showing an invented number.

### Three bugs the browser walkthrough found

Worth recording because none of them would have shown up in a typecheck:

1. **The quote form could not be submitted at all.** `min="1" step="15"`
   on the duration field makes the browser treat 1, 16, 31, 46 as the
   only valid values, so a technician typing "90" got a form that
   silently refused. `step="1"` on the amount rejected any quote with
   cents in it. Both fixed; the hint now says the field is in blocks of
   15.
2. **`/leads` shipped 21.8 kB of first-load JS** because the client-side
   quote form imported `commission.ts`, which imported Prisma — pulling
   database code into the browser bundle. The arithmetic is now a pure
   module with no imports at all, and the database read moved to
   `commission-settings.ts` behind `server-only`. 21.8 kB -> 2.34 kB.
3. **The manuals list scrolled sideways on a phone.** A badge row marked
   `shrink-0` was wider than a 390px viewport and refused to wrap, so it
   pushed the whole page instead.

### How the marketplace was verified

- Walked the entire flow in a real browser as two signed-in users:
  posted a job, quoted $480 as the technician, compared and hired as the
  customer, booked a time, started, completed, and left a review.
- Checked the result in the database rather than trusting the screens:
  $480 gross, 10% -> $48 fee and $432 payout, rate snapshotted at 1000
  bps, transaction still `PENDING`, four status events with their notes
  and actors, lead moved to `ASSIGNED`, and the technician's cached
  rating recomputed to 5.0 from 1 review and 1 completed job.
- Swept every route at a 390px viewport for horizontal overflow — all
  clean after the manuals fix.
- `npm run typecheck`, `npx vitest run` (8 passing), and `npm run build`
  all green.

### Admin: the commission rate, actually changeable (`d1fbf1a`)

The rate already lived in `PlatformSetting` rather than in code, but
nothing could change it — which is the half of "admin-configurable" that
matters. `/admin/settings` now does, showing the arithmetic: type 12.5
and the page works it out on a $500 job before you save. Every change
writes an AuditLog row with the old rate, the new one, and who made it,
shown as a change history under the form.

It is gated on `admin:settings`, not the `catalogue:write` the rest of
/admin uses. A manufacturer can edit the catalogue and has no business
changing what Doorlink charges technicians — verified by signing in as
one and being redirected away from both the page and its nav link.

`/admin/marketplace` gives oversight of requests, jobs, disputes and the
recorded splits, and says plainly that those are amounts Doorlink has
*recorded*, not collected.

### Technician profiles and verification (`b6f3a45`)

A technician could quote but had nothing to quote *as*. `/my-profile` is
their side; `/technicians/[id]` is what a customer comparing quotes sees.

Verification is the part that needed care, because "Verified by Doorlink"
is exactly the kind of badge people read as more than it is:

- A technician can submit and withdraw. Nothing they do reaches VERIFIED.
- The only path to VERIFIED in the codebase is an admin pressing a button
  on `/admin/verification`, behind `admin:settings`. Every decision is
  audit-logged, and a rejection with no reason is refused — it leaves the
  technician nothing to fix.
- The public badge has two states, not five. "Documents submitted" is the
  technician's business; to a customer it reads as almost-verified.
- Next to a verified badge the page says what was actually checked: that
  an admin matched the supplied licence and insurance details to the
  account, that Doorlink is not a licensing authority, and that it has
  not audited the issuer.
- A certification a technician types in is labelled "Stated by the
  technician" until an admin has looked. Typing a certificate's name into
  a box is a claim, not a check.

Job matching on the board is set membership against the postcodes and
services the technician entered themselves — not a model, not a
prediction, and described to them in those words. Matching jobs sort
first with a badge saying why; nothing is hidden from anyone.

### Messaging and in-app notifications (`e42097a`)

A customer could get five quotes and had no way to ask any of them a
question; a technician could be hired and nothing told them.

Threads are one per quote and one per job, and a technician can only open
one on a lead they have actually quoted — otherwise the job board is a
way to message every customer on the platform. Threads carry a display
name and nothing else: no contact detail is read or rendered anywhere in
`src/lib/messaging.ts`, because messaging must not become the way around
Doorlink withholding phone numbers until a job is agreed. Unread counts
derive from each participant's `lastReadAt` rather than being stored, so
they cannot drift. An admin gets a 404 on someone else's thread, same as
anyone else.

Notifications are written in the same transaction as the thing they are
about, so an accepted quote and the technician being told are one event
or neither — but `notify()` swallows a database outage rather than
unwinding the caller's work, because a hire must not be rolled back
because a notification write failed.

Email and push are both in the brief and neither is connected.
`/notifications` says so in those words rather than offering per-channel
toggles that would imply the channels exist. `push` joined the
integrations registry so it reports like everything else.



### Session 18 — the audit against the brief, and the phases that were missing

Re-read the brief end to end against the codebase. Five things it asks
for did not exist at all, and all five were built:

**The reveal (Phase 2).** The line behind the opening garage door. Drawn
inside the 3D scene, so the door panels genuinely occlude it and the
camera gives it parallax — an HTML overlay could not be hidden behind the
door, which is the cheap popup the brief rules out. Text painted to a 2D
canvas rather than loaded through drei's `<Text>`, because troika fetches
its typeface from a font CDN at runtime and a hero that loses its
headline to a blocked request is not a hero. Looking at it turned up
three things reasoning about it would not have: the garage was a floating
billboard (now a room), auto-rotate left the reveal edge-on (the camera
now eases front-on and pulls *back*, keeping the house in frame), and the
opener motor hung across the line being revealed.

**The landing page (Phase 2).** It was still the old parts-finder page.
Rebuilt to the brief's structure with the brief's positioning. Every
figure on it is read from the database; if one cannot be read, the
sentence that needs it is not rendered.

**Payments (Phase 6).** `src/lib/payments/` — provider-agnostic types, a
Stripe adapter that is the only file in the codebase naming Stripe, a
ledger where every state change writes a TransactionEvent, and a webhook
route that is the sole path to marking money as moved. The adapter throws
rather than working: the SDK is not installed and no keys exist, and each
method carries the exact call that replaces it. There is no unsigned test
path, because a test route into the code that marks transactions PAID is
a production route waiting to be found.

**Subscriptions and feature gating (Phase 7).** `/plans`,
`/account/subscription`, and an entitlements module. The gate is built
and switched off: which features are premium lives in `PlatformSetting`,
not in code, so it can be decided later without a rebuild. Nothing is
locked behind a subscription nobody can buy.

**The configurator (Phase 3).** `/configure`, with the homepage's 3D
scene parameterised rather than duplicated. The options are Doorlink's
own generic vocabulary, not any manufacturer's range, and the page says
so — a configurator is precisely where "do not invent manufacturer
specifications" gets broken.

Also this session: the brand is spelled Doorlink throughout, as the brief
spells it; `RevealCard` no longer ships content at opacity 0 in the
server HTML (a reader with JavaScript off was getting blank sections);
and `prettier.config.js` records the house style so a stray global
prettier run cannot convert a file to double quotes and semicolons.

### Still not built, and known

- Universal search across products, manuals, technicians and services
  (§26). Each area searches itself; there is no one box.
- Onboarding flows for customers and workers (§28).
- Admin screens for users, reports, disputes and subscriptions, and the
  platform metrics panel (§19). Catalogue, marketplace, verification and
  settings exist.
- Worker availability (`WorkerAvailability` has a schema, no UI).
- Message attachments and the report/safety flow (§17) — attachments are
  blocked on storage, the same blocker as document upload.
- Worker replies to reviews (`WorkerReview.workerReply` has a column, no
  UI).

---

### Session 19 — automated design, pricing and quoting

Customers design a garage door, gate, fence, window shutter or shop shutter
at `/quote` (garage doors via the existing `/configure` 3D designer) and get
instant quotes worked out from each participating business's own price
rules. Businesses manage their prices at `/pricing` with the existing trade
subscription. Separation between businesses is enforced in
`src/lib/quoting/`. Full details, rules and open questions:
`AUTOMATED_QUOTING.md`.

## Status by module

| # | Module | Status |
|---|---|---|
| 0 | Audit and architecture | Done |
| 1 | Design system | Core primitives done; modal, drawer, tabs, toast outstanding |
| 2 | Public website | ~30% — 6 of ~18 pages |
| 3 | Auth and roles | RBAC matrix, guards, and dev-mode sign-in/register screens done and verified; Supabase wiring still outstanding |
| 4 | Database architecture | Done; `db push` + seed verified against a local Postgres this session |
| 5 | Product database | Manufacturer, Category, and Model admin CRUD done and verified; Document/Compatibility admin screens still outstanding |
| 6 | Product finder | Cascade, model profile page (`/model/[id]`), and honest no-DB handling all done and verified in a browser (see Session 2) |
| 7 | User manuals | Library, in-PDF search, facets, provenance badges and the document page done and verified (Session 17); three real manufacturer documents ingested. Upload UI still blocked on storage |
| 8 | Compatibility engine | Schema, seed, bidirectional query, and admin CRUD (`/admin/compatibility`) all done and verified |
| 9–12 | Customer / technician / supplier / manufacturer portals | `/account` hub (real per-account counts + links to `/my-listings`, `/support`, `/leads`) done and verified (Session 11), deliberately smaller than four separate per-role dashboards |
| 13–15 | Parts marketplace, search, checkout | Peer-to-peer: anyone can list (`/my-listings`, business or individual), browse/search/filter, cart, and "I'm interested" contact reveal all done and verified. No payment processing — Doorlink is not a party to parts sales |
| — | Services marketplace | Post a job, quote, hire, job lifecycle, reviews and the commission engine done and verified end to end in a browser (Session 17). Taking payment is honestly disconnected; messaging, worker profiles and the admin commission screen are the next gaps |
| 16–18 | Leads, support, admin | Support tickets (`/support`, `/support/[id]`, `/support/queue`) done and verified; Leads reimagined as public "request a technician" (`/request-technician`) + claim queue (`/leads`), done and verified (Session 11) |
| 19 | SEO | Sitemap, robots.txt, WebSite/Product JSON-LD, and canonicals on every public page all done and verified |
| 20–25 | Notifications, analytics, security, performance, testing, production | Foundations only |
| 26 | AI features | Interfaces present, honestly disconnected |

---

## Next actions, in order

1. ~~`npm install`, `prisma generate`, `npm run typecheck`.~~ Done (Session 1/2).
2. ~~Provision Postgres, `prisma db push`, `npm run db:seed`.~~ Done and verified (Session 2).
3. ~~Model profile page `/model/[id]`.~~ Done and verified (Session 2).
4. ~~Make `/api/finder` fail honestly when the database is unreachable.~~
   Done and verified (Session 2) — see the follow-up under Module 6.
5. ~~Sign-in and registration screens against the existing session interface.~~
   Done and verified (Session 3) — dev-mode only, refuses in production.
6. ~~Admin catalogue CRUD.~~ Manufacturers, Categories, Models, and
   Compatibility links done and verified (Session 4). The one entity left
   is Documents, which is blocked on Supabase storage for actual file
   upload rather than being a design gap — see item 7.
7. The document upload workflow (Module 29) — blocked on Supabase storage
   being connected; see "Still needs you, not code" below.
8. ~~Marketplace listing and product pages.~~ Public `/marketplace` browse
   page and supplier-scoped listing CRUD (`/supplier/listings`) done and
   verified (Session 5), including the cross-tenant ownership boundary.
9. ~~Cart.~~ Add/view/adjust-quantity/remove done and verified (Session 6).
   Checkout stays behind `<NotConnected />`. The Session 17 brief brings
   Stripe back for *services* (commission on jobs) and subscriptions, but
   says nothing about charging for peer-to-peer parts sales, so the cart
   is still waiting on a product decision rather than on a connection.
10. ~~Marketplace search/filtering.~~ Keyword search plus category,
    manufacturer, and condition filters done and verified (Session 7).
11. Wire in a real auth provider (Supabase) to replace
    `src/lib/dev-session.ts` — deferred by the user for now (setup guide
    given, to be completed later on desktop); see "Still needs you, not
    code" below. Document admin CRUD and the upload workflow (Module 29)
    stay blocked behind it too.
12. ~~Decide what "completing an order" means without payment
    processing.~~ Answered directly by the user (Session 8): DoorLink is
    peer-to-peer, like Facebook Marketplace — buyer and seller meet up and
    handle the exchange themselves. Built as "anyone can list" +
    "I'm interested reveals the seller's contact email", not a formal
    order record. `Order`/`OrderItem` stay unused for the marketplace
    flow; they were designed for the storefront model this replaced.
13. Extend `/my-listings` to cover editing/pausing personal listings
    smoothly now that most users will be individuals, not businesses —
    today's form still shows every field the business path needed
    (status, stock quantity as a count rather than "still available"),
    worth revisiting once real usage shows what a peer-to-peer seller
    actually needs.
14. ~~Support tickets.~~ `/support`, `/support/[id]`, `/support/queue`
    done and verified (Session 9).
15. ~~Leads (rest of Module 16–18).~~ See item 18 below — reimagined
    rather than ported, once a peer-to-peer-shaped design was picked.
16. ~~Technician/customer/supplier/manufacturer portal screens (Module
    9–12).~~ See item 19 below.
17. ~~SEO (Module 19).~~ Sitemap, robots.txt, JSON-LD, and canonicals done
    and verified (Session 10), including a real XSS gap found and fixed
    in how JSON-LD gets embedded (see the session log).
18. ~~Leads (rest of Module 16–18).~~ Reimagined as a public, no-signup
    "request a technician" form (`/request-technician`) plus a
    first-come claim queue (`/leads`) done and verified (Session 11).
19. ~~Technician/customer/supplier/manufacturer portal screens (Module
    9–12).~~ Built as a single `/account` hub with real per-role counts
    and links into the pages that already exist, done and verified
    (Session 11) — not four separate dashboards.
20. Extend `/my-listings` to cover editing/pausing personal listings
    smoothly now that most users will be individuals, not businesses (see
    item 13 above, still open).
21. Wire in a real auth provider (Supabase) to replace
    `src/lib/dev-session.ts` — still the main remaining item waiting on
    the user rather than a build decision; see "Still needs you, not
    code" below.
22. ~~A "wow"/interactive homepage element, and a more app-like mobile
    experience.~~ 3D hero (`/`), installable PWA (manifest, icons,
    offline fallback, install prompt, mobile bottom tab bar) all done
    and verified (Session 12). The App Store/Play Store wrapper is
    scaffolded (`capacitor.config.ts`) but not buildable yet — it needs
    a real deployed URL and platform SDKs neither of which exist in this
    sandbox; see "Native app (iOS/Android)" below for the exact runbook.
23. ~~The services marketplace: quotes, hiring, jobs, reviews and the
    commission engine.~~ Done and verified end to end in a browser
    (Session 17). Money is recorded, never moved.
24. ~~The admin screen for the commission rate.~~ `/admin/settings` done
    and verified (Session 17), with an audited change history.
25. ~~Worker profiles and onboarding.~~ `/my-profile`, the public
    `/technicians/[id]`, and the `/admin/verification` queue all done and
    verified (Session 17). Availability (`WorkerAvailability`) is the one
    part of this still unbuilt — the schema is there, the UI is not.
26. ~~Messaging between a customer and a technician.~~ `/messages` done
    and verified (Session 17). Attachments are still unbuilt: they need
    storage, same blocker as document upload.
27. The payments module: a Stripe service abstraction kept isolated
    behind one interface, so the marketplace keeps working untouched when
    no keys are present. Nothing may report a payment as taken until a
    real provider webhook says so.
28. Subscriptions: the plans page, feature gating, and a subscription
    dashboard. Monthly and annual prices stay `null` until decided.
29. Notifications: in-app first (the `Notification` model exists), email
    and push behind the same honest not-connected treatment.
30. The premium landing page rework, including the garage door opening
    into a parallax reveal of "App developed for automated doors and
    gates."

## Still needs you, not code

- **Reversed by the Session 17 brief:** "DoorLink is free to use — no
  Stripe, no payment processing" no longer holds. Doorlink takes a
  commission on completed jobs and will sell subscriptions, both through
  Stripe. The commission engine is built and tested; Stripe is not
  connected, and every screen that touches money says so rather than
  implying otherwise.
- **Still true (Session 8), for parts:** the *parts* marketplace is
  peer-to-peer — anyone can list, buyers and sellers meet up, contact
  happens via email reveal (`/my-listings`,
  `revealListingContactAction`). Doorlink is not a party to those sales
  and takes nothing from them.
- **New (Session 17), for services:** the *services* marketplace is not
  peer-to-peer. Doorlink is a party to the transaction, holds the agreed
  split on the Transaction record, and takes a commission. The two
  marketplaces are separate systems that happen to share a word.
- Still undecided, and left as `null` rather than invented: the monthly
  and annual subscription prices. Only $4.99/week has been set.
- Supabase project (auth + storage) — see the step-by-step setup guide
  given directly to the user; covers `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and can
  also provide `DATABASE_URL`/`DIRECT_URL` for a production database.
- Real manufacturer, model and part data, and permission to host their manuals.
- Supplier onboarding terms and the commission rate (`SupplierProfile.commissionBps` is 0) — still relevant even without Stripe, since suppliers are still distinct sellers on the platform.
- Whether technician "verified" status requires a real accreditation check.
- **Native app (iOS/Android) — the runbook, once hosting exists:**
  1. Deploy the Next.js app somewhere public (Vercel is the natural fit;
     it needs the same `DATABASE_URL` already in use, plus Supabase env
     vars once that's connected) and set `NEXT_PUBLIC_SITE_URL` to that
     real URL — `capacitor.config.ts` reads it directly.
  2. **Android** (no Mac needed): install Android Studio on your own
     machine (free), then from the project run `npx cap add android`
     followed by `npx cap open android` — that opens the generated
     project in Android Studio, where "Build > Generate Signed Bundle"
     produces what the Play Store wants. A $25 one-time Google Play
     Developer account is the only cost.
  3. **iOS**: needs a Mac with Xcode installed (or a Mac-in-the-cloud CI
     service if you don't have one) plus a $99/year Apple Developer
     account. Once you have both: `npx cap add ios`, then
     `npx cap open ios` opens the generated project in Xcode for
     archiving and submission through App Store Connect.
  4. Either build is just a WebView shell around step 1's real URL — no
     app logic lives in the native project, so there's nothing in it to
     keep in sync beyond re-running `npx cap sync` if the config changes.
