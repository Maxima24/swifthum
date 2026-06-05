# Backend Spec — Swifthum API

> Audience: the backend engineer (or another AI) building [apps/api/](apps/api/). The frontend at [apps/mini-app/](apps/mini-app/) is **already done** and runs against a mock API. This document is the contract — match the routes and shapes exactly and the frontend flips from mock to real with two env vars.

---

## 0. Project context

**SwiftyEx Hackfest Osun 2026** — a 72-hour hackathon. SwiftyEx is an existing Telegram bot for crypto trading (BTC/ETH/USDT ↔ NGN). We are **adding two features** to it inside a Telegram Mini App:

1. **The Watcher** — visual "WHEN/THEN" auto-trading rules. *"Cron jobs for your money."* User says "WHEN USDT < ₦1,620 THEN BUY ₦5,000 worth." The Watcher monitors prices 24/7 and executes the trade on SwiftyEx when the condition trips. The card dashboard renders each rule as `sleeping → watching → fired → paused`.

2. **Ultrasonic payments** — phone-to-phone NGN payments using inaudible >18kHz audio (via ggwave-js). The sender's phone "chirps" a signed token; the receiver's phone decodes it and redeems with the backend. No QR, no app install, no shared network.

**The AI layer is Claude** (Anthropic). Specifically:
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) for fast / cheap calls: rule suggestions on the dashboard, plain-English rule summaries, fraud risk scoring on payment intents.
- Use prompt caching (5-minute TTL) for any prompt that has a stable system block.
- Throttle and fall back: AI is *additive*. If Anthropic is slow or returns an error, return a sensible static result rather than failing the request.

**SwiftyEx trade API**: not yet given to us — the hackathon organizers will release sandbox keys + docs partway through. Until then, any rule that resolves to `buy`/`sell` should fire with `outcome: "simulated"`. The frontend already handles this state.

**Telegram-first, Android-only:** the bot in [apps/bot/](apps/bot/) (Python aiogram) is the entry point. Mini App loads inside the Telegram WebView. Demo phones are Android.

---

## 1. Stack

- **Framework:** NestJS 11 (TypeScript, strict mode)
- **DB:** Postgres 16 + Prisma 5
- **Cache / queue / pubsub:** Redis 7 (use BullMQ for the worker, pub/sub for bot push)
- **AI:** `@anthropic-ai/sdk` — model `claude-haiku-4-5-20251001`
- **Auth:** Telegram WebApp `initData` HMAC verify → server-signed JWT (HS256)
- **Validation:** `class-validator` + `class-transformer` (NestJS native)
- **Money type everywhere:** `bigint` minor units (kobo for NGN, satoshi-style integer for crypto). **Never floats.**
- **Logging:** `pino` JSON to stdout
- **Deploy target:** Docker → EC2 → Cloudflare (see [infrastructure/](infrastructure/))

`apps/api/package.json` should include (at minimum):

```
@nestjs/common @nestjs/core @nestjs/config @nestjs/jwt @nestjs/platform-express
@anthropic-ai/sdk
@prisma/client prisma
bullmq ioredis
class-validator class-transformer
pino pino-pretty
zod   # only if you prefer zod over class-validator — pick one
```

---

## 2. Suggested folder layout for apps/api/

```
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── auth/                   # initData verify, JWT guard, current-user decorator
│   ├── users/
│   ├── rules/                  # CRUD + state machine
│   ├── executions/
│   ├── prices/                 # current price + snapshots
│   ├── insights/               # /insights/suggested-rules (Claude)
│   ├── wallets/
│   ├── payments/               # /intents + /redeem + /transactions
│   ├── ai/                     # AnthropicService, prompt builders, caching
│   ├── swiftyex/               # SwiftyEx HTTP client (sandbox/live toggle)
│   ├── bot/                    # push channel to apps/bot
│   ├── worker/                 # BullMQ rule evaluator
│   └── common/                 # filters, interceptors, money utils
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── test/
```

