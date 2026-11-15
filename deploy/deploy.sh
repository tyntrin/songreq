#!/usr/bin/env bash
# /opt/songreq/deploy.sh -- run on the VM as root:  sudo bash /opt/songreq/deploy.sh /tmp/release.tgz
# Unpack -> migrate -> switch `current` symlink -> pm2 restart -> health check -> auto-rollback.
set -euo pipefail

TARBALL="${1:-}"
BASE="${BASE:-/opt/songreq}"
APP_USER="${APP_USER:-songreq}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
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

# fork mode: pm2 "reload" is just a restart, so use startOrRestart explicitly.
restart_app() { as_app pm2 startOrRestart "$1" --update-env; }

# Keep at most 1 *.failed directory (the newest) so a failure can be inspected.
prune_failed() {
  local f
  for f in $(ls -1d "$BASE"/releases/*.failed 2>/dev/null | sort | sed '$d'); do rm -rf "$f"; done
}

TS="$(date +%Y%m%d%H%M%S)"
NEW="$BASE/releases/$TS"
# `readlink -f` prints a path even when the link does not exist, so test with -L first.
PREV=""
if [ -L "$BASE/current" ]; then PREV="$(readlink -f "$BASE/current")"; fi
[ -n "$PREV" ] && [ -f "$PREV/server.js" ] || PREV=""

mkdir -p "$BASE/releases" "$BASE/shared"
log "unpacking $TARBALL -> $NEW"
mkdir "$NEW"
tar -xzf "$TARBALL" -C "$NEW"
[ -f "$NEW/server.js" ] && [ -f "$NEW/deploy-migrate.mjs" ] || { rm -rf "$NEW"; die "tarball layout is wrong"; }
chown -R "$APP_USER:$APP_USER" "$NEW"

# Migrations run BEFORE the switch while the old code is still serving, so every
# migration must stay compatible with the previous release (additive changes).
log "running migrations"
if ! (cd "$NEW" && as_app "$NODE_BIN" --env-file="$ENV_FILE" deploy-migrate.mjs); then
  rm -rf "$NEW"
  die "migration failed; nothing was switched"
fi

log "switching current -> $NEW (previous: ${PREV:-none})"
switch_to "$NEW"
restart_app "$NEW/deploy/ecosystem.config.cjs"

log "waiting up to ${HEALTH_TIMEOUT}s for $HEALTH_URL"
if health_ok; then
  log "healthy"
  as_app pm2 save >/dev/null || true
else
  log "health check FAILED"
  as_app pm2 logs songreq --lines 30 --nostream || true
  mv "$NEW" "$NEW.failed" 2>/dev/null || true
  if [ -n "$PREV" ]; then
    log "rolling back to $PREV"
    switch_to "$PREV"
    if [ -f "$PREV/deploy/ecosystem.config.cjs" ]; then restart_app "$PREV/deploy/ecosystem.config.cjs"; else restart_app "$BASE/ecosystem.config.cjs"; fi
    if health_ok; then log "rollback healthy"; else log "rollback ALSO unhealthy, investigate now"; fi
    prune_failed
    die "deploy failed; rolled back to $PREV (failed release kept as $NEW.failed)"
  fi
  # First deploy: nothing to go back to. Stop the app and remove the link.
  as_app pm2 delete songreq >/dev/null 2>&1 || true
  rm -f "$BASE/current"
  prune_failed
  die "first deploy failed and there is no previous release; app stopped, 'current' removed (inspect $NEW.failed)"
fi

# Healthy: now refresh the helper files from this release. deploy.sh itself is
# replaced with an atomic rename so the running copy is not disturbed.
install -m 644 "$NEW/deploy/ecosystem.config.cjs" "$BASE/ecosystem.config.cjs"
install -m 755 "$NEW/deploy/backup.sh" "$BASE/backup.sh"
install -m 644 "$NEW/deploy/crontab.txt" "$BASE/crontab.txt"
install -m 755 "$NEW/deploy/deploy.sh" "$BASE/deploy.sh.new"
mv -f "$BASE/deploy.sh.new" "$BASE/deploy.sh"
chown "$APP_USER:$APP_USER" "$BASE/ecosystem.config.cjs" "$BASE/backup.sh" "$BASE/crontab.txt"

# Keep the newest $KEEP releases, sorted by name (timestamp), never the active one.
ACTIVE="$(readlink -f "$BASE/current")"
for old in $(ls -1d "$BASE"/releases/[0-9]*/ 2>/dev/null | sed 's:/$::' | grep -v '\.failed$' | sort -r | tail -n +"$((KEEP + 1))"); do
  [ "$(readlink -f "$old")" = "$ACTIVE" ] && continue
  log "removing old release $old"
  rm -rf "$old"
done
prune_failed
rm -f "$TARBALL"
log "done: $TS"
