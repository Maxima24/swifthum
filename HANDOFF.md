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
- **Telegram push banners are client-side** — the bot sends **non-silent** messages (`notifications.py` `send_message` has no `disable_notification`), so Telegram pushes every DM. If no **phone** banner shows: the @swifthum_bot chat or Telegram's iOS notifications are muted, Do-Not-Disturb/Focus is on, or the app was **foregrounded** on that chat (Telegram suppresses the banner for the chat you're actively viewing — the DM still lands in-line). Not a code issue.
- **Bot DMs require the recipient to have pressed `/start`** — Telegram bots **cannot initiate** a chat. A notification recipient who only ever used the **Mini App** (never `/start`ed @swifthum_bot) gets a `send_message` **403** and no DM, even though the API published fine. The *acting* party (tapped a bot button / opened a deep-link) has started it and is reachable. For demos, have every account press `/start` once. The mini-app escrow detail screen **polls** (`useEscrow`, 5s), so in-app state still updates without a DM. **Diagnose** with:
  ```bash
  docker logs --since 5m swifthum-api  | grep -i publishing     # did the API publish?
  docker logs --since 5m swifthum-bot  | grep -iE "dispatching notification|not recognized|send_message failed"
  ```
  `publishing …` + bot `send_message failed … 403` → recipient hasn't `/start`ed. `not recognized` → stale bot image (`$C build --no-cache bot && $C up -d bot`). No `publishing …` → API didn't publish (real bug).
- **Notification listener: idle read-timeout reconnect storm (FIXED)** — root cause of "no DMs at all": the bot's `redis.asyncio` pub/sub had a ~5s socket read-timeout, so the blocking `pubsub.listen()` **raised `Timeout reading from redis:6379` on every quiet 5s window**, tearing down + re-subscribing the connection in a loop — any notification published between windows was lost. Fix: `notifications.run` now polls with `pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)` (returns `None` on an idle tick instead of raising) inside the supervised reconnect loop. `main.py` logs if the listener task ever exits. The decisive check that the bot is actually subscribed:
  ```bash
  docker exec swifthum-redis-prod redis-cli PUBSUB CHANNELS   # must list "swifthum.notifications"
  docker logs --since 10m swifthum-bot | grep -iE "listener subscribed|listener error|exited unexpectedly"
  ```
  If the channel is absent, the listener wasn't up — the reconnect loop now keeps it up and logs the real Redis error to fix next.

## Open items / TODO
- **Rotate all secrets** that were shown in chat screenshots (TELEGRAM_BOT_TOKEN via @BotFather `/revoke`, JWT_SECRET, INTERNAL_API_SECRET, PAYMENT_TOKEN_SECRET, SWIFTYEX_KEY_ENC_SECRET, POSTGRES_PASSWORD, CMC_API_KEY).
- `ANTHROPIC_API_KEY` is still `PASTE_YOUR_KEY` → AI features run on static fallbacks until a real key is set.
- `miniapp (unhealthy)` in `docker compose ps` is **cosmetic** (BusyBox `wget --spider` quirk); it serves fine.
- SwiftyEx **live** trading is stubbed (awaiting hackathon API keys); `SWIFTYEX_MODE=sandbox`.

## Hackfest build — Stage 1 (Foundations §0) DONE
See [docs/HACKFEST_PLAN.md](docs/HACKFEST_PLAN.md). Stage 1 shipped the shared foundations the three features (Gift / Receipts / Escrow) sit on. All API tsc + 110 jest tests green; bot tests green.
- **Double-entry ledger** — `apps/api/src/ledger/` (`LedgerService.transfer` is now the *only* money primitive; locks accounts, asserts balance, writes a balanced `LedgerTransaction` + 2 `LedgerEntry` rows, mirrors `Wallet.balanceMinor`). New Prisma models `LedgerAccount/LedgerTransaction/LedgerEntry` + migration `20260607120000_double_entry_ledger`.
- **Existing flows migrated onto the ledger** — seed (`treasury→wallet`), reserve (`wallet→payment_hold`), redeem (`payment_hold→receiver`), cancel/expiry refund (`payment_hold→sender`). No behaviour change for users; `Transaction` projection + `/transactions` + `/history` unchanged.
- **Signer extracted** — `common/hmac.ts` (shared HMAC/base64url, payment-token.ts reuses it) + `common/signed-token.ts` (URL token sign/verify for receipts). New env `SIGNED_TOKEN_SECRET`.
- **Idempotency** — `IdempotencyService` (Redis response cache; money guaranteed at-most-once by unique `LedgerTransaction.idempotencyKey`). **FSM helper** — `common/fsm.ts`. **ids** — added `g_`/`esc_`/`rcpt_` prefixes + `generateClaimCode()`.
- **Bot deep-link** — `start.py` now handles `CommandStart(deep_link=True)`; `gift_<code>` → POST `/gifts/claim` (graceful "coming soon" until §1 adds the endpoint).

