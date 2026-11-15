# Song Request v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app where musicians list songs they can play and print a QR; customers scan, request several songs and optionally tip by PromptPay; musicians watch requests arrive live.

**Architecture:** One Next.js 16 App Router app (pages, server actions, route handlers). Services in `src/lib/<domain>` take a `db: Db` first argument so they run against PGlite in tests and postgres.js in production. Live updates use Server-Sent Events fed by an in-process event bus (one pm2 process in production).

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript, Tailwind CSS 4, Drizzle ORM 0.45 + drizzle-kit, `postgres` 4 (prod) / `@electric-sql/pglite` 0.5 (dev+test), next-auth 5 beta (`next-auth@beta`) + `@auth/drizzle-adapter`, zod 4, `promptpay-qr`, `qrcode`, Vitest 5, Playwright 1.65. Package manager: npm.

**Spec:** `docs/superpowers/specs/2026-11-16-song-request-design.md` (read it; mockups linked there are the visual reference).

## Global Constraints

- Node 24, npm. Path alias `@/*` → `src/*`. Dev server port **3200**.
- Customer pages: no login, no ads, mobile-first, server-rendered, minimal client JS.
- Musician pages: Thai only. Customer pages: Thai + English.
- Colors: bg `#14110F`, surface `#1F1B18`, border `#2E2723` / strong `#3A322C`, text `#F4EFE8`, muted `#A89F94`, placeholder `#8A8178`, accent `#F5B544`, on-accent `#1A1408`. Font: IBM Plex Sans Thai (400/500/600/700) via `next/font/google`.
- Touch targets ≥ 44px; icons are inline stroke SVG; never emoji.
- Night = 06:00 → 05:59 next day, `Asia/Bangkok` (UTC+7, no DST). Server TZ may be UTC: never use local-time Date methods for this.
- Song data is title + artist only. No lyrics or chords anywhere.
- Tip: integer baht 0–10000; 0 = no tip. Tip counts in totals only after "โอนแล้ว" (`tip_claimed_at` set) and when request not hidden.
- Name ≤ 40 chars, message ≤ 140 chars, ≤ 10 songs per request.
- Rate limits: per performer+device ≤ 10 songs / 10 min; per performer+IP ≤ 60 songs / 10 min.
- Musician never has to press anything during a performance: no open/close round, no played/skip.
- `AUTH_DEV_LOGIN=true` enables a dev-only credentials provider; it must be impossible when `NODE_ENV=production`.
- Commits: one per task minimum, message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Shared bar Wi-Fi:** many customers behind one public IP must not lock each other out → IP limit is 60/10 min while device limit is 10/10 min (Task 6 test `ip limit is looser than device limit`).
2. **Night boundary:** a request at 01:30 Bangkok belongs to the previous night; 06:00:00 starts a new one, on a UTC server (Task 3 tests).
3. **Double-tap / retry on "ส่งคำขอ":** same `clientRequestId` from the same device returns the existing request instead of creating a duplicate (Task 8 test `createRequest is idempotent per device and clientRequestId`).
4. **Stale song list:** a customer page loaded before the musician removed a song submits it → 409 with `unavailableSongIds`; UI drops them and tells the customer (Task 8 test `rejects songs not in setlist`, Task 9 step).
5. **Monitor connection drops (Cloudflare idle cut, phone sleep):** SSE heartbeats every 25 s, client reconnects and falls back to 15 s polling; marking seen is idempotent when several band members watch at once (Task 10 test `markSeen is idempotent and only touches own performer`).

---

## File Structure

```
src/
  app/
    layout.tsx, globals.css, manifest.ts, page.tsx (landing), privacy/page.tsx
    login/page.tsx, setup/page.tsx, invite/[token]/page.tsx
    r/[publicId]/page.tsx (customer pages 1,2,5) · pay/[requestId]/page.tsx (3) · status/page.tsx (4)
    dashboard/layout.tsx (tab bar) · page.tsx (redirect) · requests/ · songs/ · setlists/ · setlists/[id]/ · stats/ · settings/
    admin/page.tsx
    api/auth/[...nextauth]/route.ts, api/health/route.ts, api/songs/search/route.ts,
    api/r/[publicId]/requests/route.ts, api/r/[publicId]/status/route.ts, api/r/[publicId]/stream/route.ts,
    api/requests/[id]/claim-tip/route.ts,
    api/dashboard/feed/route.ts, api/dashboard/stream/route.ts, api/dashboard/seen/route.ts,
    api/uploads/[name]/route.ts
  auth.ts, proxy.ts
  components/ (ui primitives: Button, TabBar, Chip, Switch, Icon set)
  lib/
    db/schema.ts, db/client.ts, db/types.ts
    time/night.ts
    promptpay/promptpay.ts
    validation/request-input.ts, validation/text.ts
    ratelimit/limiter.ts
    auth/admin.ts, auth/dev-login.ts, auth/session.ts
    performers/service.ts, performers/invites.ts
    songs/itunes.ts, songs/repertoire.ts
    setlists/service.ts
    requests/service.ts, requests/feed.ts, requests/device.ts
    realtime/bus.ts, realtime/sse.ts
    stats/service.ts
    storage/index.ts
    i18n/customer.ts
    privacy/purge.ts
  test/db.ts (createTestDb)
drizzle/ (generated migrations)  scripts/migrate.ts  scripts/purge-pii.ts
e2e/request-flow.spec.ts
deploy/ (Caddyfile, deploy.sh, backup.sh, ecosystem.config.cjs)  .github/workflows/ci.yml, deploy.yml
docs/runbooks/deploy-gcp.md
```

