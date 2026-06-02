# SwiftHum API

NestJS backend for the Watcher (auto-trading rules) + ultrasonic payments. Implements the contract in [`/BACKEND.md`](../../BACKEND.md). The Mini App at [`apps/mini-app/`](../mini-app/) talks to this directly.

## Quick start

```bash
# 1. From repo root: bring up Postgres + Redis
cd ../../infrastructure && docker compose up -d

# 2. Copy env template and fill in secrets
cd ../apps/api
cp .env.example .env
# edit .env: set TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, JWT_SECRET, PAYMENT_TOKEN_SECRET

# 3. Install deps + generate Prisma client
pnpm install
pnpm prisma:generate
pnpm prisma:migrate --name init

# 4. Run API + worker in two terminals
pnpm start:dev          # HTTP on :3000
pnpm worker:dev         # background tick (every WATCHER_TICK_INTERVAL_SEC)
```

The frontend flips off mocks with these in `apps/mini-app/.env.local`:

```
VITE_USE_MOCKS=false
VITE_API_URL=http://localhost:3000
```

## Endpoints

All routes mount at root (no `/api/v1` prefix). Every endpoint except `GET /health`, `GET /` and `POST /auth/telegram` requires `Authorization: Bearer <sessionToken>`.

| Verb | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/telegram` | Exchange Telegram `initData` for a session JWT |
| `GET` | `/rules` | List caller's rules |
| `POST` | `/rules` | Create a rule |
| `GET` | `/rules/:id` | One rule |
| `PATCH` | `/rules/:id` | Partial update |
| `DELETE` | `/rules/:id` | Cascade-deletes executions |
| `POST` | `/rules/:id/pause` | Set state=paused (sticky) |
| `POST` | `/rules/:id/resume` | Recompute state from current price |
| `GET` | `/rules/:id/executions` | Latest 100 firings |
| `GET` | `/prices/current` | Cached 10s via Redis |
| `GET` | `/insights/suggested-rules` | Claude Haiku 4.5 with static fallback |
| `GET` | `/wallets/me` | Caller's wallet |
| `POST` | `/intents` | Create payment intent (debits sender immediately) |
| `POST` | `/redeem` | Redeem audio-borne token, credits receiver |
| `GET` | `/transactions` | Cursor-paginated ledger |

## Architecture notes

- **Money is BIGINT minor units (kobo).** No floats. The global `BigintSerializeInterceptor` converts bigint → number in responses; the frontend receives `amountMinor` as a JS number.
- **Wallet mutations always inside `prisma.$transaction` with `Serializable` isolation + explicit `SELECT ... FOR UPDATE`.** This prevents double-spends and "phantom balance" races.
- **Payment tokens** are HMAC-SHA256 over a base64url-encoded JSON body. Format: `swfh.<b64body>.<b64sig>`. Size ≈ 90–110 bytes — fits ggwave's ~140-byte budget. See [`src/payments/payment-token.ts`](src/payments/payment-token.ts).
- **Sender debited at intent creation**, not at redeem. Expired+unconsumed intents are refunded by the worker tick.
- **Notifications are Redis pub/sub** on channel `swifthum.notifications`. The Python bot subscribes; the API never DMs Telegram directly. **Always publish after the DB transaction commits.**
- **SwiftyEx mode is configurable** via `SWIFTYEX_MODE=simulated|live`. Simulated client uses CoinGecko for prices and returns fake order fills. Live client is a stub — implement when the org releases sandbox keys.
- **Anthropic** uses Claude Haiku 4.5 with prompt caching on the system block. A 3-second timeout falls back to a static suggestion list, so AI is never a hard dependency.

## Module layout

```
src/
├── auth/         Telegram initData verify, JWT guard, @Public/@CurrentUser
├── users/        Upsert by telegramId
├── wallets/      GET /wallets/me
├── prices/       Redis-cached current prices + snapshot writer
├── swiftyex/     Order/price interface, simulated + live clients
├── rules/        CRUD + pure evaluate()/computeState() (unit-tested)
├── insights/     /insights/suggested-rules
├── ai/           Anthropic SDK wrapper with caching + fallback
├── payments/     Token sign/verify, intent create, redeem, transactions
├── bot/          Redis pub/sub publisher
├── prisma/       Global PrismaClient
├── redis/        Global ioredis (client + subscriber)
├── common/       Errors, money utils, exception filter, bigint interceptor, prefixed IDs
├── health/       Public health check
└── worker/       BullMQ watcher tick (separate entrypoint)
```

## Tests

```bash
pnpm test
```

Includes unit tests for:
- `rule-evaluator` — all four operators (lt, gt, crosses_above, crosses_below) + edge cases
- `init-data` — known good + 4 tampered variants
- `payment-token` — sign/verify roundtrip, tampered body, wrong secret, expiry, malformed input

E2E payment tests against a real Postgres are not included; add them once `pnpm prisma:migrate` succeeds against a running database.

## Troubleshooting

- **`Cannot find module '@prisma/client'`**: run `pnpm prisma:generate`.
- **Worker doesn't fire**: confirm `WATCHER_TICK_INTERVAL_SEC` and that Redis is reachable on `REDIS_URL`. Tail the worker log — it logs `tick done in Nms (rules=… fired=… refunded=…)` every interval.
- **Frontend gets `invalid_init_data`**: `TELEGRAM_BOT_TOKEN` is unset or doesn't match the bot that issued the initData. Should be the **@swiftyxbot** token.
