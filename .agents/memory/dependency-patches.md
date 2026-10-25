---
name: Dependency patch boundaries
description: Why the project uses targeted transitive security overrides and a constrained Capacitor CLI
---

Prefer targeted security patches while retaining the existing Next and Tailwind major versions. Reassess the transitive overrides when upstream releases include safe dependency versions; do not remove them merely because the parent package is updated.

**Why:** Security remediation otherwise required unrelated framework and CSS migrations. The patched PostCSS/parser/nesting combination was checked with the production build and a rendered homepage. The Capacitor CLI was constrained to a safe release because its newer branch brought in a vulnerable UUID dependency.

**How to apply:** Check both the resolved dependency tree and the audit before relaxing constraints. For PostCSS, use an npm override referencing the direct dependency via `$postcss`; installing an explicit package version can conflict with an independently specified override.