---

### Task 1: Project scaffold, theme, test tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (placeholder), `src/app/api/health/route.ts`, `.env.example`, `README.md`
- Test: `src/app/api/health/route.test.ts`

**Interfaces:**
- Produces: npm scripts `dev` (`next dev -p 3200`), `build`, `start`, `typecheck` (`tsc --noEmit`), `lint`, `test` (`vitest run`), `test:e2e` (`playwright test`), `db:generate`, `db:migrate`; Tailwind theme tokens `bg`, `surface`, `line`, `line-strong`, `ink`, `muted`, `placeholder`, `accent`, `on-accent` (from Global Constraints); `GET /api/health` → `200 {"ok":true}`.

- [ ] **Step 1:** Scaffold by hand (not `create-next-app`, the folder is not empty): install `next@16 react@19 react-dom@19 tailwindcss@4 @tailwindcss/postcss` and dev deps `typescript @types/node @types/react @types/react-dom vitest @vitejs/plugin-react vite-tsconfig-paths eslint eslint-config-next @playwright/test tsx`. `next.config.ts`: `output: "standalone"`. Layout loads IBM Plex Sans Thai via `next/font/google`, `<html lang="th">`, body `bg-bg text-ink`. Theme tokens via Tailwind v4 `@theme` in `globals.css`.
- [ ] **Step 2: Write the failing test** `health returns ok`: `const res = await GET(); expect(res.status).toBe(200); expect(await res.json()).toEqual({ ok: true })`.
- [ ] **Step 3:** Run `npm test` → FAIL (module missing). Implement `GET` in `src/app/api/health/route.ts`. Run → PASS.
- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm run build` → all succeed.
- [ ] **Step 5:** `.env.example` lists every env var used in this plan with comments: `APP_URL, DATABASE_URL, AUTH_SECRET, AUTH_DEV_LOGIN, AUTH_LINE_ID, AUTH_LINE_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ADMIN_EMAILS, STORAGE_DRIVER, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL`. Commit `chore: scaffold next app with theme and test tooling`.

### Task 2: Database schema, client, test DB

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/types.ts`, `drizzle.config.ts`, `scripts/migrate.ts`, `src/test/db.ts`, `drizzle/*` (generated)
- Test: `src/lib/db/schema.test.ts`

**Interfaces:**
- Produces: `type Db` (a `PgDatabase<…, typeof schema>` usable with both drivers); `getDb(): Db` (singleton; `DATABASE_URL` unset or starting `pglite:` → PGlite at that dir, default `./.data/pglite`; otherwise postgres.js); `createTestDb(): Promise<Db>` (fresh in-memory PGlite with migrations applied); tables exactly as spec §7 plus Auth.js tables required by `@auth/drizzle-adapter` (`users`, `accounts`, `sessions`, `verificationTokens`) and `requests.client_request_id text not null` with unique `(performer_id, device_id, client_request_id)`. Ids: `text` primary keys generated with `crypto.randomUUID()` (default in schema). Timestamps `timestamp with time zone`, default now.
- `npm run db:migrate` runs `scripts/migrate.ts` (works for both drivers).

- [ ] **Step 1: Write the failing test** `migrations create all tables`: `const db = await createTestDb()`, insert a user, performer, membership, song, repertoire row, setlist, setlist_song, request, request_item; select them back; expect counts 1. And `repertoire is unique per performer and song`: second insert of same pair rejects.
- [ ] **Step 2:** Run → FAIL. Write schema + client + drizzle config; `npm run db:generate` to create `drizzle/`; implement `createTestDb` using `drizzle-orm/pglite/migrator`.
- [ ] **Step 3:** Run tests → PASS. Run `npm run db:migrate` against default PGlite dir → exits 0.
- [ ] **Step 4:** Commit `feat: database schema and drivers`.

### Task 3: Night time and PromptPay helpers

**Files:**
- Create: `src/lib/time/night.ts`, `src/lib/promptpay/promptpay.ts`
- Test: `src/lib/time/night.test.ts`, `src/lib/promptpay/promptpay.test.ts`

**Interfaces:**
- Produces: `nightKey(at: Date): string` ("YYYY-MM-DD" of the Bangkok date the night started); `nightRange(at: Date): { start: Date; end: Date }` (end exclusive); `periodRange(period: "night" | "week" | "month", now: Date): { start: Date; end: Date }` (week = 7 nights ending with tonight; month = from 06:00 Bangkok on the 1st of tonight's month; end = tonight's end).
- Produces: `type PromptPayType = "phone" | "national_id"`; `normalizePromptPayId(raw: string): string` (strip spaces/dashes); `isValidPromptPay(type, id): boolean`; `buildPromptPayPayload(type, id, amountBaht: number): string` (wrap `promptpay-qr` `generatePayload`); `maskPromptPay(type, id): string`.

