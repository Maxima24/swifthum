# SwiftyEx Hackfest — Escrow + Receipts + Gift Links on a double-entry ledger

> Detailed blueprint for the three Builders-Track features + shared foundations, adapted to the **existing SwiftHum stack**. Build in phases (order in §5). Decisions locked: **full double-entry ledger migration** (existing wallet + payments move onto the ledger too) and **all three features** planned up front. Pairs with [HANDOFF.md](../HANDOFF.md).

## Context — reuse, don't rebuild

Several foundations already exist in the stack:

- **HMAC core** — `apps/api/src/payments/payment-token.ts` (`signToken`/`verifyToken`/`hashToken`, HMAC-SHA256 + base64url). Tuned for the ggwave ~140-byte budget; the crypto core generalizes.
- **Money movement** — all wallet mutations are in `apps/api/src/payments/payments.service.ts` (createIntent debit, redeem credit, cancel refund, expiry sweep) + the wallet **seed** in `apps/api/src/users/users.service.ts`. No ledger yet — just `Wallet.balanceMinor` + `Transaction` (sent/received) + `PaymentIntent` (reserve/refund) + `UsedNonce` (replay).
- **Auto-provisioning** — `usersService.ensureByTelegramId(telegramId, seed)` (find-or-create user+wallet) → reuse for gift claim.
- **Identity** — `verifyInitData` (`apps/api/src/auth/init-data.ts`); JWT guard is global.
- **Expiry sweeps** — `refundExpiredIntents` piggybacks the watcher tick (`apps/api/src/worker/watcher.processor.ts`); reuse the pattern for gift/escrow TTL refunds.
- **Notifications** — `BotPushService.publish` → Redis `swifthum.notifications` → bot `notifications.py`. Add new event types for gift/escrow/receipt DMs.

**Hard constraint the source game-plan missed:** Telegram `?start=` payload is capped at **64 url-safe chars** — a full HMAC token won't fit. Gift deep-links carry a short high-entropy **claim code** (server-authoritative single-use capability); HMAC signing is for **receipts** (shared as URLs, unlimited length) and the existing ggwave token.

---

## §0 Foundations

### 0.1 Double-entry ledger (migrate existing money flows)
New Prisma models (one migration under `apps/api/prisma/migrations/`):
- `LedgerAccount(id, kind, ownerUserId?, currency, balanceMinor, createdAt)` — `kind ∈ {wallet, treasury, payment_hold, escrow_hold, gift_unclaimed}`. User wallets are `kind=wallet, ownerUserId=…`; system accounts are singletons by kind. `balanceMinor` is a **cached** balance kept in lockstep with entries.
- `LedgerTransaction(id, kind, idempotencyKey? @unique, metadata Json, createdAt)` — groups a balanced set of entries.
- `LedgerEntry(id, txId, accountId, direction, amountMinor, createdAt)` — append-only; **invariant: per `txId`, Σ debits == Σ credits**.

`LedgerService` (new `apps/api/src/ledger/`):
- `transfer({ from, to, amountMinor, kind, idempotencyKey, metadata })` — single serializable tx: lock both accounts (`SELECT … FOR UPDATE`), assert `from.balance >= amount` (unless `from` is `treasury`), write the `LedgerTransaction` + two `LedgerEntry` rows, update both cached balances. Idempotent via the unique `idempotencyKey` (return the existing tx on conflict).
- `balanceOf(accountId)` / `ensureWalletAccount(userId)` / `systemAccount(kind)`.

