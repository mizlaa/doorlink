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

Authentication outages must not hold public navigation open for the provider SDK's full refresh-retry window.

**Why:** A DNS failure in the configured authentication endpoint combined with existing session cookies held page requests for about 30 seconds. A fetch timeout alone is insufficient because the SDK retries refreshes after network errors.

**How to apply:** Bound the complete authentication operation, suppress late cookie writes and additional network attempts after it ends, and keep any shared outage cooldown limited to service availability—not user/session data. Preserve cookies on network failure; report the outage explicitly rather than bypassing verification. Middleware may refresh cookies without trusting their user data; server authorization must still verify the user.