---

## 3. Env vars

```env
# Postgres
DATABASE_URL=postgres://...

# Redis
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...      # used for initData HMAC + bot HTTP API
TELEGRAM_INITDATA_MAX_AGE_SEC=3600    # reject stale initData beyond this

# Auth
JWT_SECRET=<random 32+ bytes>
JWT_EXPIRES_IN=24h

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# SwiftyEx
SWIFTYEX_BASE_URL=                    # blank until hackathon team gives it to us
SWIFTYEX_API_KEY=                     # blank until then
SWIFTYEX_MODE=simulated               # simulated | live

# Payment intent
PAYMENT_INTENT_TTL_SEC=30             # how long an audio token is valid
PAYMENT_TOKEN_SECRET=<random 32+ bytes>  # HMAC for intent tokens

# Worker
WATCHER_TICK_INTERVAL_SEC=20
```

---

## 4. Conventions

- **Base URL:** the frontend prefixes every path with `VITE_API_URL`. Mount routes at root, e.g. `GET /rules` not `GET /api/v1/rules`.
- **Auth:** every endpoint except `POST /auth/telegram` requires `Authorization: Bearer <sessionToken>`. JWT carries `{ sub: userId, telegramId }`.
- **Content type:** JSON in, JSON out.
- **Money:** integer minor units. `5000_00` = ₦5,000.00. Use the underscore separator in TS for readability if you like; it's just a number literal.
- **IDs:** opaque strings. Suggested prefixes: `u_` user, `r_` rule, `e_` execution, `i_` intent, `tx_` transaction.
- **Timestamps:** ISO-8601 UTC (`2026-05-25T14:30:00.000Z`).
- **Errors:** JSON body `{ "error": "<machine_code>", "message": "<human readable>" }` with the matching HTTP status.
  - **Frontend keys on these exact strings** — do not rename: `insufficient_balance`, `invalid_or_expired`, `already_redeemed`, `expired`, `invalid_init_data`, `not_found`, `validation_error`.
- **Pagination:** cursor-based. Response `{ items: [...], nextCursor: string | null }`. Default `limit=50`, max `100`.

### Error response shape

```json
HTTP 400
{ "error": "validation_error", "message": "amountMinor must be a positive integer" }
```

### Global wiring

- Global `ValidationPipe` with `{ whitelist: true, transform: true, forbidNonWhitelisted: true }`.
- Global exception filter that maps `HttpException` to the error shape above.
- Global `JwtAuthGuard` with `@Public()` decorator opt-out (used only by `/auth/telegram` and `/health`).
- CORS: allow the Mini App origin (dev: `http://localhost:5173`, prod: the deployed URL).

---

## 5. Auth

### `POST /auth/telegram`  (public)

Exchange Telegram WebApp `initData` for a session JWT. **The only unauthenticated endpoint** (besides `/health`).

**Request**
```json
{ "initData": "<raw initData string from Telegram.WebApp.initData>" }
```

**Response 200**
```json
{
  "sessionToken": "<jwt>",
  "user": { "id": "u_xxx", "telegramId": 12345, "displayName": "Demo User" }
}
```

**Error 401** `{ "error": "invalid_init_data", "message": "..." }`.

#### HMAC verification (Telegram spec)

```ts
import crypto from 'crypto';

function verifyInitData(initData: string, botToken: string): URLSearchParams | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  // Sort key=value pairs alphabetically, join with \n
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // secretKey = HMAC_SHA256("WebAppData", botToken)
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed  = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return computed === hash ? params : null;
}
```

Then:
1. Reject if `Date.now()/1000 - Number(params.get('auth_date')) > TELEGRAM_INITDATA_MAX_AGE_SEC`.
2. Parse `params.get('user')` as JSON → `{ id, first_name, last_name?, username? }`.
3. Upsert `User` keyed by `telegramId`. `displayName = first_name + (last_name ? " " + last_name : "")` or `username` fallback.
4. **On first sign-in:** create their `Wallet` with `balanceMinor = 25_000_00` (₦25,000 seed for demo).
5. Sign JWT: `{ sub: user.id, telegramId, iat, exp }` with `JWT_SECRET`, `JWT_EXPIRES_IN`.

