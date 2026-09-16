## Branch

- [ ] This PR targets `main` from `replit-ui-improvements` or `claude/*`
- [ ] I did not commit directly to `main`

## Ownership (check what applies)

- [ ] Nav arrays (`Header.tsx`, `MobileTabBar.tsx`, `admin/layout.tsx`): kept **all** entries from both sides if merged
- [ ] `package.json` / `package-lock.json`: union of dependencies, lockfile updated with `npm install` if needed
- [ ] Route `page.tsx`: design changes only inside `return()`; backend changes only above it
- [ ] `.replit` still runs **npm** + Next.js (no `PNPM_WORKSPACE`, no Express/Drizzle scaffold)

## Replit import safety

- [ ] No `pnpm-workspace.yaml`, Agent `artifacts/` scaffold, or committed `.migration-backup/` takeover
- [ ] `src/app/`, `prisma/`, and `next.config.mjs` still present

## Notes

<!-- Optional: what changed and what the other side should pull -->
