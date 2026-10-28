# Manual database seed data

Structured manufacturer, model and document records for Doorlink's
manual library. One JSON file per manufacturer, validated and imported
by `scripts/import-manuals.ts`.

## The rule this data follows

**Nothing in here was invented.** Every model name, model code and URL
came from a real search result or a real page. Where a model was looked
for and not found, it is absent — not guessed at.

## Why everything says `UNVERIFIED`

Verification means fetching the URL and confirming the document is
there. The environment this data was assembled in **cannot reach
manufacturer websites** — its egress proxy refuses every one of them:

```
https://www.bnd.com.au/          → 000 (blocked)
https://www.gliderol.com.au/     → 000 (blocked)
https://www.ata-australia.com.au/→ 000 (blocked)
https://www.merlin.com.au/       → 000 (blocked)
```

A search index having seen a URL is evidence it existed when indexed.
It is not evidence it resolves today, that it is the document the title
claims, or that it is not behind a login. Marking these `REACHABLE`
would be exactly the fabrication the brief forbids.

So every record ships as `UNVERIFIED`, and the UI says so. To turn that
into real verification, run the checker somewhere with normal network
access:

```bash
npm run manuals:verify
```

It fetches each URL, records the HTTP status, and promotes records to
`REACHABLE`, `REDIRECTED`, `BROKEN` or `RESTRICTED` based on what
actually came back. Nothing is deleted on failure — it is flagged.

## `origin` vs `verification`

Two separate questions, deliberately not collapsed:

- **`origin`** — who published it. `MANUFACTURER_ORIGINAL` for a URL on
  the manufacturer's own domain; `THIRD_PARTY_GUIDE` for a reseller or
  manual-aggregator mirror.
- **`verification`** — has anyone confirmed the link works.

A record can be `MANUFACTURER_ORIGINAL` and `UNVERIFIED` at once, and
that is most of this file. The UI only shows an "official" badge when
both hold.

## Adding a manufacturer

Copy the shape of an existing file. Required: `manufacturer.name`,
`manufacturer.slug`, and for each document a `title`, `kind` and
`sourceUrl`. A model with no located documentation is still worth
recording — `documents: []` makes the model searchable and tells the
next person it was looked for.

Nothing here requires a code change. `scripts/import-manuals.ts` reads
every `*.json` in this directory.

## Motor ratings (`specs`, `specSource`, `summary`)

A model can carry its published ratings as `specs` — label, value and
optional unit — which the import writes to the model's spec rows. The
labels in `src/lib/motors/specs.ts` (`Operator`, `Max gate weight`,
`Max leaf length`, `Leaf weight by length`, `Torque options` and so on)
are what the designer reads back to shortlist a motor for a gate or
shutter; any other label is simply shown on the model page.

Rules:

- `specs` without a `specSource` (`url` and `note`) fail validation. The
  note says what kind of source it is, and says so plainly when it is a
  reseller rather than the manufacturer.
- Where sources disagree, the lower (safer) figure is used and the note
  says so. Where a figure could not be pinned down it is left out, not
  guessed.
- `Operator` must be one of the values in `OPERATORS`; a model without it
  is still catalogued but never recommended.
- When `specs` is present the import replaces that model's spec rows;
  when it is absent the rows are left alone.