---

## 6. The Watcher — Rules

All endpoints scoped to the authenticated user. Return `404 { "error": "not_found" }` if the rule doesn't exist *or* belongs to someone else (don't leak existence).

### Type recap

`Rule` shape — matches [apps/mini-app/src/types.ts](apps/mini-app/src/types.ts):

```ts
type Asset    = 'USDT' | 'BTC' | 'ETH';
type Operator = 'lt' | 'gt' | 'crosses_above' | 'crosses_below';
type Action   = 'buy' | 'sell' | 'alert';
type RuleState= 'sleeping' | 'watching' | 'fired' | 'paused';

interface Rule {
  id: string;
  name: string;
  when: { asset: Asset; op: Operator; priceMinor: number };
  then: { action: Action; amountMinor?: number; currency?: 'NGN' | Asset };
  state: RuleState;
  createdAt: string;
  lastEvaluatedAt?: string;
  firedCount: number;
}
```

### `GET /rules`

List the caller's rules, newest first.

**Response 200** — `Rule[]`.

### `POST /rules`

**Request**
```json
{
  "name": "BUY USDT",
  "when": { "asset": "USDT", "op": "lt", "priceMinor": 1620_00 },
  "then": { "action": "buy", "amountMinor": 5000_00, "currency": "NGN" }
}
```

**Validation**
- `name`: optional string ≤ 80 chars. If absent, default `${then.action.toUpperCase()} ${when.asset}`.
- `when.asset` ∈ `{USDT, BTC, ETH}`.
- `when.op` ∈ `{lt, gt, crosses_above, crosses_below}`.
- `when.priceMinor`: positive integer.
- `then.action` ∈ `{buy, sell, alert}`.
- If `then.action` ∈ `{buy, sell}` → `amountMinor` (positive int) and `currency` are **required**.
- If `then.action === 'alert'` → both can be omitted.
- Rate limit: 50 rules per user (return `400 { "error": "rule_limit_reached" }`).

**Handler logic**
1. Validate.
2. Insert row with `state = computeState(when, currentPrice)` (see below), `firedCount = 0`, `lastEvaluatedAt = now`.
3. Return the new `Rule`.

### `GET /rules/:id`

Single rule. **404** if missing or not owned.

### `PATCH /rules/:id`

Partial update. Accepts any subset of `{ name, when, then }`. Re-validates the same as create. After update, **recompute `state`** from current price (unless `state === 'paused'`, which is sticky). Return updated `Rule`.

### `DELETE /rules/:id`

Delete the rule and **cascade-delete its executions**. Return `204 No Content`.

### `POST /rules/:id/pause`

Set `state = 'paused'`. Return updated `Rule`.

### `POST /rules/:id/resume`

Recompute `state` from current price (will be `sleeping` or `watching`). Return updated `Rule`.

### `GET /rules/:id/executions`

List firings of this rule, newest first. Limit 100.

**Response 200**
```json
[
  {
    "id": "e_xyz",
    "ruleId": "r_abc123",
    "firedAt": "2026-05-25T14:30:00.000Z",
    "priceAtFireMinor": 1619_50,
    "outcome": "success",
    "detail": "Bought 3.08 USDT at ₦1,619.50"
  }
]
```

`outcome`: `"success" | "failed" | "simulated"`.

### State machine (server-owned)

The frontend renders whatever you send — own this fully.