- [ ] **Step 1: Write failing tests** (exact values):
  - `nightKey(new Date("2026-11-20T18:30:00Z"))` → `"2026-11-20"` (01:30 on the 21st Bangkok)
  - `nightKey(new Date("2026-11-20T23:00:00Z"))` → `"2026-11-21"` (06:00:00)
  - `nightKey(new Date("2026-11-20T22:59:59Z"))` → `"2026-11-20"`
  - `nightRange(new Date("2026-11-20T18:30:00Z"))` → start `2026-11-19T23:00:00.000Z`, end `2026-11-20T23:00:00.000Z`
  - `periodRange("week", new Date("2026-11-20T18:30:00Z")).start` → `2026-11-13T23:00:00.000Z`
  - `periodRange("month", new Date("2026-11-20T18:30:00Z")).start` → `2026-10-31T23:00:00.000Z`
  - `isValidPromptPay("phone","081-234-5678")` true; `"812345678"` false; `"08123456789"` false
  - `isValidPromptPay("national_id","1101700230708")` true; `"1101700230705"` false (checksum: Σ d[i]·(13−i) for i=0..11; check = (11 − sum mod 11) mod 10)
  - `buildPromptPayPayload("phone","0812345678",50)` starts `"000201"`, contains `"01130066812345678"` and `"540550.00"`, matches `/6304[0-9A-F]{4}$/`
  - `buildPromptPayPayload("national_id","1101700230708",20)` contains `"02131101700230708"`
  - `maskPromptPay("phone","0812345678")` → `"xxx-xxx-5678"`; `maskPromptPay("national_id","1101700230708")` → `"x-xxxx-xxxx0-70-8"`
- [ ] **Step 2:** Run → FAIL. Implement (UTC arithmetic: Bangkok = UTC+7, night starts 23:00 UTC previous day). Run → PASS.
- [ ] **Step 3:** Commit `feat: night boundaries and promptpay helpers`.

### Task 4: Input validation and rate limiter

**Files:**
- Create: `src/lib/validation/text.ts`, `src/lib/validation/request-input.ts`, `src/lib/ratelimit/limiter.ts`
- Test: `src/lib/validation/request-input.test.ts`, `src/lib/ratelimit/limiter.test.ts`

**Interfaces:**
- Produces: `cleanText(raw: unknown, max: number): string | null` (remove `[\u0000-\u001F\u007F]`, trim, empty → null, longer than max → throws `ValidationError`); `class ValidationError extends Error { field: string }`.
- Produces: `requestInputSchema` (zod) and `type RequestInput = { clientRequestId: string /* uuid */; songIds: string[] /* 1–10 unique */; name: string | null; message: string | null; tipAmount: number /* int 0–10000 */ }`; `parseRequestInput(body: unknown): RequestInput` (throws `ValidationError`).
- Produces: `type Limiter = { consume(key: string, cost: number): boolean }`; `createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): Limiter` (sliding window, in memory); module singletons `deviceLimiter` (10 / 600000 ms) and `ipLimiter` (60 / 600000 ms).

- [ ] **Step 1: Write failing tests:** name of 41 chars throws with `field === "name"`; message of 141 chars throws `field === "message"`; `"  \u0007hi "` → `"hi"`; 11 songIds rejected; duplicate songIds rejected; tip `50.5` and `-1` and `10001` rejected; tip `0` accepted. Limiter: limit 10 → `consume(k,6)` true, `consume(k,4)` true, `consume(k,1)` false, after advancing fake clock 600001 ms → true. `ip limit is looser than device limit`: `ipLimiter`-config instance accepts 60 single-song consumes, rejects the 61st.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Commit `feat: request input validation and rate limiter`.

### Task 5: Auth (LINE, Google, dev login), proxy, admin check

**Files:**
- Create: `src/auth.ts`, `src/proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/auth/dev-login.ts`, `src/lib/auth/admin.ts`, `src/lib/auth/session.ts`, `src/app/login/page.tsx`
- Test: `src/lib/auth/dev-login.test.ts`, `src/lib/auth/admin.test.ts`

**Interfaces:**
- Consumes: `getDb`, schema users/accounts.
- Produces: `auth, handlers, signIn, signOut` from `src/auth.ts` (JWT session strategy, `DrizzleAdapter`, providers LINE + Google + dev Credentials when enabled; `session.user.id` populated); `isDevLoginEnabled(env: NodeJS.ProcessEnv): boolean`; `isAdminEmail(email: string | null | undefined, env): boolean` (comma list `ADMIN_EMAILS`, case-insensitive, trimmed); `requireUser(): Promise<{ id: string; email: string | null; name: string | null }>` (redirects to `/login` if none).
- Proxy matcher `/dashboard/:path*`, `/setup`, `/admin/:path*` → redirect to `/login?next=…` when signed out.
- Login page = mockup 6 (LINE green `#06C755` button, light Google button, terms line linking `/privacy`); shows a "Dev login" email form only when `isDevLoginEnabled`.

