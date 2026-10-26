---
name: Workflow port conflicts
description: Stale Next processes cause port conflicts and overlapping builds can break live preview assets.
---

If the Start application workflow reports a startup or runtime failure while port 5000 already returns the app, check for an orphaned Next process before changing application code. Stop the stale process and restart the managed workflow once.

**Why:** The workflow wrapper can be marked finished even though its previous child remains bound to port 5000, causing the replacement process to fail with `EADDRINUSE`.

**How to apply:** Confirm the listener and HTTP response on port 5000, inspect the workflow log for `EADDRINUSE`, then clean up only the stale process tree and verify the restarted workflow reaches `Ready`.

Do not rebuild into the output directory of a running production-mode preview. Keep ordinary builds isolated from preview assets and hold a single-owner lock across preview build and serving.

**Why:** An orphaned preview server remained live while a replacement startup rebuilt the same output, then failed on the occupied port. During this overlap the user saw a completely unstyled mobile page. Fresh requests after a build can look healthy again, so a later screenshot alone does not rule out the underlying overlap.

**How to apply:** Preserve build isolation and process-tree shutdown when changing preview commands. Verify referenced CSS and JavaScript assets over the proxy, including while an ordinary build runs; checking only HTML status is insufficient. A lock conflict should fail before building, not replace assets under the existing server.