# Delivery note

GitHub is the source of truth. Replit (UI) and Claude Code (backend) only
push and pull branches. `main` moves through pull requests.

## Once, after this PR merges

1. On `replit-ui-improvements`, pull or merge `main` and push so the Repl
   has these docs and CI.
2. Protect `main` (you must click this — collaborators have WRITE only):
   see `HANDOVER.md` §1. Require a pull request; block force-push.
3. Replit: Import from **GitHub** (`mizlaa/doorlink`), never Vercel. Cancel
   any “port to pnpm workspace” Agent task. Branch:
   `replit-ui-improvements`. Secrets: `DATABASE_URL` and `DIRECT_URL`
   (same URL is fine). Then `db:push` and `db:seed`.
4. Keep the Repl private. Use **Invite** for collaborators.

## Day to day

- Phone steps: `WORKFLOW.md`
- File ownership: `FRONTEND_HANDOFF.md`
- Review (what is a bug vs intentional): `REVIEW.md`

## Limitation

Replit Agent still auto-starts a Vercel / `PNPM_WORKSPACE` port after
GitHub import. Recovery is git (`git reset --hard origin/replit-ui-improvements`),
not a silent `.replit` switch. Do not make the repository private again
on GitHub Free without Pro, or branch protection on `main` stops working.
