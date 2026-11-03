# Doorlink demo

A clickable demo of the marketplace for clients and new users. Everything in it is
fictional: no real businesses, prices, reviews or payments. A banner on every page says so.

## Run it locally

```bash
npm install
createdb doorlink_demo                       # any name containing "demo"
export DOORLINK_DEMO=true
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/doorlink_demo?schema=public"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push --skip-generate           # also run `npx prisma generate` once
npm run demo:assets                          # optional: rebuilds public/demo images
npm run demo:seed                            # resets the demo database to the seed
npm run build && npm run start               # or: npm run dev
```

Open http://localhost:3000/sign-in and use one of the one-click accounts, or start at `/demo`.

The demo refuses to run, seed or reset unless `DATABASE_URL` names a database with "demo"
in it, and never against a name that looks like production. Leave the provider variables
(`STRIPE_*`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_*`, `ANTHROPIC_API_KEY`) unset.

## Demo accounts

| Account | Email | What it can do |
| --- | --- | --- |
| Customer | customer@demo.doorlink | Design, compare, book, accept and pay (simulated), review |
| Business owner | owner@demo.doorlink | Harbourline Doors: prices, profile, coverage, bookings, progress |
| Super admin | admin@demo.doorlink | Businesses, AI usage, metrics, reviews, disputes, reset demo data |

## What is simulated

- **Payments**: every Pay step records a simulated payment and moves the job on. Nothing is charged, and
  Stripe is never called.
- **AI images**: the designer's AI panel and the door photo preview return bundled sample images, labelled "Demo image".
- **Uploads**: logos, portfolio photos, progress and review photos are replaced by bundled samples.
  Nothing is stored and nothing is written to Supabase.
- **Email and push**: nothing is sent. Notifications stay in the app.
- **Reviews and ratings**: fictional, tagged "Demo review".

Not connected at all in the demo: the product catalogue (finder, manuals), Stripe webhooks, Supabase.
