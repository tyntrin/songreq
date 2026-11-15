#!/usr/bin/env bash
# /opt/songreq/deploy.sh -- run on the VM as root:  sudo bash /opt/songreq/deploy.sh /tmp/release.tgz
# Unpack -> migrate -> switch `current` symlink -> pm2 reload -> health check -> auto-rollback.
set -euo pipefail

TARBALL="${1:-}"
BASE="${BASE:-/opt/songreq}"
APP_USER="${APP_USER:-songreq}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"
KEEP="${KEEP:-3}"
ENV_FILE="$BASE/shared/.env"

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[ -n "$TARBALL" ] && [ -f "$TARBALL" ] || die "usage: deploy.sh /path/to/release.tgz"
[ -f "$ENV_FILE" ] || die "$ENV_FILE is missing (see the runbook)"

exec 9>"$BASE/.deploy.lock"
flock -n 9 || die "another deploy is running"

as_app() { sudo -u "$APP_USER" -H env "PATH=$PATH" "$@"; }

health_ok() {
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -fsS --max-time 2 -o /dev/null "$HEALTH_URL"; then return 0; fi
    sleep 1
  done
  return 1
}

switch_to() { # atomic symlink swap
  ln -sfn "$1" "$BASE/current.new"
  mv -T "$BASE/current.new" "$BASE/current"
}

reload_app() {
  as_app pm2 startOrReload "$BASE/ecosystem.config.cjs" --update-env
}

TS="$(date +%Y%m%d%H%M%S)"
NEW="$BASE/releases/$TS"
PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"

mkdir -p "$BASE/releases" "$BASE/shared"
log "unpacking $TARBALL -> $NEW"
mkdir "$NEW"
tar -xzf "$TARBALL" -C "$NEW"
[ -f "$NEW/server.js" ] && [ -f "$NEW/deploy-migrate.mjs" ] || { rm -rf "$NEW"; die "tarball layout is wrong"; }
chown -R "$APP_USER:$APP_USER" "$NEW"

# Refresh the helper files from this release. (deploy.sh itself is replaced with
# an atomic rename so the running copy is not disturbed.)
install -m 644 -o "$APP_USER" -g "$APP_USER" "$NEW/deploy/ecosystem.config.cjs" "$BASE/ecosystem.config.cjs"
install -m 755 -o "$APP_USER" -g "$APP_USER" "$NEW/deploy/backup.sh" "$BASE/backup.sh"
install -m 755 -o root -g root "$NEW/deploy/deploy.sh" "$BASE/deploy.sh.new"
mv -f "$BASE/deploy.sh.new" "$BASE/deploy.sh"

# Migrations run BEFORE the switch while the old code is still serving, so every
# migration must stay compatible with the previous release (additive changes).
log "running migrations"
if ! (cd "$NEW" && as_app /usr/bin/node --env-file="$ENV_FILE" deploy-migrate.mjs); then
  rm -rf "$NEW"
  die "migration failed; nothing was switched"
fi

log "switching current -> $NEW (previous: ${PREV:-none})"
switch_to "$NEW"
reload_app

log "waiting up to ${HEALTH_TIMEOUT}s for $HEALTH_URL"
if health_ok; then
  log "healthy"
  as_app pm2 save >/dev/null || true
else
  log "health check FAILED"
  as_app pm2 logs songreq --lines 30 --nostream || true
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    log "rolling back to $PREV"
    switch_to "$PREV"
    reload_app
    if health_ok; then log "rollback healthy"; else log "rollback ALSO unhealthy, investigate now"; fi
  else
    log "no previous release to roll back to"
  fi
  mv "$NEW" "$NEW.failed" 2>/dev/null || true
  exit 1
fi

# Keep the newest $KEEP releases (never the active one).
ACTIVE="$(readlink -f "$BASE/current")"
ls -1dt "$BASE"/releases/*/ 2>/dev/null | sed 's:/$::' | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$(readlink -f "$old")" = "$ACTIVE" ] && continue
  log "removing old release $old"
  rm -rf "$old"
done
rm -rf "$BASE"/releases/*.failed
rm -f "$TARBALL"
log "done: $TS"
