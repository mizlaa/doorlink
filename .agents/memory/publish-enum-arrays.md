---
name: Publish enum-array quoting
description: Rationale for a lowercase physical enum name while keeping application enum names unchanged
---

Preserve the lowercase physical database name for the asset-type enum even though the application enum remains PascalCase.

**Why:** Publish's schema serializer emitted an extra quote in array columns using a mixed-case enum identifier. PostgreSQL's development catalogs and Prisma schema were valid, but the generated creation SQL was not. A lowercase physical enum name avoided the quoting defect without changing the enum labels, array semantics, or application API.

**How to apply:** If this recurs with another enum array, inspect the actual generated SQL and catalog types before changing anything. Keep the source-of-truth mapping and development database synchronized. An in-place development enum rename preserves the type identity and its dependents; avoid drop/recreate or converting arrays to text as a workaround. Recompute the publish diff afterward, especially if production already contains the old enum, and do not assume a rename will be safe there. Production changes remain owned by Publish.
