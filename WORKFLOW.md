# Working in Replit and Claude Code on the same project

Two tools, one codebase, nothing handed over and nothing lost.

**GitHub is the connection.** Replit and Claude Code never talk to each
other. They both read and write this repository, and that is the whole
mechanism. Switching tools is just a matter of pushing before you leave
and pulling before you start.

```
                    ┌──────────────────────────┐
                    │   github.com/mizlaa/      │
                    │        doorlink          │
                    │                          │
                    │   main  ← the truth      │
                    └────────┬─────────┬───────┘
                       pull  │         │  pull
                       push  │         │  push
              ┌─────────────▼──┐   ┌──▼──────────────┐
              │     Replit     │   │  Claude Code    │
              │                │   │                 │
              │  interface,    │   │  backend, data, │
              │  styling, 3D   │   │  features, APIs │
              │                │   │                 │
              │ branch:        │   │ branch:         │
              │ replit-ui-     │   │ claude/*        │
              │ improvements   │   │                 │
              └────────────────┘   └─────────────────┘
```

## The rule that keeps it safe

**Neither tool commits directly to `main`.** Each works on its own
branch and `main` only changes through a merged pull request. That is
what makes this reversible: if a design pass goes wrong, the branch is
abandoned and nothing is lost, because `main` never moved.

It also means the two sides can never overwrite each other. Git merges
their changes, and where they genuinely touched the same line it stops
and asks rather than silently picking one.

## Who owns what

Set out in full in `FRONTEND_HANDOFF.md` §8. In short:

|                            | Replit            | Claude Code    |
| -------------------------- | ----------------- | -------------- |
| `src/components/ui/`       | owns              | does not touch |
| `tailwind.config.ts`       | owns              | does not touch |
| `src/app/globals.css`      | owns              | does not touch |
| Markup inside `return()`   | owns              | does not touch |
| `src/components/three/`    | owns              | does not touch |
| `src/lib/`                 | does not touch    | owns           |
| `prisma/`                  | does not touch    | owns           |
| Server actions, API routes | does not touch    | owns           |
| New routes                 | styles them after | creates them   |
| `package.json`             | shared            | shared         |
| `package-lock.json`        | shared            | shared         |
| `.replit`                  | shared            | shared         |

### Conflict hotspots

When git stops with a conflict, use these rules:

| File | Why it collides | Resolution |
| ---- | --------------- | ---------- |
| `Header.tsx`, `MobileTabBar.tsx`, `admin/layout.tsx` | Nav arrays — design restructures; backend adds entries | Keep **every** entry from both sides. They are permission-gated. |
| `package.json` | Fonts vs server deps | **Union** of both. Never take one side wholesale. |
| `package-lock.json` | Follows `package.json` | After merging deps, run `npm install` and commit the lockfile. |
| Route `page.tsx` | Design changes markup; backend changes data | Design owns JSX **inside** `return()`. Backend owns imports and logic **above** it. |
| `.replit` | Replit may rewrite on import | Must stay npm + Next.js. See `replit.md`. |

## Going to Replit to design (phone checklist)

1. Open **your** Repl (keep it **private** — GitHub can be public without the Repl being public).
2. Open the **Git** pane → **Pull** from `main`.
3. Confirm the branch is **`replit-ui-improvements`**, not `main`.
4. Design.
5. **Commit and push** before you stop — even mid-way. Unpushed work in a Repl can be lost if the container is reclaimed.

## Coming back to Claude Code to build

1. Open a **pull request** from `replit-ui-improvements` (or from `claude/<feature>` for backend work).
2. Review the diff. Resolve conflicts using the table above.
3. Merge into `main` when CI is green.
4. In Claude Code: pull `main`, then start a fresh branch `claude/<feature>` for the next piece of work.

Nothing needs migrating and nothing needs re-importing. The repository
is the project; both tools are just views onto it.

## Public GitHub, private Repl

The repository may be public. That does **not** mean the Repl should be
public. A public Repl running `npm run dev` with seeded demo accounts
(including `admin@demo.doorlink`) is a passwordless admin session — keep
the Repl private and do **not** click **Deploy** unless you intend a
production deployment (auth refuses to run in production anyway).

Do not merge **unsolicited pull requests** from strangers without reading
the full diff. Fork PRs can trigger GitHub Actions — approve first-time
contributors only when you trust the change.

Do not make the repository **private** again on GitHub Free without a plan:
classic branch protection on `main` stops working on private repos unless
the account has GitHub Pro.

## Stop — do not keep going if any of these happen

- You are on **`main`** in the Repl Git pane when about to commit.
- Replit or Agent offers to **port**, **migrate**, or convert to **pnpm workspace**.
- The file tree shows `pnpm-workspace.yaml` and `artifacts/` instead of `src/app/` and `prisma/`.
- You see **`.migration-backup/`** at the root and the real app is missing from the root.
- Git reports a **merge conflict** you cannot resolve on a phone — stop and ask for help.
- You clicked **Deploy** by mistake.
- The preview is a blank iframe — may be headers or a broken dev server; stop before asking Agent to “fix” the stack.

## If Replit offers to "port" or "migrate" the project

**Decline it, every time.**

Replit detects Next.js and offers to convert the project to its own
`PNPM_WORKSPACE` stack. That is a framework migration, not an import: it
moves the real application into `.migration-backup/` and leaves an empty
Express + Drizzle scaffold at the root. It has happened before on this project.

There is **no guaranteed silent fix** — `.replit` and `replit.md` reduce
the risk; they do not remove the offer. Import from **GitHub only**, never
**Import from Vercel** (that path is a migration).

### Recovery (git first)

On the design branch (usually `replit-ui-improvements`):

```bash
git fetch origin
git reset --hard origin/replit-ui-improvements
```

If the bad files were **never committed**, you can copy back from
`.migration-backup/` — but prefer resetting from GitHub. Do not gitignore
`.migration-backup/`; you need to see it if it appears.

## Setting up the database in a fresh Repl

Import from **GitHub** (`mizlaa/doorlink`), not Vercel. Once, per Repl:

1. Add **Secrets**: `DATABASE_URL` and `DIRECT_URL` (Replit Postgres or your URL).
2. Run:

```
npm install
npm run db:push     # creates the tables from prisma/schema.prisma
npm run db:seed     # loads the demo catalogue and demo accounts
npm run dev
```

If the home page returns a 500 with a message about a missing table,
`db:push` has not been run against that database. That failure is
deliberately loud: a database that is reachable but empty is a broken
deployment, not an outage, and it should not quietly render a page with
everything blank.

## If the Repl disappears

Three Repls for this project have vanished before. **GitHub is the backup.**
If a container is gone, import again from GitHub, checkout
`replit-ui-improvements`, pull, set Secrets, run `db:push` and `db:seed`.
Anything never pushed is lost.

## Replit Git pane tips

- Turn on **Show hidden files** if you need to confirm `.replit` was not rewritten.
- Confirm the remote is `mizlaa/doorlink` — same repo, not a copy.
- Do not run `npm run build` while `npm run dev` is running (they share `.next`).

See also `replit.md` and `HANDOVER.md` (freelancer setup notes for branch protection and Replit).
