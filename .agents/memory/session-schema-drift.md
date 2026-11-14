---
name: Signed-in schema drift
description: Anonymous route checks do not exercise database-backed signed-in session relations.
---

Check an existing-account session query and the database schema difference when a signed-in visitor sees a server exception but anonymous requests succeed.

**Why:** Adding account security relations to session loading made every signed-in page depend on tables absent from the database. Anonymous smoke checks skipped the session query and therefore missed the failure.

**How to apply:** Treat missing-table errors as schema drift, not an unavailable database or a signed-out session. Compare the full schema before syncing development; keep production schema changes in Publish. Do not bypass MFA or swallow schema errors as a fix.