```
                  ┌─── paused (sticky) ────┐
                  ▼                        │
   create / update / tick                  │ POST /resume
        │                                  │
        ▼                                  │
   compute |current - target| / target     │
        │                                  │
        ├── ≤ 1%  → watching ──────────────┤
        ├── > 1%  → sleeping ──────────────┤
        │                                  │
        └── condition met (worker) → fired ┘
                  │
                  └── auto-decay after 5min → sleeping/watching
```

```ts
function computeState(when: RuleCondition, currentPriceMinor: number | undefined): RuleState {
  if (!currentPriceMinor) return 'sleeping';
  const drift = Math.abs(currentPriceMinor - when.priceMinor) / when.priceMinor;
  return drift <= 0.01 ? 'watching' : 'sleeping';
}
```

---

## 7. Worker — rule evaluator

A BullMQ repeating job. Runs every `WATCHER_TICK_INTERVAL_SEC` (default 20s).

### Per tick

1. **Fetch current prices** for `USDT`, `BTC`, `ETH` (use `PricesService`, see §9).
2. **Write to `price_snapshots`** — needed for `crosses_above` / `crosses_below`.
3. **Load all non-paused rules** (paginate if > 1000 — for hackathon, fine to load all).
4. **For each rule**, evaluate:
   - `lt`: `currentPrice < target` → fire.
   - `gt`: `currentPrice > target` → fire.
   - `crosses_above`: previous snapshot `< target` AND current `≥ target` → fire.
   - `crosses_below`: previous snapshot `> target` AND current `≤ target` → fire.
5. **If not firing**: update `lastEvaluatedAt` and recompute `state` (sleeping/watching).
6. **If firing**:
   a. Insert `RuleExecution` row.
   b. If `then.action` ∈ `{buy, sell}` and `SWIFTYEX_MODE === 'live'`: call `SwiftyexService.placeOrder(...)`. Wrap in try/catch — on failure, set `outcome = 'failed'`, store error in `detail`.
   c. If simulated mode: `outcome = 'simulated'`, build `detail` like `"Would buy 3.08 USDT at ₦1,619.50"`.
   d. Update rule: `state = 'fired'`, `firedCount++`, `lastEvaluatedAt = now`.
   e. Push notify the user via the bot channel (§13) with the rule name, action, amount, price, and outcome.
7. **Auto-decay**: rules in state `fired` for > 5 minutes → recompute back to `sleeping`/`watching`.

### Worker code skeleton

```ts
// src/worker/watcher.processor.ts
@Processor('watcher')
export class WatcherProcessor {
  constructor(
    private prices: PricesService,
    private rules: RulesService,
    private swiftyex: SwiftyexService,
    private bot: BotPushService,
  ) {}

  @Process('tick')
  async tick() {
    const current = await this.prices.fetchAll();        // { USDT, BTC, ETH }
    const previous = await this.prices.previousSnapshot();
    await this.prices.snapshot(current);

    const rules = await this.rules.allActive();
    for (const rule of rules) {
      const shouldFire = evaluate(rule.when, current, previous);
      if (!shouldFire) {
        await this.rules.touch(rule.id, current);
        continue;
      }
      await this.fire(rule, current);
    }
    await this.rules.decayStaleFired(5 * 60 * 1000);
  }
}
```

`evaluate` is pure — easy to unit test. Aim for ≥ 1 unit test per operator.

---

## 8. SwiftyEx integration

Until the hackathon team gives us keys + docs, expose a service interface and implement a **simulated** adapter. Switch implementation by `SWIFTYEX_MODE`.

```ts
// src/swiftyex/swiftyex.service.ts
interface OrderRequest {
  side: 'buy' | 'sell';
  asset: Asset;
  amountMinor: bigint;
  currency: 'NGN' | Asset;
  userId: string;
}
interface OrderResult {
  status: 'success' | 'failed';
  filledPriceMinor?: bigint;
  filledQty?: string;
  errorMessage?: string;
}

interface SwiftyexClient {
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  currentPrices(): Promise<{ USDT: bigint; BTC: bigint; ETH: bigint }>;
}
```

