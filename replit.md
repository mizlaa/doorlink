# Doorlink on Replit

This project is **Next.js 15**, **npm**, **Prisma 5**, and **PostgreSQL**.
It is not a pnpm workspace, not Express, and not Drizzle.

## Import

- Use **Import from GitHub** → `mizlaa/doorlink`.
- Do **not** use Import from Vercel, Bolt, Lovable, ZIP, or Empty + Agent migration.

## Run

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

The root `.replit` file sets `npm run dev` on port `$PORT`.

## Agent / port offers

If Replit or Agent offers to **port**, **migrate**, or convert to
`PNPM_WORKSPACE`: **decline**. That moves the real app into
`.migration-backup/` and replaces the root with a scaffold.

Do not add `[agent] stack = "PNPM_WORKSPACE"` to `.replit`.

## Design work

Use branch **`replit-ui-improvements`**, not `main`. Push before you stop.
