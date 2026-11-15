#!/usr/bin/env bash
# Build the deployable artifact from an already-built tree (run `npm run build` first).
# Usage: bash deploy/package.sh [output.tgz]    (default: release.tgz in repo root)
# Layout inside the tarball (extracted to /opt/songreq/releases/<ts>/):
#   server.js, package.json, node_modules/   <- Next standalone output
#   .next/static, public                     <- must sit next to server.js
#   drizzle/                                 <- SQL migrations
#   deploy-migrate.mjs, deploy-purge-pii.mjs <- esbuild bundles of scripts/*.ts
#   deploy/                                  <- deploy.sh, backup.sh, ecosystem.config.cjs, crontab.txt, Caddyfile
set -euo pipefail

OUT="${1:-release.tgz}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .next/standalone/server.js ] || { echo "run 'npm run build' first (no .next/standalone/server.js)" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Only what is needed at runtime. The standalone dir also contains traced
# copies of src/, docs/, e2e/ ... which we deliberately leave out.
cp .next/standalone/server.js .next/standalone/package.json "$STAGE/"
cp -R .next/standalone/node_modules "$STAGE/node_modules"
[ -d .next/standalone/.next ] && cp -R .next/standalone/.next "$STAGE/.next"
mkdir -p "$STAGE/.next"
cp -R .next/static "$STAGE/.next/static"
cp -R public "$STAGE/public"
cp -R drizzle "$STAGE/drizzle"
# deploy.sh copies these to /opt/songreq on every release
mkdir -p "$STAGE/deploy"
cp deploy/deploy.sh deploy/backup.sh deploy/ecosystem.config.cjs deploy/crontab.txt deploy/Caddyfile "$STAGE/deploy/"

# Bundle the migrate / purge scripts. Everything is inlined except pglite, which
# is already in the standalone node_modules (serverExternalPackages) and is only
# imported (not used) when DATABASE_URL is a real postgres:// URL.
for name in migrate:deploy-migrate purge-pii:deploy-purge-pii; do
  npx esbuild "scripts/${name%%:*}.ts" \
    --bundle --platform=node --format=esm --target=node24 \
    --external:@electric-sql/pglite \
    --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" \
    --outfile="$STAGE/${name##*:}.mjs" --log-level=warning
done

tar -C "$STAGE" -czf "$OUT" .
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
