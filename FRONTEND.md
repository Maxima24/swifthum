# Swifthum Mini App — Frontend Guide

> Your handbook as the **frontend dev** building **The Watcher** — a Telegram Mini App that lets users build visual "WHEN/THEN" rules for auto-trading naira/USDT on SwiftyEx. Tagline: *"Cron jobs for your money, designed for humans not engineers."* Vite + React, Android-only for the hackathon.

> **Pivoted from ultrasonic payments on 2026-05-22.** Ultrasonic stack is parked, not deleted.

---

## 1. What you're building

A **Telegram Mini App** that launches inside the Telegram Android WebView when a user taps **Open App** in the @swifthumbot chat. It lets them:

1. See their **dashboard** of active rules as cards (each with a state: sleeping / watching / fired / paused)
2. **Build a new rule** visually — WHEN (asset + operator + threshold) → THEN (action + amount)
3. **Open a rule** to see fire history, edit, pause, or delete it
4. See current SwiftyEx prices for assets they trade
5. Get bot DMs when a rule fires ("✅ Bought ₦50,000 USDT @ ₦1,448")
6. **(Stretch)** See AI-suggested rules based on past price action

**The user never writes code.** They build cron jobs for their money by tapping dropdowns.

---

## 2. Current state of the world

| Thing | Status | Where |
|---|---|---|
| `apps/mini-app` | **Scaffolded, builds clean** — Vite + React 18 + TS + Tailwind v4 + @telegram-apps/sdk-react 3.3.9 | [apps/mini-app/](apps/mini-app/) |
| `apps/api` | NestJS skeleton, `GET /` returns "Hello World" only — backend dev will build out | [apps/api/src/](apps/api/src/) |
| `apps/bot` | Python aiogram skeleton folders, no handlers yet | [apps/bot/](apps/bot/) |
| API endpoints | **Backend dev owns** — you build against mocks | — |
| SwiftyEx API | Backend dev's problem — you only consume our internal API | — |

**Implication:** You can build the entire frontend against **mock data** without waiting on anyone. Swap mocks for real API calls when the backend dev lands them.

---

## 3. Stack

```
Vite + React 18 + TypeScript        already installed
TailwindCSS v4                      already installed (Telegram theme vars wired)
Framer Motion                       already installed
@telegram-apps/sdk-react@3.3.9      already installed
@tanstack/react-query@5             already installed
zustand@5                           already installed
react-router-dom@6                  already installed
zod@3                               already installed
```

No new dependencies needed for The Watcher.

---

## 4. Folder structure (current + planned)

```
apps/mini-app/
├── public/icons/                  PWA icons (later)
├── src/
│   ├── main.tsx                   entry, Telegram SDK init, providers ✅
│   ├── App.tsx                    router shell ✅ (needs route update)
│   ├── types.ts                   shared Rule / Execution types (TO ADD)
│   ├── routes/
│   │   ├── Dashboard.tsx          rule list + "+" button (TO ADD — replaces Home)
│   │   ├── RuleBuilder.tsx        WHEN/THEN form (TO ADD — replaces Send)
│   │   ├── RuleDetail.tsx         fire history + edit/pause/delete (TO ADD — replaces Receive)
│   │   └── Settings.tsx           later (link SwiftyEx, notif prefs)
│   ├── components/
│   │   ├── RuleCard.tsx           card on dashboard (TO ADD)
│   │   ├── StateBadge.tsx         sleeping/watching/fired pill (TO ADD)
│   │   ├── AssetSelect.tsx        dropdown (TO ADD)
│   │   ├── OperatorSelect.tsx     dropdown (TO ADD)
│   │   ├── PriceInput.tsx         ₦ amount input (TO ADD)
│   │   └── EmptyState.tsx
│   ├── lib/
│   │   ├── tg.ts                  Telegram SDK helpers ✅
│   │   ├── api.ts                 fetch wrapper ✅
│   │   └── format.ts              money + rule summary formatters ✅ (extend)
│   ├── mocks/
│   │   └── rules.ts               seeded data for dev (TO ADD)
│   ├── stores/                    Zustand (later)
│   ├── hooks/                     useRules, useRule, useCreateRule (later)
│   └── styles/tailwind.css        Telegram theme vars ✅
├── index.html                     ✅
├── vite.config.ts                 ✅
├── tsconfig.{,app,node}.json      ✅
└── package.json                   ✅
```

---

## 5. The Rule type

This is the spine of the whole product. Everything maps to or from this:

```ts
// src/types.ts
export type Asset = 'USDT' | 'BTC' | 'ETH';
export type Operator = 'lt' | 'gt' | 'crosses_above' | 'crosses_below';
export type Action = 'buy' | 'sell' | 'alert';
export type RuleState = 'sleeping' | 'watching' | 'fired' | 'paused';

export interface Rule {
  id: string;
  name: string;
  when: {
    asset: Asset;
    op: Operator;
    priceMinor: number;        // in kobo (1450 NGN = 145000)
  };
  then: {
    action: Action;
    amountMinor?: number;      // required for buy/sell, omitted for alert
    currency?: 'NGN' | Asset;
  };
  state: RuleState;
  createdAt: string;           // ISO
  lastEvaluatedAt?: string;
  firedCount: number;
}

export interface Execution {
  id: string;
  ruleId: string;
  firedAt: string;
  priceAtFireMinor: number;
  outcome: 'success' | 'failed' | 'simulated';
  detail?: string;
}
```

### Rule states (what the user sees)

| State | Meaning | Card colour |
|---|---|---|
| `sleeping` | Active, condition is far from triggering | grey |
| `watching` | Within 1% of threshold | amber |
| `fired` | Triggered at least once | green |
| `paused` | User manually paused it | dim |

**Backend computes the state** based on current price vs. threshold. Frontend just renders.

---

## 6. API contract (mock these — backend not built yet)

Base URL: `import.meta.env.VITE_API_URL` → `http://localhost:3000` in dev.
All authed endpoints require `Authorization: Bearer <sessionToken>`.

### Auth (call once on app load)

```http
POST /auth/telegram
{ "initData": "<raw query string from Telegram.WebApp.initData>" }
→ 200 { "sessionToken": "<jwt>", "user": { "id", "telegramId", "displayName" } }
```

### Rules

```http
GET    /rules                              → Rule[]
GET    /rules/:id                          → Rule
POST   /rules                              → Rule
       body: { name, when, then }
PATCH  /rules/:id                          → Rule
       body: partial updates
DELETE /rules/:id                          → 204
POST   /rules/:id/pause                    → Rule
POST   /rules/:id/resume                   → Rule
GET    /rules/:id/executions               → Execution[]
```

### Prices

```http
GET    /prices/current                     → { USDT: 145000, BTC: ... }  // kobo
GET    /prices/:asset?range=24h            → { points: [{t, priceMinor}] }
```

### Insights (stretch)

```http
GET    /insights/suggested-rules           → Rule[]   (Claude suggestions)
GET    /insights/weekly                    → { summary: "...", topRules: [...] }
```

### WebSocket (optional, only while Mini App is open)

```ts
socket.on('rule.state-changed', ({ ruleId, state }) => {})
socket.on('rule.fired',         ({ ruleId, execution }) => {})
socket.on('price.tick',         ({ asset, priceMinor }) => {})
```

> Most "rule fired" notifications come via the **bot DM**, not the WebSocket. WS only matters if the Mini App is actively open.

---

## 7. Screens

### `/` — Dashboard
- Header: greeting + current USDT price ticker
- "+" big button (creates new rule, navigates to `/rules/new`)
- List of `RuleCard`s sorted by state (fired → watching → sleeping → paused)
- Empty state for first-time users with "Create your first rule" CTA

### `/rules/new` — RuleBuilder
- **WHEN** section: AssetSelect | OperatorSelect | PriceInput
- **THEN** section: ActionSelect | AmountInput (hidden if action = alert)
- Live preview: "WHEN USDT drops below ₦1,450 → BUY ₦50,000"
- MainButton at bottom (Telegram-native): "Save Rule"
- BackButton (Telegram-native): top-left

### `/rules/:id` — RuleDetail
- Rule summary (same as preview line)
- State badge
- Last evaluated time
- Fire history list (each Execution as a row)
- Actions: Pause/Resume, Edit, Delete (Telegram confirm dialog)

### `/settings` (stretch)
- Link SwiftyEx account
- Notification preferences

---

## 8. Telegram Mini App essentials (already wired)

The current scaffold already calls:
- [`init()`](apps/mini-app/src/lib/tg.ts) — SDK init
- `miniApp.mount()`, `themeParams.mount()`, `viewport.mount()`, `backButton.mount()`
- `miniApp.ready()` — tells Telegram the app is ready to show
- `haptic('medium')` helper for taps

You should additionally wire **MainButton** on the RuleBuilder screen:

```ts
import { mainButton } from '@telegram-apps/sdk-react';

useEffect(() => {
  mainButton.setParams({ text: 'Save Rule', isVisible: true, isEnabled: isValid });
  const off = mainButton.onClick(() => save());
  return () => { off(); mainButton.setParams({ isVisible: false }); };
}, [isValid, save]);
```