### ⚠️ DEPLOY ORDER (critical) — run the backfill before serving traffic
The new payment code reads balances from the **wallet LedgerAccount**, which is empty for pre-existing users until backfilled. Sequence on the VPS:
```bash
$C up -d --build migrate        # applies the ledger migration
$C run --rm api pnpm backfill:ledger   # one-off: mirrors Wallet balances + pending holds into the ledger (idempotent, re-runnable)
$C up -d --build api worker bot # then roll the new code
```
Skipping the backfill → existing users see `insufficient_balance` on send (ledger balance reads 0). Verify: each user's `Wallet.balanceMinor == wallet LedgerAccount balance` (the script prints mismatches and exits non-zero if any).

## Hackfest build — Stage 2 (Gift Links §1) DONE
Full stack, all green (API tsc + `nest build` + 122 jest; mini-app tsc + vite build; bot 49 pytest). Spec in [BACKEND.md §19](BACKEND.md).
- **API** `apps/api/src/gifts/` — `POST /gifts` (`wallet→gift_unclaimed`, returns `t.me/<bot>?start=gift_<claimCode>`, `Idempotency-Key` aware), `POST /gifts/claim` (single-use conditional `updateMany WHERE state='UNCLAIMED'`, `gift_unclaimed→wallet`, tags `acquiredVia='gift'`), `GET /gifts`, `POST /gifts/:id/cancel`. FSM `UNCLAIMED→CLAIMED|EXPIRED|RECLAIMED`. Migration `20260607130000_gift_links` (Gift table + `User.acquiredVia`).
- **Worker** — `GiftsService.expireUnclaimed()` hooked into the watcher tick (refunds unclaimed gifts past `GIFT_TTL_HOURS`, default 168h; shares the `gift_refund_<id>` ledger key with cancel so no double-refund).
- **Notifications** — `gift_received` / `gift_claimed` / `gift_expired` (NestJS union → Python formatters).
- **Bot** — `/gift` opens the mini-app create screen; claim path was already wired in Stage 1.
- **Mini-app** — `GiftCreate` (amount + message → QR/share link) + `GiftList` ("my gifts" with state + cancel); routes `/pay/gifts`, `/pay/gifts/my`; entry points on Pay; gift mocks added for dev mode.
- **New env**: `BOT_USERNAME` (for deep-links, default `swifthum_bot`) + `GIFT_TTL_HOURS` (default 168). **Set `BOT_USERNAME` in prod `.env`** or links point at the wrong bot. No backfill (gift tables start empty) — migration auto-applies on `up`.

## Hackfest build — Stage 3 (Verifiable Receipts §2) DONE
Full stack, all green (API tsc + `nest build` + 127 jest; mini-app tsc + vite build; bot 52 pytest). Spec in [BACKEND.md §20](BACKEND.md).
- **API** `apps/api/src/receipts/` — `ReceiptsService.emit(tx, …)` signs + stores a `Receipt` **inside** the redeem + gift-claim txs (atomic). `GET /receipts` (authed list w/ share URLs) + `GET /receipts/verify?token=` (**`@Public`** — re-verifies the signature, returns masked receipt). Migration `20260607140000_receipts`. Secret = `SIGNED_TOKEN_SECRET` falling back to `PAYMENT_TOKEN_SECRET` (no boot crash if unset).
- **Mini-app** — public `/r/:receiptId` page (`ReceiptView`, **branches before `AuthGate`** in `App.tsx` so a shared link opens for anyone, no Telegram session) with the ✅/❌ "Verified by SwiftyEx" badge; `/pay/receipts` list (share/copy/view); entry on Pay; receipt mocks for dev.
- **Bot** — `/verify <token>` (accepts a raw token or a full receipt link) → public verify endpoint.
- **No new required env** (`SIGNED_TOKEN_SECRET` already in `.env.example`; `MINIAPP_URL` already shared). **No backfill** — receipts table starts empty; migration auto-runs on `up`.
- **Build footgun fixed**: `tsBuildInfoFile` now lives in `dist/` (was a stray root `*.tsbuildinfo` making `rm -rf dist && nest build` silently emit nothing); `*.tsbuildinfo` gitignored. Prod Docker build was never affected (fresh container).

