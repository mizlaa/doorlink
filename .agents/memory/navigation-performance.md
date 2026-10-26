---
name: Navigation performance
description: Constraints behind navigation optimization and the choice to retain the stable development compiler
---

Distinguish cold development compilation from steady-state request latency before attributing a slow click to network or database performance.

**Why:** First visits in the development preview spend time compiling routes even when subsequent requests are fast. Loading boundaries and transition feedback improve responsiveness but cannot remove compilation. A compiler switch exposed CSS parsing and forwarded server-action type-export errors that the established compiler did not have.

**How to apply:** Keep the established compiler unless its compatibility with the current CSS and server-action setup is verified. Do not use a compiler switch as an assumed speed fix. Measure cold and warm requests separately, and do not present development-preview timings as published-site timings.

Session deduplication must stay scoped to a single server request/render, not a process-wide or shared persistent cache.

**Why:** Shared layout components and pages need the same session, but cross-request caching risks leaking one user's identity to another. Anonymous cookie-free requests can skip session verification; cookie-bearing requests still require the real authentication provider.

**How to apply:** Preserve provider verification for all session cookies, including chunked cookies. Never replace verification with trusting decoded cookie contents, or make speed changes that share authenticated results across users.
