# Delivery status (freelancer)

Last updated after workflow-lock implementation.

## Done

- [x] **WP1** — Review hazards documented in updated `WORKFLOW.md` / `FRONTEND_HANDOFF.md`
- [x] **WP2** — Branch `claude/workflow-lock`, PR [#4](https://github.com/mizlaa/doorlink/pull/4), **CI green**
- [x] **WP3** — Branch `replit-ui-improvements` pushed from current `main` (same SHA as `main` at creation time)

## Needs you (client / merge)

- [ ] **Merge PR #4** into `main` (green CI). Freelancer merge was not applied from this environment.
- [ ] After merge: on `replit-ui-improvements`, run `git pull origin main` (or merge `main`) so the design branch includes workflow docs and CI.
- [ ] **WP4** — `mizlaa`: enable branch protection per `HANDOVER.md`. API still returns `404` until then.
- [ ] **WP5b** — Client Replit: import from GitHub, private Repl, `replit-ui-improvements`, secrets, `db:push` / `db:seed`, prove push to GitHub.

## Needs you (freelancer)

- [ ] **WP5a** — Throwaway Replit import: `docs/THROWAWAY_REPLIT_CHECKLIST.md`, then delete Repl.
- [ ] **WP7** — Full checklist: `docs/PRE_SUBMIT_VERIFICATION.md` before Fiverr delivery.

## Recovery drill (WP6)

Primary recovery (documented in `WORKFLOW.md`):

```bash
git fetch origin
git reset --hard origin/replit-ui-improvements
```

Confirm `src/app/` and `prisma/` remain. Do not treat `.migration-backup/` shuffle as the first step if git history is intact.

## Honest limitation

Replit may still offer PNPM_WORKSPACE port. `.replit`, `replit.md`, and CI guard reduce risk; they do not remove the UI offer.
