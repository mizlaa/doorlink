# Automated design, pricing and quoting

Customers design a garage door, gate, fence, window shutter or shop shutter,
enter their measurements and get instant quotes from participating
businesses. Each business sets its own prices. Doorlink sets none.

## Who does what

| Who | Where | What |
| --- | --- | --- |
| Customer (any signed-in account) | `/quote` | Choose product, measurements, design, brand, motor, installation; pick up to 5 companies; get quotes |
| Customer | `/quotes`, `/quotes/[id]` | Their quotes, with the full price breakdown |
| Anyone | `/companies/[id]` | A participating company's profile and genuine ratings |
| Trade account with an active trade subscription | `/pricing` | Their business's price list, profile, and the quotes they have given |

Garage doors keep using the existing 3D designer at `/configure`; its
**Get instant quotes** button carries the design and size into `/quote`.

## Product categories and motors

Garage door, sliding gate, swing gate, pedestrian gate, fence, window
shutter, shop shutter (`src/lib/quoting/catalogue.ts`).

- Gates (sliding, swing, pedestrian): motor must be one of Beninca, BFT,
  FAAC, Merlin, Grifo, Nice V8.
- Window shutters: CWB, Maximum, Somfy, Simu, Nice.
- Garage doors and shop shutters: any motor brand the business names, or none.
- Fences: no motor.

Doorlink holds no verified motor compatibility data, so it makes no
compatibility claim. A business only quotes a motor it has priced for that
product type at those sizes; anything else is "no automated quote".

## Pricing rules (`src/lib/quoting/pricing.ts`)

One rule = one product, optional brand, motor included or not (and which),
inclusive width and height ranges in mm, price, installation (included /
extra at a set price / supply only) and GST (included / added).

- **Ranges include both ends.** 2,300–2,500 covers 2,300 and 2,500.
- **No overlaps.** Two active rules for the same product, brand and motor
  arrangement may not share any size. Saving one is refused with the
  clashing range named. Checked inside a transaction holding a
  per-business Postgres advisory lock, so simultaneous saves can't race.
- **GST is 10%.** "Plus GST": GST = 10% of the price, rounded to the nearest
  cent. "Including GST": GST = price ÷ 11, rounded to the nearest cent.
  Ex-GST + GST always equals the total.
- **Matching.** Brand: "no preference" matches every brand; a named brand
  matches only that brand (case-insensitive). Motor: "no motor" matches only
  rules without one, "any brand" matches rules with one, a named motor only
  that motor. A customer wanting installation is not quoted by supply-only
  rules. Installation-included prices are never reduced.
- **No invented prices.** No matching rule → "No automated quote is
  available" with the reason (size outside the ranges, motor not priced,
  brand not priced, supply only). If overlapping rules somehow exist, no
  price is picked.
- Quotes copy every figure at the moment of quoting, so later price edits
  never change a quote a customer already holds.
- Design choices (colour, style) are Doorlink's generic options and do not
  change the price.

## Business separation (`src/lib/quoting/company.ts`, `quotes.ts`)

Enforced on the server, not just hidden in the UI:

- A business is an `Organization`. Its context comes only from the signed-in
  user's own membership. No action accepts an organization id from a form
  or URL, and every rule query filters on that organization. Another
  business's rule id reads as "not found" (404 on edit pages).
- Pricing rules are never sent to the browser except to their own business.
  Customers receive only the computed quote.
- A quote request is visible to the customer who made it, and to each quoting
  business, which sees **only its own quote** on it. The customer's name and
  email are shown to a business only if the customer ticked "share my
  contact details". Everyone else gets a 404.
- Doorlink platform admins have no access to business pricing or quotes
  (`pricing:manage:own` is not granted to ADMIN; decided with the client).
- A business only appears to customers when its profile has quoting turned
  on, it has at least one active price, and a member holds an active trade
  subscription. A lapsed subscription stops quoting immediately.
- Anti-scraping: 20 quote requests per account per hour, 5 companies per
  request (`QUOTE_REQUESTS_PER_HOUR`, `MAX_COMPANIES_PER_REQUEST`).

## Ratings

Computed from genuine `WorkerReview` rows only: reviews customers left on
completed Doorlink jobs by technicians who are members of the business. No
reviews means "No reviews yet", never a default score. Nothing is seeded.

## Tests

```bash
npm test                                   # unit tests (pricing, GST, forms)
QUOTING_DB_TESTS=1 npx vitest run src/lib/quoting   # + database access tests (scratch DB)
npm run dev & node scripts/e2e/quoting.mjs # browser end-to-end (after db:seed)
```

The database and browser tests create their own data. The browser test
gives the demo trade accounts an ACTIVE subscription row directly, because
Stripe is not connected in development.

## Open questions for the client

- **Fence pricing per metre.** Fences are priced by length × height range
  like every other product. If fences should be priced per lineal metre,
  that needs a rule type the client has not specified.
- **Quote validity period, deposit terms, site-measure conditions.** Not
  specified, so quotes state none. Businesses can add notes to each price.
- **"Nice V8".** Used exactly as supplied in the gate motor list.
- **The prohibited word.** No interface text in the app uses it. It appears
  only inside the manual library's source data (`data/manuals/*.json`), as
  part of real manufacturer and website names (for example the gate-operator
  brand "HySecurity" and source URLs). Renaming a real manufacturer would
  make the manual records wrong, so it was left for the client to decide.
- **Competitor price discovery.** A trade account can request quotes like
  any customer. Requests are rate-limited, but a business could still learn
  a competitor's prices this way, as it could by phoning them.