Implementations:
- `SimulatedSwiftyexClient` — uses a static price feed or a public source (e.g. CoinGecko) for prices; returns `{ status: 'success', filledPriceMinor: <current> }` for orders without actually moving money.
- `LiveSwiftyexClient` — real HTTP calls. Add when keys arrive.

`SwiftyexService` picks one based on `SWIFTYEX_MODE`. The rest of the code never branches on the mode.

---

## 9. Prices

### `GET /prices/current`

**Response 200**
```json
{ "USDT": 1620_00, "BTC": 9_500_000_00, "ETH": 5_200_000_00 }
```

Pulls from `SwiftyexClient.currentPrices()`. **Cache in Redis with 10s TTL** — the frontend polls every ~30s and the worker every 20s; together that's a lot of calls without caching.

---

## 10. AI suggestions — Claude

### `GET /insights/suggested-rules`

Returns 3-5 pre-fab rule cards for the empty Dashboard.

**Response 200** — array of suggestion objects. The Mini App expects each
suggestion to wrap the rule under a `rule` key and include an `id`:
```json
[
  {
    "id": "sug_abc123",
    "reason": "USDT dipped below ₦1,600 three times in the last 7 days.",
    "rule": {
      "name": "Buy the dip — USDT under ₦1,600",
      "when": { "asset": "USDT", "op": "lt", "priceMinor": 1600_00 },
      "then": { "action": "buy", "amountMinor": 5000_00, "currency": "NGN" }
    }
  }
]
```
(`AnthropicService.suggestRules` returns the flat `{ name, when, then, reason }`
shape; `InsightsService` wraps it into the above before responding.)

### Implementation

