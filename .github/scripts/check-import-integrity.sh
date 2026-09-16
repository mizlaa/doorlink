#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

fail() {
  echo "import-integrity: $*" >&2
  exit 1
}

for forbidden in pnpm-workspace.yaml; do
  if [[ -f "$forbidden" ]]; then
    fail "forbidden file present: $forbidden"
  fi
done

if [[ -d .migration-backup ]] && [[ ! -d src/app ]]; then
  fail ".migration-backup present and src/app missing — possible Replit port"
fi

if [[ -d artifacts ]] && [[ ! -f src/app/page.tsx ]]; then
  fail "artifacts/ present without src/app/page.tsx — possible Agent scaffold"
fi

for required in src/app prisma/schema.prisma next.config.mjs .replit package.json; do
  if [[ ! -e "$required" ]]; then
    fail "required path missing: $required"
  fi
done

if grep -q 'stack = "PNPM_WORKSPACE"' .replit 2>/dev/null; then
  fail ".replit contains PNPM_WORKSPACE agent stack"
fi

echo "import-integrity: ok"
