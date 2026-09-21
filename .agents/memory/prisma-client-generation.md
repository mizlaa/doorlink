---
name: Prisma client generation
description: The checked-in Prisma schema and generated client can drift after merges in this workspace.
---

Run `npx prisma generate` before diagnosing Prisma enum, relation, or model-property type errors after schema or branch changes.

**Why:** A stale generated client previously reported many missing enums and relations even though the current schema already defined them; regeneration restored typecheck without source changes.

**How to apply:** Regenerate before editing application code when Prisma imports or delegate properties suddenly appear missing, then rerun typecheck and tests.