Use `@anthropic-ai/sdk`, model `claude-haiku-4-5-20251001`. Cache the **system prompt** (it's stable) using the SDK's `cache_control` block — this halves token cost on every subsequent call.

```ts
// src/ai/anthropic.service.ts
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AnthropicService {
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  private model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

  async suggestRules(args: {
    recentPrices: { asset: string; priceMinor: number; takenAt: string }[];
    userRules: Rule[];
  }) {
    const systemPrompt = SUGGEST_RULES_SYSTEM_PROMPT;   // big stable block
    const userPrompt   = JSON.stringify(args);

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Claude returns JSON in a code block — parse defensively
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    return parseSuggestionsJson(text);
  }
}
```

### System prompt for `suggestRules` (sketch)

```
You are an assistant inside SwiftyEx — a Nigerian crypto trading bot. Your job is to
suggest 3-5 simple auto-trading rules a user might want to set up.

Input is JSON with:
  - recentPrices: snapshots of USDT, BTC, ETH in NGN minor units (kobo) from the last 7 days
  - userRules: rules the user already has (don't duplicate)

Return STRICT JSON: an array of objects shaped like:
  {
    "name": string,                  // friendly, < 60 chars
    "when": { "asset": "USDT"|"BTC"|"ETH", "op": "lt"|"gt"|"crosses_above"|"crosses_below", "priceMinor": integer },
    "then": { "action": "buy"|"sell"|"alert", "amountMinor": integer?, "currency": "NGN"? },
    "reason": string                 // one-sentence WHY, plain English, mentions concrete observation
  }

Rules:
- Use round NGN amounts (5000_00, 10000_00, 20000_00 minor).
- Suggest at least one BUY-the-dip and one SELL-the-peak.
- Avoid duplicating an existing user rule on the same asset+op.
- Output JSON only — no prose, no markdown fences.
```

### Fallback

If the Claude call throws or times out (> 3s), return a **static** seed list (hard-coded array of 3 suggestions). Log the error. Do **not** fail the request — the frontend treats empty / static suggestions as fine.

### Other Claude touch-points (lower priority)

- **Plain-English rule summary** — e.g. on `POST /rules`, generate a `summary` field like *"Buys ₦5,000 of USDT whenever it drops below ₦1,620."* Optional; not required by the frontend yet.
- **Fraud risk on `POST /intents`** — see §11. For hackathon, a static `0.1` is fine. If wired to Claude, prompt with sender history, amount, recent intent rate.

---

## 11. Ultrasonic payments

The frontend encodes the **token** from `POST /intents` into >18kHz audio using ggwave-js. ggwave's payload budget is **~140 bytes**, so the token must be short.

**Token format** (suggested):

```
swfh.<base64url(JSON({ i: intentId, a: amountMinor, e: expEpochSec }))>.<base64url(HMAC_SHA256(body, PAYMENT_TOKEN_SECRET))>
```

Total size for a typical intent: ~100 bytes — fits comfortably. Use HMAC, not full JWT — the prefix `swfh.` and our own short payload keep size down.

### `GET /wallets/me`

**Response 200**
```json
{ "balanceMinor": 25_000_00, "currency": "NGN" }
```

### `POST /intents`  (sender)

Issue a payment intent + audio-ready token.

**Request**
```json
{ "amountMinor": 50000 }
```

Validation: `amountMinor` positive integer, ≤ user's `balanceMinor`. Otherwise `400 { "error": "insufficient_balance" }`.

**Handler logic** — wrap in a DB transaction:
1. Lock the sender's wallet row (`SELECT ... FOR UPDATE`).
2. Check balance ≥ amount; reject otherwise.
3. **Reserve funds**: `balanceMinor -= amountMinor` immediately. This prevents double-spend if the user fires twice fast.
4. Insert `PaymentIntent` row with `expiresAt = now + PAYMENT_INTENT_TTL_SEC` (default 30s), `tokenHash = sha256(token)`.
5. (Optional) Call `AnthropicService.scoreFraud(...)` for `riskScore`. Static `0.1` fallback.
6. Return:
```json
{
  "intentId": "i_xxx",
  "token": "swfh.eyJp...",
  "amountMinor": 50000,
  "currency": "NGN",
  "expiresAt": "2026-05-25T14:30:30.000Z",
  "riskScore": 0.1
}
```

**Background job**: a periodic task (every 5s) that finds expired *unconsumed* intents and **refunds** the reserved amount back to the sender's wallet. Without this, expired intents lock funds forever.

### `POST /redeem`  (receiver)

**Request**
```json
{ "token": "swfh.eyJp...xyz" }
```

**Handler logic** — DB transaction:
1. Parse token, verify HMAC. Bad → `401 { "error": "invalid_or_expired" }`.
2. Lookup intent by `tokenHash`. Missing → `401 invalid_or_expired`.
3. Check `consumedAt == null`. Set → `409 { "error": "already_redeemed" }`.
4. Check `expiresAt > now`. Past → `410 { "error": "expired" }` (and the refund job will catch it shortly).
5. Lookup the sender's `User`. Get `senderName = displayName`.
6. Mark intent consumed: `consumedAt = now`. Insert into `used_nonces` for belt-and-braces replay defense.
7. Credit receiver wallet: `balanceMinor += amountMinor`. **No debit here** — sender was debited at intent time.
8. Insert **two** `Transaction` rows:
   - For sender: `direction='sent'`, `counterpartyName=receiverName`.
   - For receiver: `direction='received'`, `counterpartyName=senderName`.
9. Push notify **both users** via the bot (§13).
10. Return:
```json
{
  "status": "ok",
  "intentId": "i_xxx",
  "amountMinor": 50000,
  "currency": "NGN",
  "sender": { "displayName": "Demo User" }
}
```

### `GET /transactions?cursor=&limit=`

Paginated history for the authenticated user, newest first. `direction` is from the **caller's** perspective.

**Response 200**
```json
{
  "items": [
    {
      "id": "tx_xyz",
      "direction": "received",
      "amountMinor": 50000,
      "currency": "NGN",
      "counterparty": { "displayName": "Demo User" },
      "settledAt": "2026-05-25T14:30:01.000Z"
    }
  ],
  "nextCursor": null
}
```

---

## 12. Prisma schema

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id            String   @id @default(cuid())
  telegramId    BigInt   @unique
  displayName   String
  createdAt     DateTime @default(now())
  rules         Rule[]
  wallet        Wallet?
  swiftyAccount SwiftyexAccount?
  transactions  Transaction[]
  intents       PaymentIntent[]
}

