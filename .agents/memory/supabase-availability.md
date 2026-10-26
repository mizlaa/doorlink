---
name: Supabase project availability
description: A paused authentication project can cause DNS failure even when the saved URL and keys match.
---

Check the existing Supabase project's pause state before assuming DNS failure means the saved URL is wrong or replacing the authentication provider.

**Why:** The configured project failed both server and independent DNS resolution while its URL matched the project references in both unexpired keys. The user found paused projects and resumed them; the original endpoint then accepted the saved key and answered authentication requests normally.

**How to apply:** Compare configuration internally without printing secrets, distinguish DNS failure from rejected credentials, and have the project owner check pause/restore status. Preserve existing accounts and credentials when service restoration is sufficient. Never infer that a project was deleted solely from NXDOMAIN.
