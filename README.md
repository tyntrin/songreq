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