## Hackfest build — Stage 4 (P2P Escrow §3) DONE
Full stack, all green (API tsc + `nest build` + 147 jest; mini-app tsc + vite build; bot 57 pytest). Spec in [BACKEND.md §21](BACKEND.md). **All four Builders-Track features now complete.**
- **API** `apps/api/src/escrow/` — FSM `PROPOSED→ACCEPTED→PAID_MARKED→COMPLETED` (+ DECLINED/CANCELLED/EXPIRED, DISPUTED→RESOLVED_RELEASED|RESOLVED_REFUNDED), service-enforced via `assertTransition` + conditional `updateMany WHERE state=<from>`. Endpoints: `POST /escrows` (fund `buyer→escrow_hold`, returns `escrow_<code>` link), `/escrow/join` (single-use bind), accept/decline/cancel/mark-paid/release/dispute, `GET /escrows[/:id]`. Shared ledger keys (`escrow_fund/refund/release_<id>`) so funds never double-move; receipt emitted on release. Migration `20260607150000_escrow` (Escrow + append-only EscrowEvent).
- **Admin dispute resolve** — internal `POST /admin/escrows/:id/resolve` (`X-Internal-Secret` = `INTERNAL_API_SECRET`), AI-assisted via new `AnthropicService.resolveDispute` (3s timeout, static `refund` fallback — works even with `ANTHROPIC_API_KEY` unset).
- **Worker** — `expireProposed()` in the watcher tick refunds un-accepted (PROPOSED) escrows past `ESCROW_TTL_HOURS` (default 72).
- **Bot** — `escrow_<code>` deep-link join → Accept/Decline inline buttons; `/escrow` lists with role/state-aware action buttons + callbacks (notifications are text-only, so buttons come from these direct interactions); 7 escrow event DMs.
- **Mini-app** — `/pay/escrow` (list), `/pay/escrow/new` (create + share invite/QR), `/pay/escrow/:id` (detail with **server-driven countdown** from `ttlExpiresAt`, state-aware actions, event timeline). Pay entry + dev mocks.
- **New env**: `ESCROW_TTL_HOURS=72`. No backfill — migration auto-runs on `up`.
- Extended `module-wiring.spec` to assert `EscrowModule` is registered in both app + worker (Stage-3 DI-crash guard).

### All Builders-Track features shipped (Stages 1–4)
Ledger → Gift Links → Receipts → Escrow. Remaining: polish + the 3-min demo script (HACKFEST_PLAN §7).

## Extra feature — Pay by @username (direct wallet→wallet) DONE
Full stack, all green (API tsc + `nest build` + 156 jest; mini-app tsc + vite build; bot 64 pytest). Spec in [BACKEND.md §22](BACKEND.md).
- **Send NGN straight to another SwiftHum user by Telegram @handle** — no QR/gift/intent. `User.username` column (`@unique`, lowercased) + migration `20260607160000_user_username`; captured on Mini-App sign-in (`upsertByTelegram`) + forwarded by the bot on exchange (optional `username`, stored by a `UsernameCaptureMiddleware`). Re-used handles move to the current owner. No backfill (fills in lazily).
- **API**: `GET /users/lookup?username=` (resolve handle → name) + `POST /transfers` (`PaymentsService.sendToUser`: one `wallet→wallet` ledger transfer, kind `transfer`, reuses Transaction projection + receipt + `payment_sent`/`payment_received` DMs). Rejects unknown handle / self-send / insufficient funds; Idempotency-Key aware.
- **Mini-app**: `/pay/send-to-user` (type @handle → live debounced lookup → amount → send; unknown handle → "send a gift instead" CTA). Entry on Pay.
- **Bot**: `/pay @username 5000` (or `5k`) → Confirm/Cancel inline → transfer (or gift-link offer if not found).
- No new env. Migration auto-runs on `up`.

## Ops fix — bot notifications now reliable (root-caused)
The bot delivered **no** DMs because its `redis.asyncio` pub/sub had a ~5s socket read-timeout, so the blocking `pubsub.listen()` raised `Timeout reading from redis` every idle window → reconnect storm → lost messages. Fixed: `notifications.run` now polls with `pubsub.get_message(timeout=1.0)` (returns None on idle) inside a supervised reconnect loop; `main.py` logs if the listener task dies. Also: API publish logging (`publishing <type> → telegramId=…`), and the "Telegram **push banner** is client-side (unmute chat / background app / Do-Not-Disturb)" gotcha — see the Gotchas section.

## Earlier roadmap (bot hub — partially superseded by hackfest work)
- **Phase 1: interactive bot hub** — `/menu` inline hub + quick commands, SwiftyEx read features.
- **Phase 2: conversational wizards** — aiogram FSM for guided rule creation/send.
- **Phase 3: deeper SwiftyEx** — in-chat trading once live keys land.
