# SwiftHum — Handoff / Continuation

> Living doc for picking up work across sessions. Last updated after **QR/ultrasonic payments shipped to production**.
> Branch: `bot`. Prod host: single **Hostinger** VPS, Docker Compose, Cloudflare in front.

---

## Status — what works

**Both core hackathon features are done and verified in production:**

- **The Watcher** — auto-trading rules (WHEN price crosses → THEN buy/sell/alert). Worker (`apps/api/src/worker`) ticks every 20s, evaluates rules against **real NGN prices**, fires + logs executions, DMs the user.
- **Ultrasonic + QR payments** — phone-to-phone NGN transfer. Sender reserves funds → token broadcast as **ggwave chirp** or **QR**; receiver scans (Telegram **native** scanner) → redeem credits them. **Sign-in, dashboard, intent create / cancel / refund, two-phone QR redeem, and receive DMs all confirmed working.**

Also live: **voice-note payments** (Groq Whisper STT → parse), **weekly insights digest** (Sunday cron DM), **AI rule suggestions + fraud score** (Claude Haiku, falls back to static), **notifications toggle** (persisted, gates DMs), **prices feed** (CoinGecko → CoinMarketCap → static, 60s cache).

## Architecture map
- `apps/api` — NestJS. Modules: auth (Telegram initData→JWT), rules, prices, payments (intents/redeem/cancel/status/transactions), swiftyex (sandbox|live adapter), ai (Claude), insights, wallets, users, bot-push (Redis pubsub). Worker = separate process, same image.
- `apps/bot` — Python aiogram. Handlers: start, help, wallet (`/balance`), rules (`/rules` + inline pause/resume), parse (free-text), voice (voice notes). Subscribes to Redis `swifthum.notifications` and DMs users.
- `apps/mini-app` — Vite + React (Telegram Mini App). Dashboard, RuleBuilder/Detail, Pay (Send/Receive), Settings. Built with `VITE_USE_MOCKS=false` + `VITE_API_URL` baked in at image build.
- `infrastructure/` — `docker-compose.prod.yml` (postgres, redis, migrate, api, worker, bot, miniapp, edge), nginx edge, `prod/.env(.example)`, `prod/README.md`.

## Public hostnames (must match edge `server_name`s + Cloudflare DNS)
- Mini App: `https://swifthum.quickbiteltd.org`
- API: `https://swifthum-api.quickbiteltd.org`
- `MINIAPP_URL`, `CORS_ORIGIN`, `VITE_API_URL` in `infrastructure/prod/.env` must all agree with these.

## Deploy quick-ref
```bash
cd ~/swifthum && git pull
C="docker compose -f infrastructure/docker-compose.prod.yml --env-file infrastructure/prod/.env"
$C up -d --build            # rebuilds changed images, runs migrate, recreates containers
$C restart edge             # only if api/miniapp were recreated (see gotcha)
curl -fsS https://swifthum-api.quickbiteltd.org/health   # → {"status":"ok"}
```
- **Mini-app changes need a rebuild** (`VITE_*` are inlined at build time): `$C up -d --build miniapp`.
- **Backend changes** (api/worker share one image): `$C up -d --build api worker`.
- **Bot-only changes**: `$C up -d --build bot` (bot isn't behind the edge — no edge restart needed).
- `--env-file` is **required** on `build` or `VITE_API_URL` bakes in empty → app talks to localhost.

## Gotchas learned (don't rediscover these)
- **Edge 502 after redeploy** — nginx caches upstream IPs; recreating api/miniapp gives new IPs. Mitigated: `edge.conf.template` now uses `resolver 127.0.0.11` + variable `proxy_pass`. If it ever 502s anyway, `restart edge`.
- **Mock-mode prod build** — the bundle defaults to in-memory mocks unless `VITE_USE_MOCKS=false` + `VITE_API_URL` are passed as Docker build args (now wired in `docker-compose.prod.yml`).
- **Sign-in "no initData"** — `@telegram-apps/sdk` v3 needs `initData.restore()`; `getInitDataRaw()` now tries `window.Telegram.WebApp.initData` → `retrieveRawInitData()` → `initData.raw()`. Must open the app via the **bot menu button** (Telegram only injects initData then).
- **Contract mismatches (mock vs real backend)** — fixed: suggestions wrap `{ id, reason, rule:{…} }`; `/intents` accepts `currency`. The API's `forbidNonWhitelisted` rejects any field not in the DTO — keep DTOs in sync with what the mini-app sends.
- **Payment money model** — debit-on-generate (reserve); refunded by **cancel** (`POST /intents/:id/cancel`), **leave-screen auto-cancel**, or the **120s expiry sweep**. `redeem` rejects `refundedAt` intents (no double-spend). Sender polls `GET /intents/:id` for the "Paid ✓" state.

## Open items / TODO
- **Rotate all secrets** that were shown in chat screenshots (TELEGRAM_BOT_TOKEN via @BotFather `/revoke`, JWT_SECRET, INTERNAL_API_SECRET, PAYMENT_TOKEN_SECRET, SWIFTYEX_KEY_ENC_SECRET, POSTGRES_PASSWORD, CMC_API_KEY).
- `ANTHROPIC_API_KEY` is still `PASTE_YOUR_KEY` → AI features run on static fallbacks until a real key is set.
- `miniapp (unhealthy)` in `docker compose ps` is **cosmetic** (BusyBox `wget --spider` quirk); it serves fine.
- SwiftyEx **live** trading is stubbed (awaiting hackathon API keys); `SWIFTYEX_MODE=sandbox`.

## Roadmap (current focus)
- **Phase 1 (in progress): interactive bot hub** — `/menu` inline hub + quick commands (`/prices`, `/portfolio`, `/history`), SwiftyEx read features (holdings, prices, history, account link/unlink), BotFather command menu.
- **Phase 2 (next): conversational wizards** — aiogram FSM for guided rule creation and guided send, without opening the Mini App.
- **Phase 3 (later): deeper SwiftyEx** — in-chat trading once live keys land.