model SwiftyexAccount {
  id       String @id @default(cuid())
  userId   String @unique
  apiKey   String   // encrypted at rest — use pgcrypto or app-layer envelope encryption
  user     User   @relation(fields: [userId], references: [id])
}

model Rule {
  id              String   @id @default(cuid())
  userId          String
  name            String
  whenAsset       String
  whenOp          String
  whenPriceMinor  BigInt
  thenAction      String
  thenAmountMinor BigInt?
  thenCurrency    String?
  state           String   @default("sleeping")
  firedCount      Int      @default(0)
  lastEvaluatedAt DateTime?
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id])
  executions      RuleExecution[]
  @@index([userId])
  @@index([state])
}

model RuleExecution {
  id               String   @id @default(cuid())
  ruleId           String
  firedAt          DateTime @default(now())
  priceAtFireMinor BigInt
  outcome          String
  detail           String?
  rule             Rule     @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  @@index([ruleId, firedAt])
}

model PriceSnapshot {
  id         String   @id @default(cuid())
  asset      String
  priceMinor BigInt
  takenAt    DateTime @default(now())
  @@index([asset, takenAt])
}

model Wallet {
  userId       String @id
  balanceMinor BigInt @default(0)
  currency     String @default("NGN")
  user         User   @relation(fields: [userId], references: [id])
}

model PaymentIntent {
  id           String   @id @default(cuid())
  senderId     String
  amountMinor  BigInt
  currency     String   @default("NGN")
  tokenHash    String   @unique
  expiresAt    DateTime
  consumedAt   DateTime?
  refundedAt   DateTime?
  riskScore    Float    @default(0.1)
  createdAt    DateTime @default(now())
  sender       User     @relation(fields: [senderId], references: [id])
  @@index([senderId])
  @@index([expiresAt, consumedAt, refundedAt])
}

model Transaction {
  id               String   @id @default(cuid())
  userId           String
  direction        String   // sent | received
  amountMinor      BigInt
  currency         String   @default("NGN")
  counterpartyName String
  intentId         String?
  settledAt        DateTime @default(now())
  user             User     @relation(fields: [userId], references: [id])
  @@index([userId, settledAt])
}

model UsedNonce {
  tokenHash String   @id
  usedAt    DateTime @default(now())
}
```

**Money safety:** all wallet mutations (intent create, intent expire/refund, redeem) must be inside `db.$transaction(...)` with row locks. Test this — a double-redeem race is the worst possible bug.

---

## 13. Bot push notifications

The bot at [apps/bot/](apps/bot/) is the push channel. The API never DMs the user directly — it publishes events to Redis pub/sub, the bot subscribes and DMs.

### Channel & payload

```
Redis channel: swifthum.notifications