And **BackButton** wherever you navigate deeper:

```ts
import { backButton } from '@telegram-apps/sdk-react';

useEffect(() => {
  backButton.show();
  const off = backButton.onClick(() => navigate(-1));
  return () => { off(); backButton.hide(); };
}, []);
```

Theme variables flow into Tailwind automatically via [src/styles/tailwind.css](apps/mini-app/src/styles/tailwind.css) — use classes like `bg-tg-button`, `text-tg-text`, `text-tg-hint`, `bg-tg-secondary-bg`.

---

## 9. State management

- **React Query** for server state: `useRules()`, `useRule(id)`, `useCreateRule()`, `useUpdateRule()`, `useDeleteRule()`, `usePrices()`.
- **Zustand** for client-only state: session JWT, current rule-builder draft.
- **No global state for rules themselves** — React Query's cache is the store.

---

## 10. Working without a backend

Until the backend dev lands real endpoints, build against `src/mocks/rules.ts` (you'll write it in this session). Two options for wiring:

**Option A — flag in `api.ts`:**
```ts
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export async function api<T>(path: string): Promise<T> {
  if (USE_MOCKS) return mockResponse<T>(path);
  // ... real fetch
}
```

**Option B — MSW** (Mock Service Worker): proper request interception, swap on/off via env. Heavier to set up; do this when you have time.

For Day 1, go with Option A.

---

## 11. Demo mode (build on Day 2)

For the live demo, a flag that seeds a few impressive rules and forces one to fire dramatically on stage:

```ts
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
```

When on:
- Seed 3 rules including one "watching" and one that fires on a button press (`window.dispatchEvent(new Event('demo:fire'))`).
- Pre-populated execution history that looks rich.
- Plain mock prices that move predictably.

**Why:** Live SwiftyEx prices might not move during your 3-minute pitch window. Demo mode guarantees a "fire" moment for the judges.

---

## 12. Your week

### Day 1 — Frontend foundation
- Hour 0–2: Pivot acknowledged, scaffold already in place. Read this doc + the rule schema.
- Hour 2–8: Dashboard screen + RuleCard + StateBadge + mock data. Build against mocks. Land Dashboard end-to-end.
- Hour 8–16: RuleBuilder screen — WHEN/THEN form, live preview, save (against mock).
- Hour 16–24: RuleDetail — fire history, edit/pause/delete actions.

### Day 2 — Polish + real wiring
- Hour 24–32: Swap mocks for real backend endpoints as they land. Wire React Query mutations + optimistic updates.
- Hour 32–40: Animations (Framer Motion) for card state transitions, fire moment, empty state.
- Hour 40–46: AI suggested-rules carousel on Dashboard (stretch).
- Hour 46–48: End-to-end smoke test inside actual Telegram on Android.

### Day 3 — Demo polish
- Hour 48–60: Pixel polish, error states, loading skeletons, haptics on every interaction.
- Hour 60–68: Build demo mode. Rehearse the fire moment 30+ times.
- Hour 68–72: Pitch deck slide for the screens, video backup, sleep.

**Stop building features at hour 48.** Last 24 hours = polish + rehearsal.

---

## 13. Definition of done (per screen)

- [ ] Works inside Telegram Android WebView (not just Chrome)
- [ ] Loading state
- [ ] Empty state
- [ ] Error state (network failure, API error)
- [ ] BackButton wired correctly
- [ ] MainButton used where appropriate
- [ ] Haptic feedback on tap / save / fire
- [ ] Matches Telegram theme (dark + light) — verify by toggling phone theme
- [ ] Demo-mode path works
- [ ] One animation that makes it feel alive
- [ ] No `console.error` in prod build

---

## 14. Dev workflow

```bash
# install (already done)
corepack pnpm install

# start dev server
corepack pnpm --filter mini-app dev
# → http://localhost:5173

# build (already passing)
corepack pnpm --filter mini-app build

# test inside Telegram (Mini Apps need HTTPS):
cloudflared tunnel --url http://localhost:5173
# paste the https://*.trycloudflare.com URL into @BotFather → bot → Menu Button
```

---

## 15. Open questions

- [ ] Rule name — required or auto-generated from the rule body?
- [ ] One rule can have multiple THEN actions, or strictly one per rule?
- [ ] How is the user's SwiftyEx account linked? OAuth in Mini App, or magic link in bot? (Backend dev decides — you just show "Link SwiftyEx" CTA if not linked.)
- [ ] Should paused rules show on Dashboard, or hide behind a filter?
- [ ] AI-suggested rules: separate route, or carousel on Dashboard?
