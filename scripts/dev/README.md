# Dev-only scripts

Local development helpers. They write to whatever database `DATABASE_URL`
points at, so they belong on a demo database and nowhere else. None of
them are imported by the application.

- `reset-marketplace.ts` — clears marketplace activity (leads, quotes,
  jobs, transactions, reviews) and resets the cached technician rating
  counters, so the post → quote → hire → complete → review flow can be
  walked from a known-empty state.
- `seed-demo-lead.ts` — posts one demo job request, for when you want to
  exercise the technician side without filling in the public form.
- `reset-commission.ts` — puts the commission rate back to its default
  and clears its change history, so `/admin/settings` can be walked from
  a known starting point.
- `seed-demo-dispute.ts` — puts a job into dispute and files a report, so
  `/admin/disputes` and `/admin/reports` have something real in them.
  Creates the job first if none exists.

## A trap worth knowing

Do not run `npm run build` while `npm run dev` is running. They share
`.next`, and the build overwrites the chunks the dev server is serving —
every script and stylesheet then 404s, nothing hydrates, and the app
looks fine while every button is dead. It presents as a mysterious UI bug
rather than a build problem. If interactivity stops working for no
reason: stop dev, `rm -rf .next`, start dev again.
