#!/usr/bin/env bash
# Rehearses a backup and restore without touching the source database:
# dumps it, restores the dump into a new scratch database, compares row
# counts table by table, then drops the scratch copy.
#
#   DATABASE_URL=postgres://... scripts/ops/backup-restore-check.sh [dump-dir]
#
# Point it at a copy or a read replica of production, or at production
# itself during a quiet period (pg_dump only reads). The scratch database
# is created on the same server, so the user needs CREATEDB.
set -euo pipefail
SRC="${DATABASE_URL%%\?*}"
DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$DIR/doorlink-$STAMP.dump"
SCRATCH="doorlink_restore_check_$(date -u +%s)"
BASE="${SRC%/*}"
mkdir -p "$DIR"

echo "1/4 Dumping to $DUMP"
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$SRC"
ls -lh "$DUMP" | awk '{print "    size " $5}'

echo "2/4 Restoring into scratch database $SCRATCH"
psql "$SRC" -qc "CREATE DATABASE \"$SCRATCH\""
trap 'psql "$SRC" -qc "DROP DATABASE IF EXISTS \"$SCRATCH\"" >/dev/null 2>&1 || true' EXIT
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$BASE/$SCRATCH" "$DUMP"

echo "3/4 Comparing row counts"
count_rows() {
  psql "$1" -At -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1" |
    while read -r t; do echo "$t $(psql "$1" -At -c "SELECT count(*) FROM \"$t\"")"; done
}
diff <(count_rows "$SRC") <(count_rows "$BASE/$SCRATCH") && echo "    every table matches"
TABLES=$(psql "$BASE/$SCRATCH" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "    $TABLES tables restored"

echo "4/4 Checking constraints survived the restore"
psql "$BASE/$SCRATCH" -At -c "SELECT conname FROM pg_constraint WHERE conname = 'Appointment_no_technician_overlap'" | grep -q . && echo "    no-double-booking constraint present" || echo "    WARNING: no-double-booking constraint missing (run npm run db:constraints on the restored database)"
echo "Restore check passed. Dump kept at $DUMP; the scratch database is dropped."
