#!/usr/bin/env bash
# /opt/songreq/backup.sh -- nightly Postgres backup to Cloudflare R2 (run by cron as `songreq`).
# Reads these keys from /opt/songreq/shared/.env:
#   DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET
# R2_BACKUP_BUCKET must be a PRIVATE bucket (not the public avatars bucket).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/songreq/shared/.env}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PREFIX="songreq-"

getenv() { # read KEY from the env file without sourcing it
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-)" || true
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

DATABASE_URL="$(getenv DATABASE_URL)"
BUCKET="$(getenv R2_BACKUP_BUCKET)"
ACCOUNT="$(getenv R2_ACCOUNT_ID)"
export AWS_ACCESS_KEY_ID="$(getenv R2_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(getenv R2_SECRET_ACCESS_KEY)"
export AWS_DEFAULT_REGION=auto
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
for k in DATABASE_URL BUCKET ACCOUNT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [ -n "${!k}" ] || { echo "$(date -u +%FT%TZ) missing $k in $ENV_FILE" >&2; exit 1; }
done
ENDPOINT="https://${ACCOUNT}.r2.cloudflarestorage.com"

NAME="${PREFIX}$(date -u +%Y%m%d-%H%M%S).sql.gz"
TMP="$(mktemp /var/tmp/songreq-backup.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

echo "$(date -u +%FT%TZ) dumping -> $NAME"
# Dump to a temp file first so a failed dump is never uploaded as a "good" backup.
pg_dump --no-owner --clean --if-exists "$DATABASE_URL" | gzip -9 > "$TMP"
[ "$(stat -c %s "$TMP")" -gt 200 ] || { echo "dump looks empty" >&2; exit 1; }

aws s3 cp "$TMP" "s3://${BUCKET}/${NAME}" --endpoint-url "$ENDPOINT" --only-show-errors
echo "$(date -u +%FT%TZ) uploaded $(du -h "$TMP" | cut -f1)"

# Retention: object names carry their UTC date, so compare names against the cutoff.
CUTOFF="${PREFIX}$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d)-000000.sql.gz"
aws s3 ls "s3://${BUCKET}/" --endpoint-url "$ENDPOINT" | awk '{print $4}' | grep -E "^${PREFIX}[0-9]{8}-[0-9]{6}\.sql\.gz$" | while read -r obj; do
  if [[ "$obj" < "$CUTOFF" ]]; then
    echo "$(date -u +%FT%TZ) deleting old backup $obj"
    aws s3 rm "s3://${BUCKET}/${obj}" --endpoint-url "$ENDPOINT" --only-show-errors
  fi
done
echo "$(date -u +%FT%TZ) backup done"
