---
name: Replit preview framing
description: Keep Replit's embedded development preview compatible with app-level anti-framing security headers.
---

Production should retain `X-Frame-Options: DENY`; the optimized Replit preview needs a separate, narrowly scoped `frame-ancestors` policy for Replit preview hosts.

**Why:** A global deny-framing header makes the app's development URL fail inside Replit Preview with `ERR_BLOCKED_BY_RESPONSE`, even when the server and routes return HTTP 200.

**How to apply:** Gate the preview framing policy on the preview-only environment flag, verify the proxied response headers, and confirm production configuration still denies framing.
