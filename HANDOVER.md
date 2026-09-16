# Doorlink workflow handover (for mizlaa)

Short admin steps the freelancer cannot click for you (WRITE access only).

## 1. Protect `main` (GitHub Free, public repo)

Settings → Branches → **Add branch protection rule** → branch name `main`:

1. **Require a pull request before merging**
2. **Do not allow bypassing** (include administrators if offered)
3. Block **force pushes** and **branch deletion**
4. After the workflow-lock PR has a **green CI run**, enable **Require status checks**
   and select the **CI / verify** job

Do **not** use “Restrict who can push” (personal repos / org-only).

Verify (or ask the freelancer to run):

```bash
gh api repos/mizlaa/doorlink/branches/main/protection
```

If this returns `404`, protection is not on yet.

**If you make the repo private again** on GitHub Free without Pro, this
protection stops working.

## 2. Connect Replit (your account)

1. [replit.com/import](https://replit.com/import) → **GitHub** → `mizlaa/doorlink`
2. Never Import from Vercel
3. Confirm tree: `src/app/`, `prisma/`, `next.config.mjs`, `.replit`
4. Git pane: checkout **`replit-ui-improvements`**, not `main`
5. Secrets: `DATABASE_URL`, `DIRECT_URL`
6. Once: `npm install`, `npm run db:push`, `npm run db:seed`, Run
7. Keep the Repl **private**. Do not Deploy for design work.

**Connected** when a commit you make on `replit-ui-improvements` in Replit
appears on GitHub.

## 3. Day to day

See `WORKFLOW.md` (written for phone use).

## 4. Safety reminders

- Do not merge unsolicited PRs from strangers without reading the full diff.
- Decline Replit “port to pnpm workspace” every time.
- Ping the freelancer on merge conflicts in nav files or `package.json`.
- Agent is not a second backend — do not let it rewrite the stack.

## 5. Freelancer throwaway import

The freelancer may import once on their own Replit to test the importer,
then delete that Repl. **Your** Repl above is the real one.
