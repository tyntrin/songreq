# Song Request

Web app for musicians: customers scan a QR code and request songs (no login, mobile-first). Next.js 16, Tailwind 4, Vitest, Playwright.

## Run

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:3200
```

## Test

```bash
npm test           # unit tests (vitest)
npm run typecheck
npm run lint
npm run test:e2e   # playwright
```

## Deploy

Production runs on one GCP e2-micro (pm2 + Postgres) behind Cloudflare, with R2 for files and backups. CI is in `.github/workflows/ci.yml`; deploys are manual via the `Deploy` workflow. Step-by-step setup (in Thai): [docs/runbooks/deploy-gcp.md](docs/runbooks/deploy-gcp.md). Scripts live in `deploy/`. Set `APP_URL` in production, otherwise the app only warns and falls back to request headers.