Payload (JSON):
{
  "telegramId": 12345,
  "type": "rule_fired" | "payment_received" | "payment_sent",
  "data": {
    // for rule_fired:
    "ruleName": "BUY USDT",
    "action": "buy",
    "amountMinor": 5000_00,
    "currency": "NGN",
    "priceMinor": 1619_50,
    "outcome": "success" | "failed" | "simulated"
    // for payment_received / payment_sent:
    "amountMinor": 50000,
    "counterpartyName": "Demo User"
  }
}
```

### When to publish

- **Worker** publishes `rule_fired` after each fire.
- **`POST /redeem`** publishes `payment_received` to receiver, `payment_sent` to sender, inside the same DB transaction's success callback (publish after commit, not inside).

### Service skeleton

```ts
// src/bot/bot-push.service.ts
@Injectable()
export class BotPushService {
  constructor(@Inject('REDIS') private redis: Redis) {}
  publish(payload: NotificationPayload) {
    return this.redis.publish('swifthum.notifications', JSON.stringify(payload));
  }
}
```

The bot dev consumes from this channel and uses aiogram to DM. Coordinate on the payload shape — don't drift.

---

## 14. Day-1 gates (do these first)

1. **Telegram `initData` HMAC + JWT round-trip** — without this, nothing else is reachable. Test by opening the Mini App from the bot and confirming `POST /auth/telegram` returns a usable token.
2. **SwiftyEx API access** — ping the hackathon organizers. Until keys arrive, run `SWIFTYEX_MODE=simulated`. Every `buy`/`sell` rule fires with `outcome: 'simulated'` — frontend handles this.
3. **Anthropic key wired** — confirm `claude-haiku-4-5-20251001` responds. If not available, fall back to a static suggestion list (the frontend doesn't care).

---

## 15. Local dev

```bash
# from repo root
corepack pnpm install

# bring up Postgres + Redis
cd infrastructure && docker compose up -d

# run migrations
cd ../apps/api
corepack pnpm prisma migrate dev

# dev server (Nest on :3000)
corepack pnpm dev

# worker — separate process
corepack pnpm worker:dev
```

Frontend wire-up (in `apps/mini-app/.env.local`):
```
VITE_USE_MOCKS=false
VITE_API_URL=http://localhost:3000
```

**Smoke test the contract**: turn off `VITE_USE_MOCKS`, open the Mini App via the bot, and walk every screen — Dashboard, Create Rule, Rule Detail, Pause/Resume, Pay, Receive. If anything 4xx/5xx, the contract drifted.

---

## 16. Testing

Minimum bar for the hackathon:

- **Unit tests** for the rule `evaluate` function — one test per operator (`lt`, `gt`, `crosses_above`, `crosses_below`), plus edge cases (exactly equal, missing previous snapshot for crosses).
- **Unit test** for `verifyInitData` — known good + 3 tampered variants.
- **Integration test** for `POST /intents` → `POST /redeem` happy path + replay (expect 409) + expiry (expect 410) + tampered token (expect 401).
- **Integration test** for wallet conservation: balance before + amount = balance after, across 100 concurrent redeems of *different* intents (catches missing locks).

Use `vitest` or `jest` — whichever Nest's default is in this repo's version.

---

## 17. Endpoint checklist

- [ ] `POST /auth/telegram`
- [ ] `GET /rules`
- [ ] `POST /rules`
- [ ] `GET /rules/:id`
- [ ] `PATCH /rules/:id`
- [ ] `DELETE /rules/:id`
- [ ] `POST /rules/:id/pause`
- [ ] `POST /rules/:id/resume`
- [ ] `GET /rules/:id/executions`
- [ ] `GET /prices/current`
- [ ] `GET /insights/suggested-rules`  ← Claude Haiku
- [ ] `GET /wallets/me`
- [ ] `POST /intents`
- [ ] `POST /redeem`
- [ ] `GET /transactions`
- [ ] Worker: rule evaluator (BullMQ, repeating)
- [ ] Worker: expired-intent refunder
- [ ] Bot push channel (Redis pub/sub `swifthum.notifications`)
- [ ] SwiftyEx client interface + simulated adapter
- [ ] Anthropic service with prompt caching + static fallback

---

## 18. Open questions for the team

1. SwiftyEx sandbox keys — ETA from hackathon organizers?
2. Does SwiftyEx have a price ticker endpoint, or do we use a public source (CoinGecko) until they give us one?
3. Telegram bot username — needed so the frontend deep-links can construct the right Mini App URL.
4. Are we OK with a 30s intent TTL, or should that be configurable per-user / per-amount?
5. Wallet seeding: ₦25,000 on signup for demo only? Or zero?