- [ ] **Step 1: Write failing tests:** `isDevLoginEnabled({AUTH_DEV_LOGIN:"true",NODE_ENV:"development"})` true; same with `NODE_ENV:"production"` false; unset false. `isAdminEmail("A@x.com",{ADMIN_EMAILS:" a@x.com, b@y.com"})` true; `null` false; empty env false.
- [ ] **Step 2:** Run → FAIL. Implement helpers, auth config, proxy, login page. Dev credentials `authorize` upserts a user by email and returns it.
- [ ] **Step 3:** Run tests → PASS. `npm run build` succeeds with only `AUTH_SECRET` + `AUTH_DEV_LOGIN=true` set (missing LINE/Google ids must not crash the build; skip those providers when their ids are absent).
- [ ] **Step 4:** Commit `feat: auth with line, google and dev login`.

### Task 6: Performers, membership, setup page, invites

**Files:**
- Create: `src/lib/performers/service.ts`, `src/lib/performers/invites.ts`, `src/app/setup/page.tsx` (+ `actions.ts`), `src/app/invite/[token]/page.tsx`
- Test: `src/lib/performers/service.test.ts`, `src/lib/performers/invites.test.ts`

**Interfaces:**
- Consumes: `createTestDb`, `isValidPromptPay`, `normalizePromptPayId`, `requireUser`.
- Produces:
  - `type Performer = { id; slug; displayName; avatarUrl: string | null; promptpayType: PromptPayType; promptpayId; acceptingRequests: boolean; suspendedAt: Date | null }`
  - `createPerformer(db, userId, input: { displayName: string; promptpayType: PromptPayType; promptpayId: string; avatarUrl?: string | null }): Promise<{ performer: Performer; defaultSetlistId: string }>` — validates (displayName 1–60 via `cleanText`, PromptPay valid), creates owner membership and setlist named `"Setlist หลัก"`, slug from name + 4 random chars.
  - `listMyPerformers(db, userId): Promise<Array<Performer & { role: "owner" | "member" }>>`
  - `getCurrentPerformer(db, userId, preferredId?: string): Promise<(Performer & { role }) | null>` (cookie `sr_performer` supplies preferredId in pages)
  - `requireRole(db, performerId, userId, need: "member" | "owner"): Promise<"owner" | "member">` throws `ForbiddenError`
  - `updatePerformer(db, performerId, userId, patch: Partial<{ displayName; avatarUrl; promptpayType; promptpayId; acceptingRequests }>)` — PromptPay fields owner-only.
  - `createInvite(db, performerId, userId): Promise<string /* token */>` (owner-only, expires 7 days); `acceptInvite(db, token, userId): Promise<{ performerId }>` (expired/used → `InviteError`; already member → returns performerId without new row).
- Setup page = mockup 7; redirects to `/dashboard/requests` if user already has a performer; on success → `/dashboard/songs`.

- [ ] **Step 1: Write failing tests:** create → performer + owner role + one setlist `"Setlist หลัก"`; invalid PromptPay rejected; member cannot change `promptpayId` (ForbiddenError) but can toggle `acceptingRequests`; non-member `requireRole` throws; invite accept adds member; second accept by same user no duplicate; expired invite throws.
- [ ] **Step 2:** Run → FAIL. Implement services and pages. Run → PASS.
- [ ] **Step 3:** Commit `feat: performer setup, roles and invites`.

### Task 7: Song search and repertoire (page 9)

**Files:**
- Create: `src/lib/songs/itunes.ts`, `src/lib/songs/repertoire.ts`, `src/app/api/songs/search/route.ts`, `src/app/dashboard/layout.tsx` (tab bar), `src/app/dashboard/page.tsx` (redirect to `requests`), `src/app/dashboard/songs/page.tsx` (+ client component, `actions.ts`), `src/components/*` primitives used here
- Test: `src/lib/songs/itunes.test.ts`, `src/lib/songs/repertoire.test.ts`

**Interfaces:**
- Produces:
  - `type SongHit = { itunesTrackId: number; title: string; artist: string }`
  - `searchItunes(q: string, fetchImpl = fetch): Promise<SongHit[]>` — `https://itunes.apple.com/search?term=…&country=TH&entity=song&limit=15`, dedupe by lowercase title+artist, 10-minute in-memory cache by normalized query, query < 2 chars → `[]`, network error → throws `UpstreamError`.
  - `GET /api/songs/search?q=` (signed-in only) → `{ hits: Array<SongHit & { inRepertoire: boolean }> }`; `UpstreamError` → 502 `{ error: "search_unavailable" }`.
  - `addItunesSong(db, performerId, hit: SongHit): Promise<RepertoireItem>` (upsert `songs` by `itunes_track_id`), `addCustomSong(db, performerId, userId, input: { title; artist })` (title/artist 1–120), both also append to the performer's oldest setlist; `listRepertoire(db, performerId): Promise<RepertoireItem[]>` sorted by title (Thai locale compare); `updateRepertoireItem(db, performerId, id, patch: { songKey?: string | null; tags?: string[] })` (key ≤ 6 chars, ≤ 5 tags each ≤ 20); `removeRepertoireItem(db, performerId, id)` (also removes from that performer's setlists).
  - `type RepertoireItem = { id; songId; title; artist; songKey: string | null; tags: string[] }`
