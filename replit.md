# Doorlink on Replit

Next.js 15, **npm**, Prisma 5, PostgreSQL. Not pnpm, not Express, not Drizzle.

## Connect (do not use GitHub Import)

Replit **Import from GitHub** auto-starts Agent “Port imported Vercel app” when
`package.json` depends on **`next`**. That cannot be fixed without removing
Next.js. Doorlink must keep `next`.

**Use a Blank Repl and attach the existing repo** — see **Setting up a fresh
Repl** in `WORKFLOW.md`. Never use `replit.com/import` or Import from Vercel.

## Run (after connect)

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

The workspace Run button uses `npm run preview` (build, then production
server on port 5000), so client demonstrations do not compile each page
on its first visit. After editing, restart **Start application** to rebuild
the preview. For hot-reload development, use `npm run dev` instead.

Secrets: `DATABASE_URL` and `DIRECT_URL` (same Postgres URL on Replit).

## Design branch

Use **`replit-ui-improvements`**, not `main`. Push before you stop.
