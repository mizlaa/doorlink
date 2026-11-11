# Operating Doorlink: setup, security and checks

This covers the scheduling, invoicing, branding and security features added
in November 2026, and what has to be configured on the host before real
customers use them. Everything below was verified **locally only** (a local
Postgres 16 database and the Next.js dev and production builds in a cloud
container). Nothing was run against staging or production.

## 1. Database changes (needs your approval before production)

The project uses `prisma db push`, so there is no migrations folder. The new
tables and columns are written out as plain, additive SQL so they can be
reviewed and applied deliberately:

| File | What it does | Destructive? |
| --- | --- | --- |
| `prisma/sql/2026-11-operations.sql` | New tables (customers, properties, measure requests, appointments, invoices, payments, receipts, stock, team, MFA, rate limits) and new nullable/defaulted columns on `Job`, `BusinessProfile`, `User` relations, enum values | No `DROP`, no column type changes |
| `prisma/constraints.sql` | `btree_gist` extension and the exclusion constraint that makes double-booking a technician impossible at the database level | No |
| `prisma/rls.sql` | Turns on row level security for every table (no policies), so Supabase's public API returns nothing | No |

Steps, against a **copy** of production first:

```bash
# 1. Back up and prove the backup restores (see section 6)
DATABASE_URL=... scripts/ops/backup-restore-check.sh ./backups
# 2. Apply the additive schema, then the constraint, then RLS
npx prisma db execute --file prisma/sql/2026-11-operations.sql --schema prisma/schema.prisma
npm run db:constraints
npm run db:rls
# 3. Confirm nothing is left to apply (should print "This is an empty migration.")
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Replit note: the enum `AssetType` is mapped to `asset_type` in the schema. If
a database still has the old name, `prisma db push` will offer to drop data;
rename instead: `ALTER TYPE "AssetType" RENAME TO asset_type;`.

## 2. Environment variables (Replit Deployments → Secrets)

| Variable | Needed for | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | Signing share links, the two-step cookie, recovery code hashes | Long random value. Required in production. |
| `MFA_ENCRYPTION_KEY` | Encrypting authenticator secrets | Optional (falls back to `AUTH_SECRET`); never change it once set |
| `NEXT_PUBLIC_SITE_URL` | Links in emails, Stripe return URLs, password reset links | e.g. `https://doorlink.com.au` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sending invoices, reminders | `EMAIL_FROM` must be on a domain verified in Resend |
| `RESEND_WEBHOOK_SECRET` | Marking invoice emails delivered/bounced | From the Resend webhook you create in step 3 |
| `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Customers paying invoices by card into the company's own Stripe account | Use test-mode keys in staging |
| `CRON_SECRET` | `/api/cron/jobs` (daily) and `/api/cron/reminders` (hourly) | |
| `TRUSTED_PROXY_HOPS` | Rate limits keyed on the real client address | See section 5 |
| `MFA_REQUIRE_ADMIN` | Requiring two-step sign-in for admins outside production | Production always requires it |

## 3. Provider settings

**Stripe (Connect).** In the Stripe dashboard → Developers → Webhooks, add an
endpoint `https://<site>/api/webhooks/stripe-connect` listening to
**events on Connected accounts**: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`payment_intent.payment_failed`, plus the account and charge events the
existing job payments already use. Copy its signing secret into
`STRIPE_CONNECT_WEBHOOK_SECRET`. An invoice payment is shown as paid only
when this signed event arrives; returning from Stripe shows "waiting for the
card provider to confirm".

**Resend.** Verify the sending domain (SPF/DKIM). Add a webhook to
`https://<site>/api/webhooks/resend` for `email.delivered`, `email.bounced`
and `email.complained`; put its secret in `RESEND_WEBHOOK_SECRET`. Without
it, invoice emails show as "Sent" (accepted by Resend), never "Delivered".

**Supabase Auth.** Authentication → URL configuration: add
`https://<site>/auth/confirm` to the redirect URLs, and set the "Reset
password" email template's link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`.

**Scheduled jobs.** Replit Deployments has no built-in cron for
autoscale/GCE apps; use Replit's Scheduled Deployments or any external
scheduler to call:

```
GET https://<site>/api/cron/reminders   (hourly)   Authorization: Bearer $CRON_SECRET
GET https://<site>/api/cron/jobs        (daily)    Authorization: Bearer $CRON_SECRET
```

Both are safe to run twice: each reminder is claimed before it is sent.

**SMS.** Not connected. Reminders go in-app and by email only.

## 4. Two-step sign-in and account recovery

- Any account can turn it on at **Account → Sign-in security**. Admin
  accounts must (in production the admin area redirects them there).
- Once on, the account counts as signed out everywhere until a code is
  entered; the code is remembered in that browser for 12 hours.
- Lost phone: use one of the ten recovery codes (each works once; the
  owner is notified and told how many remain).
- Lost phone **and** codes: another admin opens **Admin → Users**, checks
  the person's identity outside Doorlink, and uses **Reset two-step** with a
  written reason (recorded in the audit log, the person is notified).
- The only admin is locked out: whoever has database access runs
  `npm run mfa:reset -- person@example.com "how identity was confirmed"`.
- Password reset (Supabase sign-in): **Sign in → Forgot your password?**.
  Rate limited, and it gives the same answer whether or not the account
  exists.

## 5. Hosting and edge protection (Replit)

Doorlink runs as a Replit Deployment (`deploymentTarget = "gce"`,
`npm run build` then `npm run start`) with Replit Postgres. Replit
terminates TLS and proxies requests; it does not offer a configurable WAF.
What the app does itself:

- Database-backed rate limits on sign-in (per network and per account),
  registration, password reset, two-step codes, public forms, quote
  comparison, measure requests, invoice links and invoice sending.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and HSTS in production.
- `TRUSTED_PROXY_HOPS`: send a request to the deployed site and log the
  `X-Forwarded-For` header. If Replit's proxy *appends* the client address,
  set this to the number of proxy entries after it (usually `1`). Until it
  is set the first entry is used, which a determined attacker can forge to
  dodge per-network limits (per-account limits still apply).
- If you need bot protection or a WAF, put Cloudflare (or similar) in front
  of the custom domain.

## 6. Backups

`scripts/ops/backup-restore-check.sh` dumps the database, restores it into
a scratch database on the same server, compares every table's row count,
checks the no-double-booking constraint survived, and drops the scratch
copy. Run it before applying section 1 and on a schedule. Local result
(11 Nov 2026): 109 tables restored, every count matched, constraint present.

## 7. Checks you can rerun

| Command | What it proves | Where it ran |
| --- | --- | --- |
| `npm test` | 1,182 unit tests (GST maths, time zones incl. Sydney daylight saving, calendar layout, TOTP RFC vectors, logo builder, webhook signatures…) | Local |
| `npm run test:db` | Two companies + two customers on a real database: isolation, concurrent bookings, double issue, duplicate payments, repeated card notifications, failed then retried email | Local Postgres |
| `npm run lint`, `npx tsc --noEmit`, `npm run build` | Lint (0 errors), types, production build | Local |
| `npm audit` | 0 known vulnerabilities | Local |
| `scripts/ops/backup-restore-check.sh` | Restore works | Local |