- Dashboard layout: bottom tab bar per mockup (คำขอ / เพลง / QR / สถิติ / ตั้งค่า → `/dashboard/requests|songs|setlists|stats|settings`), active tab accent; redirects to `/setup` when user has no performer.
- Page 9 per mockup: debounced search (300 ms), "+ เพิ่ม"/"มีแล้ว", "ไม่เจอเพลงที่หา? เพิ่มเอง" dialog, "เพลงของฉัน" list with key/tag chips and ⋯ menu (แก้คีย์/แท็ก, ลบ).

- [ ] **Step 1: Write failing tests:** `searchItunes` with fake fetch returning two duplicates + one other → 2 hits; same query twice → fake fetch called once; `"a"` → `[]` without fetch. Repertoire: adding same iTunes song twice → one row; custom song appears in default setlist; remove deletes from setlists; tags > 5 rejected.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Commit `feat: song search and repertoire`.

### Task 8: Setlists, public page data, request creation

**Files:**
- Create: `src/lib/setlists/service.ts`, `src/lib/requests/service.ts`, `src/lib/requests/device.ts`, `src/lib/realtime/bus.ts`, `src/app/api/r/[publicId]/requests/route.ts`, `src/app/api/requests/[id]/claim-tip/route.ts`, `src/app/api/r/[publicId]/status/route.ts`
- Test: `src/lib/setlists/service.test.ts`, `src/lib/requests/service.test.ts`, `src/lib/realtime/bus.test.ts`

**Interfaces:**
- Produces (setlists): `createSetlist(db, performerId, name)` (1–40 chars, `publicId` = 10 chars `[a-z0-9]`), `renameSetlist`, `deleteSetlist` (not the last one), `setSetlistSongs(db, performerId, setlistId, songIds: string[])` (only songs in repertoire), `listSetlists(db, performerId, now: Date): Promise<Array<{ id; name; publicId; songCount; requestsTonight }>>`, `getPublicSetlist(db, publicId): Promise<PublicSetlist | null>` where `PublicSetlist = { setlistId; performer: { id; displayName; avatarUrl; promptpayType; promptpayId; acceptingRequests }; songs: Array<{ id; title; artist; tags: string[] }>; tags: string[] }` (null when not found or performer suspended).
- Produces (bus): `bus.publish(channel: string, event: BusEvent)`, `bus.subscribe(channel, handler): () => void`; channels `performerChannel(id)` = `performer:${id}`, `deviceChannel(performerId, deviceId)` = `device:${performerId}:${deviceId}`; `type BusEvent = { type: "request.created" | "request.updated" | "items.seen" }`.
- Produces (device): `getOrSetDeviceId(): Promise<string>` (cookie `sr_device`, httpOnly, sameSite lax, 1 year, random UUID).
- Produces (requests):
  - `createRequest(db, ctx: { publicId; deviceId; ip; now: Date; limiters?: { device: Limiter; ip: Limiter } /* defaults: module singletons; tests pass fresh ones */ }, input: RequestInput): Promise<{ requestId: string; tipAmount: number }>` — errors: `NotFoundError` (setlist/suspended), `ClosedError` (acceptingRequests false), `BlockedError` (device blocked), `RateLimitError`, `UnavailableSongsError { unavailableSongIds: string[] }`. Idempotent on `(performerId, deviceId, clientRequestId)`. Consumes `deviceLimiter` (key `${performerId}:${deviceId}`) and `ipLimiter` (key `${performerId}:${ip}`) with cost = song count. Publishes `request.created` on performer channel.
  - `claimTip(db, requestId, deviceId, now)`: only the creating device; sets `tip_claimed_at` once; publishes `request.updated`.
  - `getDeviceStatus(db, performerId, deviceId, now): Promise<Array<{ requestId; tipAmount; tipClaimed: boolean; items: Array<{ itemId; title; artist; status: "sent" | "seen" }> }>>` — tonight only, hidden excluded.
- Routes: POST requests → 201 `{ requestId, tipAmount }`; errors map to 404/409 `{ error: "closed" }`/403 `{ error: "blocked" }`/429/409 `{ error: "unavailable", unavailableSongIds }`/400 `{ error: "invalid", field }`. Claim-tip POST → 204. Status GET → 200 `{ requests }`. Client IP from `cf-connecting-ip`, then first `x-forwarded-for`, else `"unknown"`.

- [ ] **Step 1: Write failing tests:** `createRequest` stores 2 items; `createRequest is idempotent per device and clientRequestId` (same id twice → same requestId, 1 row); `rejects songs not in setlist` → `UnavailableSongsError` with that id; closed performer → `ClosedError`; blocked device → `BlockedError`; 11th song within 10 min from same device → `RateLimitError` (fresh limiters via `ctx.limiters`); `claimTip` by another device → no change; status excludes yesterday's night and hidden requests; status item becomes `"seen"` after `seen_at` set; bus subscriber receives `request.created`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Commit `feat: setlists and customer request backend`.