**Migration of existing flows** (keep `Wallet` as the user's balance source-of-truth, mirror it as a `wallet` LedgerAccount; every existing mutation becomes a `transfer`):
- Wallet **seed** (users.service) → `treasury → wallet`.
- Intent **reserve** (createIntent) → `wallet → payment_hold`.
- **Redeem** → `payment_hold → receiver wallet`.
- **Cancel / expiry refund** → `payment_hold → sender wallet`.
- Keep writing the existing `Transaction` rows (sent/received) as the **user-facing history projection** so `/transactions` + bot `/history` keep working unchanged; the ledger is the accounting system-of-record beneath them.
- Backfill: a one-off script seeds a `wallet` LedgerAccount per existing user mirroring current `Wallet.balanceMinor`, balanced against `treasury`. (Demo DB is small.)

### 0.2 Generalized signer (don't fork three times)
- Extract the HMAC base64url helpers from `payment-token.ts` into `apps/api/src/common/hmac.ts` (`hmacSign`/`hmacVerify`); payment-token.ts re-uses them (no behaviour change, stays byte-lean).
- New `apps/api/src/common/signed-token.ts`: `sign(payload)` / `verify(token)` for **URL tokens** — compact JSON with `purpose ∈ {receipt}`, `iat`, `exp`, `nonce`, secret from `SIGNED_TOKEN_SECRET`. Used by receipts (URLs have no length limit). Gifts use claim codes (0.3), not this.

### 0.3 Idempotency
- Every state-changing endpoint accepts a client `Idempotency-Key` header (or body field). `IdempotencyService`: check Redis (`idem:<key>`, TTL 24h) → if present return cached result; else proceed and cache. The DB-level guarantee is the **unique `LedgerTransaction.idempotencyKey`** (the money move can't double-apply even if Redis is cold). Reuse the existing `UsedNonce` pattern for token replay.
- **Claim codes / gift / escrow ids**: high-entropy via `prefixedId` (`apps/api/src/common/ids.ts`) — add `g_` (gift), `esc_` prefixes; claim code = a separate 22-char url-safe random (≈132 bits) unique-indexed on `Gift`.

### 0.4 State-machine helper
- `apps/api/src/common/fsm.ts`: `assertTransition(current, next, allowedMap)` throwing `Errors.validation` on illegal moves. Each feature persists `state` + `stateUpdatedAt` and appends a domain event row (EscrowEvent / a generic audit). Transitions enforced in the **service layer**, never trusted from the client.

### 0.5 Telegram surfaces
- **Deep-links**: extend `apps/bot/src/handlers/start.py` to `CommandStart(deep_link=True)` reading `command.args`; route `gift_<code>` → POST `/gifts/claim`. Keep the plain welcome when no payload.
- **initData**: bot calls go through the existing JWT exchange; the Mini App already validates initData server-side. Never trust identity before that.

---

## §1 Gift Links — *acquisition* (build first)
- **Model** `Gift(id, senderId, asset, amountMinor, message?, claimCode @unique, state, claimedByUserId?, ttlExpiresAt, createdAt, claimedAt?)`. FSM: `UNCLAIMED → CLAIMED | EXPIRED | RECLAIMED`.
- **Create** (`POST /gifts`, idempotent): `LedgerService.transfer(wallet → gift_unclaimed)`; generate `claimCode`; return deep-link `https://t.me/<bot>?start=gift_<claimCode>`. Mini-App create screen (amount + message) reusing the Send UI patterns + `formatNgn`.
- **Claim** (`POST /gifts/claim {claimCode}` from bot): verify state `UNCLAIMED` + not expired; `ensureByTelegramId` (auto-provision recipient wallet, **no seed** — they get the gift); `transfer(gift_unclaimed → recipient wallet)`; set `CLAIMED` + `claimedByUserId`; tag `acquiredVia='gift'` on new users (add column) for the funnel story; emit receipt (§2) + DM both.
- **Single-use** = the FSM check **plus** a conditional update (`UPDATE … WHERE state='UNCLAIMED'` / unique claim) so two simultaneous opens can't double-claim.
- **Expiry auto-refund**: worker sweep (mirror `refundExpiredIntents`) → `transfer(gift_unclaimed → sender)`, state `EXPIRED`. **Reclaim** = sender cancels pre-claim (same refund).
- **Bot**: deep-link handler (0.5) + `/gift` quick command; Mini-App: gift create + "my gifts" list.

## §2 Verifiable Receipts — *trust + virality*
- **Model** `Receipt(id, sourceType[payment|escrow|gift], sourceId, fromUserId, toUserId, asset, amountMinor, nonce, createdAt)`. Generated on every **completed** movement: redeem, gift claim, escrow release.
- **Sign** a compact payload `{ receiptId, from(masked), to(masked), amountMinor, asset, ts, purpose:'receipt', iat, exp, nonce }` with §0.2 `sign()`.
- **Shareable artifact**: Mini-App route `/r/:receiptId` rendering the receipt + a ✅ "Verified by SwiftyEx" badge; verification re-runs `verify()` **server-side** (`GET /receipts/:id/verify?token=…`) and shows valid/invalid. Bot `/verify <token>` does the same. **Tamper demo**: edit the amount in the URL → signature fails. (Optional: server-rendered PNG for clean Telegram sharing — stretch.)
- **Privacy**: mask counterparties (display name / partial handle, never internal ids).

## §3 P2P Escrow — *trust / brand credibility*
- **Models** `Escrow(id, creatorId, counterpartyId, fundingPartyId, receivingPartyId, asset, amountMinor, terms, state, ttlExpiresAt, createdAt, stateUpdatedAt)` + append-only `EscrowEvent(id, escrowId, type, actorId, metadata, createdAt)`.
- **FSM** (service-enforced via 0.4): `CREATED → FUNDED → PAID_MARKED → RELEASED/COMPLETED`; branches `DECLINED`, `CANCELLED` (pre-FUNDED/mutual), `DISPUTED → RESOLVED_RELEASE | RESOLVED_REFUND`. Money sits in `escrow_hold` until resolution — *safe by construction*.
- **Flow**: create + fund (`transfer(funder wallet → escrow_hold)`, reject self-deal & insufficient funds before any state change) → counterparty Accept/Decline (bot inline buttons) → buyer "I have paid" (`PAID_MARKED`) → seller release (`transfer(escrow_hold → receiver)`, `COMPLETED`, emit receipt). All transitions idempotent (idempotencyKey on release prevents double-release).
- **Dispute** (demo highlight): either party → `DISPUTED`; resolver (admin endpoint, or rule/AI-assisted via existing `AnthropicService`) → `RESOLVED_RELEASE`/`RESOLVED_REFUND` moving funds out of `escrow_hold`.
- **TTL from server** (prior SwiftHum bug): the Mini-App countdown reads `ttlExpiresAt` from the API — never hardcoded. Stalled `FUNDED` past TTL → auto-flag/auto-refund (configurable) via the worker sweep.
- **Surfaces**: bot create + Accept/Decline/Release inline buttons + DMs; Mini-App escrow dashboard (list + detail + actions).

---

## §4 Non-negotiable rules (enforced in code)
All money via `LedgerService` (no ad-hoc `wallet.update`); every state-changing endpoint idempotent; never trust token contents before HMAC verify or identity before initData; **all TTLs server-owned**; illegal FSM transitions rejected at the service layer; every completed money movement emits an audit event + a receipt.

## §5 Build order
1. **Foundations** (§0): ledger + migration of existing payments, signer extraction, idempotency, FSM helper, bot deep-link. *Everything depends on this; land it behind tests first.*
2. **Gift Links** (§1) — self-contained acquisition story, end-to-end.
3. **Receipts** (§2) — small, reuses signer; bolt onto gift claim first, then everywhere.
4. **Escrow** (§3) — largest; happy path, then dispute path; receipts on release.
5. **Polish + demo** — server-driven countdowns, error states, 3-min script (lead with gift → receipt tamper-fail → escrow dispute).

## §6 Verification
- **Unit:** ledger invariants (Σdebits==Σcredits per tx; balance == Σ entries; insufficient-funds reject; idempotent replay returns original, never double-moves); signer (verify ok / tamper fails / expired); FSM illegal-transition rejection; gift single-use race (two concurrent claims → one wins). Extend the existing Jest suite.
- **Migration check:** post-backfill, every user's `Wallet.balanceMinor` == their `wallet` LedgerAccount balance; existing payment/redeem/cancel tests still green.
- **Integration / manual (per feature, on deploy):** gift create→share→claim on a fresh account (wallet auto-provisioned + funded); receipt share + live URL-tamper fail; escrow two-party fund→pay→release and a dispute→resolve, money never leaving `escrow_hold` until resolution.
- **Frontend contract:** `/transactions` + bot `/history` unchanged after the ledger migration (Transaction projection preserved).

## §7 Demo script (what judges see)
1. **Gift link** — send a gift, open it on a fresh account, wallet auto-created + funded. *"Every link onboards a user."* (acquisition)
2. **Receipt** — share it, tamper the URL live, verification fails. Trust made visible. (trust + virality)
3. **Escrow + dispute** — two parties, money locked in `escrow_hold`, a dispute, admin resolution. Money never at risk. (trust/retention)
