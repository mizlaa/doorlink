# DoorLink

Everything for your door, in one place — product identification, technical
documentation, compatible parts, suppliers and technicians for the garage door,
roller shutter, motor and locking industry.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · PostgreSQL via Prisma ·
Supabase-ready auth and storage · Vercel-compatible.

**Replit:** import this repository from **GitHub only** (`mizlaa/doorlink`).
Do not use Replit’s “Import from Vercel” — that path migrates the stack.
See `WORKFLOW.md` and `replit.md`.

DoorLink is free to use, with a peer-to-peer marketplace — anyone with an
account can list a part for sale, and buyers connect with sellers directly
(contact reveal, not a payment checkout) to arrange the exchange themselves.

## Getting started

```bash
npm install
cp .env.example .env          # set DATABASE_URL at minimum
npx prisma generate
npx prisma db push
npm run db:seed               # loads clearly-labelled demo catalogue data
npm run dev
```

Open http://localhost:3000.

Without `DATABASE_URL`, the site still renders — the finder shows an honest
"catalogue not connected" state rather than fake products.

## Demo accounts

Seeded for local development only. The dev session provider refuses to run in
production and sets no passwords.

`customer@demo.doorlink` · `technician@demo.doorlink` · `supplier@demo.doorlink` ·
`manufacturer@demo.doorlink` · `admin@demo.doorlink`

## Two rules that shape the code

**Nothing pretends to be live.** `src/lib/integrations.ts` is the single place that
decides whether payments, storage, email or AI are configured. Features check it and
render `<NotConnected />` when the answer is no.

**Nothing pretends to be verified.** Every catalogue record carries a `DataSource`,
and `<SourceBadge />` renders it. Seed data is invented and labelled as demo.

## Layout

```
prisma/schema.prisma     30-model relational schema
prisma/seed.ts           demo data, invented brands only
src/lib/rbac.ts          permission matrix — the source of truth for access
src/lib/auth.ts          session interface; swap the provider, not the call sites
src/lib/integrations.ts  what is actually connected
src/components/ui/       design system primitives
src/components/finder/   the product finder cascade
src/app/api/finder/      one endpoint, all five finder steps
```

See `DEVELOPMENT.md` for build status and what is outstanding.