### Task 9: Customer pages 1–5 with i18n and PromptPay QR

**Files:**
- Create: `src/lib/i18n/customer.ts`, `src/app/r/[publicId]/page.tsx` (+ `RequestFlow.tsx` client), `src/app/r/[publicId]/pay/[requestId]/page.tsx` (+ client), `src/app/r/[publicId]/status/page.tsx` (+ client), `src/app/api/r/[publicId]/stream/route.ts`, `src/lib/realtime/sse.ts`
- Test: `src/lib/i18n/customer.test.ts`, `src/lib/realtime/sse.test.ts`

**Interfaces:**
- Consumes: `getPublicSetlist`, `getDeviceStatus`, POST requests / claim-tip routes, `buildPromptPayPayload`, `maskPromptPay`, bus.
- Produces: `type Locale = "th" | "en"`; `pickLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale` (cookie wins; `en*` first in header → en; default th); `t(locale, key: CustomerKey, vars?: Record<string, string | number>): string` with both dictionaries complete (TypeScript enforces same keys).
- Produces: `sseStream(opts: { channels: string[]; signal: AbortSignal; heartbeatMs?: number /* 25000 */ }): Response` — `text/event-stream`, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`, sends `event: ping` every heartbeat and `data: {type}` for each bus event; unsubscribes on abort.
- `GET /api/r/[publicId]/stream` → SSE on that device's channel + performer's `request.updated` (to refresh hidden state).
- Pages per mockups 1–5 (copy from mockups; English equivalents in dictionary):
  - Page 1/2 is one client component with two steps; selection survives back-navigation via `sessionStorage` key `sr_sel_${publicId}`; submit generates `clientRequestId = crypto.randomUUID()` once per submission attempt and disables the button while pending; on 409 unavailable: remove those songs, show `t("songsUnavailable")`; on 409 closed: switch to page-5 state; tip 0 → `/r/[publicId]/status`, else `/r/[publicId]/pay/[requestId]`.
  - Page 3: QR rendered with `qrcode` to a `<canvas>`/data URL; "บันทึกรูป QR" downloads `tip-{displayName}-{amount}.png`; "โอนแล้ว" POSTs claim-tip then goes to status; "ข้าม" goes to status.
  - Page 4: fetch status, subscribe to stream, refetch on any event, polling fallback every 15 s when stream errors.
  - Header shows avatar/initials, display name, status pill only (no setlist name or date).

- [ ] **Step 1: Write failing tests:** `pickLocale(undefined,"en-US,en;q=0.9")` → en; `pickLocale("th","en-US")` → th; `pickLocale(undefined,null)` → th; every key in `th` exists in `en` (runtime check); `t("en","selectedCount",{n:2})` contains "2". `sseStream` with fake bus: publishing to channel yields a `data:` chunk; abort unsubscribes (bus has 0 handlers); heartbeat chunk appears with `heartbeatMs: 10` and fake timers.
- [ ] **Step 2:** Run → FAIL. Implement libs and pages. Run → PASS.
- [ ] **Step 3:** Manual check: `npm run dev`, open a seeded `/r/<id>` at 390 px width, walk 1→2→3→4 and the closed state. Commit `feat: customer request pages`.

### Task 10: Musician live monitor (page 8)

**Files:**
- Create: `src/lib/requests/feed.ts`, `src/app/api/dashboard/feed/route.ts`, `src/app/api/dashboard/stream/route.ts`, `src/app/api/dashboard/seen/route.ts`, `src/app/dashboard/requests/page.tsx` (+ `Monitor.tsx` client, `actions.ts`)
- Test: `src/lib/requests/feed.test.ts`

**Interfaces:**
- Consumes: `nightRange`, bus, `sseStream`, `getCurrentPerformer`, `requireRole`.
- Produces:
  - `type FeedRow = { itemId; requestId; songId; title; artist; setlistId; deviceId; requesterName: string | null; message: string | null; tipAmount: number; tipClaimed: boolean; createdAt: Date; seenAt: Date | null }`
  - `aggregateFeed(rows: FeedRow[]): FeedCard[]` where `FeedCard = { songId; title; artist; times: number; requesterLabel: string; latestMessage: string | null; latestAt: Date; tipTotal: number; isNew: boolean; itemIds: string[]; requestIds: string[] }` — group by songId; `times` = item count; `tipTotal` = sum of claimed tips over distinct requests in the group; `isNew` = any `seenAt` null; sort `latestAt` desc. `requesterLabel`: no names → `"ไม่ระบุชื่อ"`; one item with name → that name; several items → `${latestName ?? "ไม่ระบุชื่อ"} และอีก ${times - 1} คน`.
  - `getTonightFeed(db, performerId, now, setlistId?): Promise<{ cards: FeedCard[]; requestCount: number /* items */; tipTotal: number /* distinct requests */ }>` (hidden excluded).
  - `markSeen(db, performerId, itemIds: string[], now)`: sets `seen_at` where null and item belongs to performer; publishes `items.seen` on each affected device channel.
  - `hideRequest(db, performerId, userId, requestId)`, `blockDevice(db, performerId, userId, deviceId)` (member role).
  - Routes: GET feed `?setlist=` → feed JSON; GET stream → SSE on performer channel; POST seen `{ itemIds }` → 204.
- Monitor UI per mockup 8: summary cards, setlist chips, cards (new = accent border + "ใหม่" pill, "ขอ N ครั้ง", quoted message, "who · relative time", "ทิป ฿X (แจ้งโอน)"), sound toggle (localStorage `sr_sound`, Web Audio short chime + `navigator.vibrate(200)` on new cards), Wake Lock while visible, ⋯ menu per card with "ซ่อน" / "บล็อกเครื่องนี้". After rendering cards with `isNew`, POST seen for their itemIds; keep the "ใหม่" pill for 60 s client-side after first render.

- [ ] **Step 1: Write failing tests:** aggregate 3 rows of same song (names "มิ้น", null, "เจมส์"; latest "เจมส์") → times 3, label `"เจมส์ และอีก 2 คน"`; single unnamed row → `"ไม่ระบุชื่อ"`; one request with 2 songs and claimed tip 50 → summary `tipTotal` 50 (not 100); unclaimed tip excluded; sort order by latest. `markSeen is idempotent and only touches own performer`: calling twice keeps first `seen_at`; itemIds of another performer unchanged; device channel receives `items.seen`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Commit `feat: live request monitor`.

### Task 11: Setlists & QR page (10) and poster

**Files:**
- Create: `src/app/dashboard/setlists/page.tsx`, `src/app/dashboard/setlists/[id]/page.tsx` (song picker), `src/app/dashboard/setlists/actions.ts`, `src/components/QrPoster.tsx`
- Test: `src/components/qr-poster.test.ts` (pure helper)

**Interfaces:**
- Consumes: setlist service from Task 8, `listRepertoire`.
- Produces: `publicSetlistUrl(appUrl: string, publicId: string): string` → `${appUrl}/r/${publicId}` (no double slash); `renderPosterPng(opts: { displayName: string; url: string; size: "a5" }): Promise<Blob>` (client canvas 1748×2480 px = A5 at 300 dpi; dark bg, "สแกนขอเพลง", QR, display name).
- Page 10 per mockup: card per setlist (preview, song count, requests tonight, "แก้รายการเพลง", "โปสเตอร์ A5", "คัดลอกลิงก์"), "สร้าง setlist ใหม่"; `[id]` page: rename, checkbox list from repertoire, save, delete (disabled for the last setlist).

- [ ] **Step 1: Write failing test:** `publicSetlistUrl("https://x.app/","abc")` → `"https://x.app/r/abc"`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS. Manual: download poster in dev, open PNG, QR scans to the URL.
- [ ] **Step 3:** Commit `feat: setlist management and qr poster`.

### Task 12: Stats page (11)

**Files:**
- Create: `src/lib/stats/service.ts`, `src/app/dashboard/stats/page.tsx`
- Test: `src/lib/stats/service.test.ts`

**Interfaces:**
- Consumes: `periodRange`, `nightKey`.
- Produces: `getStats(db, performerId, period: "night" | "week" | "month", now: Date): Promise<{ requestCount: number; tipTotal: number; nights: number; topSongs: Array<{ title: string; count: number }> /* max 5 */; bySetlist: Array<{ setlistId: string; name: string; count: number }> }>` — counts items, excludes hidden; tips from distinct claimed requests; `nights` = distinct `nightKey(created_at)`.
- Page per mockup 11 with segmented control via `?period=` search param (default `month`), note "ยอดทิปคือที่ลูกค้ากด "โอนแล้ว" ระบบไม่ได้ตรวจกับธนาคาร".

- [ ] **Step 1: Write failing tests:** seed items across 2 nights and 2 setlists incl. one hidden and one unclaimed tip → expected counts; week excludes an item 8 nights ago; topSongs ordered desc and capped at 5.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS. Commit `feat: stats`.

### Task 13: Settings (12), avatar storage, admin, privacy purge

**Files:**
- Create: `src/app/dashboard/settings/page.tsx` (+ `actions.ts`), `src/lib/storage/index.ts`, `src/app/api/uploads/[name]/route.ts`, `src/app/admin/page.tsx` (+ `actions.ts`), `src/lib/privacy/purge.ts`, `scripts/purge-pii.ts`, `src/app/privacy/page.tsx`
- Test: `src/lib/storage/index.test.ts`, `src/lib/privacy/purge.test.ts`

**Interfaces:**
- Produces: `saveAvatar(input: { bytes: Uint8Array; contentType: string }): Promise<string /* public URL */>` — ≤ 2 MB, `image/jpeg|png|webp` else `ValidationError`; driver `STORAGE_DRIVER=local` (default; writes `./.data/uploads/<uuid>.<ext>`, served by `/api/uploads/[name]` with safe-name check) or `r2` (`@aws-sdk/client-s3` PutObject to `R2_BUCKET`, URL `${R2_PUBLIC_URL}/<key>`).
- Produces: `purgeOldPii(db, now: Date): Promise<number>` — nulls `requester_name` and `message` on requests older than 90 days; returns rows changed.
- Settings page per mockup 12 (profile edit incl. avatar on setup page too, accepting switch, sound switch (localStorage), members list, "ส่งลิงก์เชิญสมาชิก" → copies `${APP_URL}/invite/<token>`, sign out). Page switcher shown when user has > 1 performer (sets `sr_performer`).
- Admin page (only `isAdminEmail`; others 404): totals, performer list with suspend/unsuspend, latest 50 requests with delete.
- Privacy page: short Thai text — what is stored (name/table, message, random device id, tip amount claimed), 90-day removal, contact placeholder `[อีเมลติดต่อ]`.

- [ ] **Step 1: Write failing tests:** avatar 3 MB rejected; `image/gif` rejected; local driver writes file and returns `/api/uploads/<name>`; purge nulls only rows older than 90 days.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS. Commit `feat: settings, storage, admin and privacy`.

### Task 14: Landing page, PWA manifest, end-to-end test

**Files:**
- Create/Modify: `src/app/page.tsx` (landing), `src/app/manifest.ts`, `public/icons/*` (simple generated SVG/PNG icons), `e2e/request-flow.spec.ts`, `playwright.config.ts` (webServer)
- Test: `e2e/request-flow.spec.ts`

**Interfaces:**
- Landing (`/`): Thai, for musicians — headline, 3 steps (ใส่เพลง → พิมพ์ QR → ดูคำขอบนจอ), "ใช้ฟรี", CTA to `/login`; same theme.
- Manifest: name `[ชื่อแอพ]` placeholder `songreq`, `start_url: "/dashboard/requests"`, theme `#14110F`.
- Playwright webServer: `npm run db:migrate && npm run dev` with env `AUTH_DEV_LOGIN=true`, `AUTH_SECRET=e2e-secret`, `DATABASE_URL=pglite:./.data/e2e`, `APP_URL=http://localhost:3200`; global setup deletes `./.data/e2e` first.

- [ ] **Step 1: Write the e2e test** `customer request reaches musician and shows seen`: dev-login as `band@example.com` → setup (name "วงทดสอบ", phone `0812345678`) → add custom song "เพลงทดสอบ"/"ศิลปินทดสอบ" → open setlists page, read the public link → second browser context (mobile 390×844) opens it, selects the song, sends with name "โต๊ะ 1" and no tip → sees "ส่งแล้ว" → musician context on `/dashboard/requests` sees "เพลงทดสอบ" and "โต๊ะ 1" → customer page shows "นักดนตรีเห็นแล้ว" within 20 s.
- [ ] **Step 2:** Run `npm run test:e2e` → passes (fix app bugs found, not the test intent).
- [ ] **Step 3:** Commit `test: end-to-end request flow; feat: landing and pwa manifest`.

### Task 15: CI, deploy scripts, runbook (not executed)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `deploy/Caddyfile`, `deploy/deploy.sh`, `deploy/backup.sh`, `deploy/ecosystem.config.cjs`, `docs/runbooks/deploy-gcp.md`

**Interfaces:**
- `ci.yml`: on push/PR — Node 24, `npm ci`, `typecheck`, `lint`, `test`, `build`, Playwright e2e (install chromium).
- `deploy.yml`: `workflow_dispatch` only; builds standalone (`.next/standalone` + `.next/static` + `public` + `drizzle` + `scripts/migrate.ts` compiled or run with `tsx`), tars it, `scp` to VM via secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, runs `sudo bash /opt/songreq/deploy.sh /tmp/release.tgz`.
- `deploy.sh`: unpack to `/opt/songreq/releases/<ts>`, run migrations, switch `/opt/songreq/current` symlink, `pm2 reload songreq --update-env`, 30 s health check on `http://127.0.0.1:3000/api/health`, on failure switch symlink back and reload; keep 3 releases.
- `backup.sh`: `pg_dump | gzip` → upload to R2 with `aws s3 cp --endpoint-url`, delete objects older than 14 days; cron line in runbook; also cron for `scripts/purge-pii.ts` nightly.
- Caddyfile: `:443` with Cloudflare origin cert paths, `reverse_proxy 127.0.0.1:3000 { flush_interval -1 }` (SSE unbuffered).
- Runbook: GCP e2-micro in `us-west1`, Standard network tier, **standard** persistent disk 30 GB, 2 GB swap, Postgres install + tuning for 1 GB RAM, firewall to Cloudflare IPs, budget alert $5, Cloudflare DNS/SSL Full (strict)/cache rule for `/_next/static/*`, R2 bucket + public domain, LINE Login channel + Google OAuth client callback URLs `${APP_URL}/api/auth/callback/line|google`, uptime monitor on `/api/health`, restore procedure.

- [ ] **Step 1:** Write files. `bash -n deploy/*.sh` passes. Validate workflow YAML parses (`npx --yes yaml-lint .github/workflows/*.yml` or `node -e` with `yaml` package).
- [ ] **Step 2:** Commit `chore: ci, deploy scripts and gcp runbook`.
