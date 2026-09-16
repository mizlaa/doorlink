# Codebase review (workflow job)

Reviewed 16 September 2026 against github.com/mizlaa/doorlink. This is a
workflow and collision review, not a feature audit. Nothing below is a
request to finish payments, auth, or the 3D scene.

## Will collide (Replit vs Claude Code)

- Navigation arrays in `Header.tsx`, `MobileTabBar.tsx`, and
  `admin/layout.tsx`. Keep **every** entry from both sides; they are
  permission-gated. Dropping one hides a working screen.
- `package.json` and `package-lock.json`. Union of dependencies, then
  `npm install`. Never take one side wholesale.
- Route `page.tsx` files. Design owns JSX inside `return()`. Backend owns
  queries and data loading above it. Git does not know that rule — it is a
  human merge convention.
- `.replit`. Replit or Agent may rewrite it on import. It must stay
  **npm + Next.js**, not `PNPM_WORKSPACE`.

`FRONTEND_HANDOFF.md` §7 was stale: `/search`, `/welcome`, and admin
users / reports / disputes / subscriptions / metrics already exist. §8
said Claude keeps committing to `main`. Both are corrected in this
change set. See `WORKFLOW.md` for the day-to-day rules.

## Replit import (proven on a live import)

Import from **GitHub** still auto-starts Agent’s “Port imported Vercel
app” into a pnpm workspace. The real application is moved to
`.migration-backup/` and a scaffold (`artifacts/`, `pnpm-workspace.yaml`)
lands at the root. `.replit` and `replit.md` do **not** switch that
offer off.

Always: Import GitHub only — never Import from Vercel. Cancel the port
task immediately. If the scaffold is already there:

```bash
git fetch origin
git reset --hard origin/replit-ui-improvements
rm -rf artifacts lib .migration-backup pnpm-workspace.yaml pnpm-lock.yaml
```

Do not delete `src/lib/`. Do not push the scaffold to GitHub.

Secrets: `DATABASE_URL` and `DIRECT_URL`. On Replit they may be the same
URL. A 500 on `/` about a missing `Document` table means `npm run db:push`
has not run. That failure is intentional and should stay loud. Then
`npm run db:seed`.

Keep the Repl **private**. Invite collaborators with **Invite** — do not
share the Replit password. Do not Deploy for design work.

## Not bugs — do not “fix”

- `PaymentsNotConfiguredError` and no Subscribe button
- Entitlements gate returns an empty set by default
- `<NotConnected />` across many files
- Passwordless dev-only auth that refuses to run in production
- Placeholder 3D garage

The project must not look live where the provider is missing.

## Tooling notes

- CI uses Node 22. `npm ci` needs `package-lock.json` in sync with
  `package.json`.
- `npm run lint` has no ESLint config in the tree.
- Schema is applied with `prisma db push`. There is no
  `prisma/migrations/` history in git.
