# Swifthum — Telegram Bot & Mini App Setup

End-to-end guide to get the **@swifthumbot** + Mini App running on your machine, accessible inside Telegram on a real phone, with the full backend behind it. Covers BotFather, HTTPS tunneling, env wiring, and the runtime flow.

> Read time: ~10 min. Setup time: ~20 min the first time, ~2 min thereafter.

---

## What you're building

```mermaid
flowchart LR
    USER[User on Telegram Android] -->|/start| BOT[Telegram Bot<br/>@swifthumbot]
    USER -->|tap Menu Button| TG[Telegram WebView]
    TG -->|loads HTTPS URL| MA[Mini App<br/>Vite + React]
    MA -->|POST /auth/telegram + initData| API[NestJS API]
    API -->|HMAC validate| DB[(Postgres)]
    API -->|JWT session| MA
    WORKER[Worker loop<br/>every 20s] -.read rules.-> DB
    WORKER -.price feed.-> SX[SwiftyEx API]
    WORKER -->|condition met| API
    API -->|notify| BOT
    BOT -->|DM '✅ trade settled'| USER

    style USER fill:#e0e7ff,stroke:#6366f1
    style BOT fill:#fef3c7,stroke:#f59e0b
    style MA fill:#dcfce7,stroke:#10b981
    style API fill:#fce7f3,stroke:#ec4899
    style WORKER fill:#fce7f3,stroke:#ec4899
```

**Three independent processes** run together: the Mini App (frontend), the NestJS API, and the watcher Worker. The Telegram Bot itself is a fourth process if you go fully native — but in this setup the API talks to Telegram on the bot's behalf via the Bot HTTP API.

---

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Node 22+** | Mini App + API runtime | `nvm install 22` or download |
| **pnpm 9** | Workspace package manager | `corepack enable && corepack prepare pnpm@9.15.0 --activate` (or `sudo corepack enable`) |
| **Docker** | Postgres + Redis containers | [docker.com](https://docker.com) |
| **cloudflared** | Free HTTPS tunnel for Telegram | `brew install cloudflared` (Mac) or [download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) |
| **Telegram on Android** | Where you test | Play Store |
| **Telegram on desktop** | To chat with @BotFather | Telegram.org |

---

## Setup flowchart

```mermaid
sequenceDiagram
    actor You
    participant BF as @BotFather
    participant Term as Terminal
    participant CF as cloudflared
    participant Tg as Telegram Android

    You->>BF: /newbot
    BF-->>You: Bot token
    You->>Term: Paste token into apps/api/.env
    You->>Term: docker compose up + prisma deploy
    You->>Term: Start API + Worker + Mini App (3 terminals)
    You->>Term: cloudflared tunnel for Mini App
    CF-->>You: https://abc.trycloudflare.com
    You->>Term: cloudflared tunnel for API
    CF-->>You: https://def.trycloudflare.com
    You->>Term: Set VITE_API_URL = def... in .env.local
    You->>BF: /mybots → Menu Button → paste abc URL
    You->>Tg: Open your bot → tap Menu Button
    Tg-->>You: Mini App loads inside Telegram ✓
```

---

## Step 1 — Create the bot with BotFather

1. Open Telegram on **any device** and search for **`@BotFather`** (the official one has a blue check).
2. Send `/start` if you haven't before.
3. Send `/newbot`.
4. BotFather will ask for a **display name** (what users see). Pick something like:
   ```
   Swifthum
   ```
5. Then it asks for a **username** — must end in `bot` and be unique on Telegram. Try:
   ```
   swifthum_yourname_bot
   ```
   (Plain `swifthumbot` is likely taken. Add a suffix.)
6. BotFather replies with a message that includes a line like:
   ```
   Use this token to access the HTTP API:
   7888123456:AAH8tZ_REAL_BOT_TOKEN_GOES_HERE
   ```
   **Copy this token now.** This is your `TELEGRAM_BOT_TOKEN`. Don't share it — anyone with it can post as your bot.

7. (Optional polish) Set a description and avatar:
   - `/setdescription` → choose your bot → type a short description
   - `/setuserpic` → choose your bot → upload an icon

> ⚠️ If you ever leak the token, run `/revoke` in BotFather to invalidate it and get a new one.

---

## Step 2 — Wire the token into the API

Edit `apps/api/.env` (create it from `.env.example` if it doesn't exist yet):

```bash
cp apps/api/.env.example apps/api/.env
```

Then open `apps/api/.env` and set:

```
TELEGRAM_BOT_TOKEN=7888123456:AAH8tZ_REAL_BOT_TOKEN_GOES_HERE
```

Also generate real secrets for these (the example values are placeholders):

```bash
# Run this in your terminal to get three 32-byte hex strings
for i in 1 2 3; do openssl rand -hex 32; done
```

Paste them into:
```
JWT_SECRET=<first random string>
PAYMENT_TOKEN_SECRET=<second random string>
SWIFTYEX_KEY_ENC_SECRET=<third random string>
```

Confirm `DATABASE_URL` points to port **5442** (the docker-compose uses 5442, not 5432):
```
DATABASE_URL=postgres://swifthum:swifthum@localhost:5442/swifthum
```

---

## Step 3 — Start the backend stack

Open **four terminal tabs**. Run one command per tab.

### Terminal 1 — Postgres + Redis

```bash
docker compose -f infrastructure/docker-compose.yml up -d
docker compose -f infrastructure/docker-compose.yml ps      # both should show (healthy)
```

### Terminal 2 — Apply migrations (one-time per fresh DB)

```bash
corepack pnpm --filter api prisma:deploy
```

### Terminal 3 — API server

```bash
corepack pnpm --filter api start:dev
# → http://localhost:3000
```

Sanity check in a browser: `http://localhost:3000/health` should return `{"status":"ok"}` (or similar).

### Terminal 4 — Worker (rule evaluator)

```bash
corepack pnpm --filter api worker:dev
```

You should see log lines about poll ticks every 20 seconds.

---

## Step 4 — Start the Mini App

In a **fifth terminal**:

```bash
corepack pnpm --filter mini-app dev
# → http://localhost:5173
```

---

## Step 5 — Get HTTPS with cloudflared

Telegram **requires HTTPS** for Mini App URLs and for any cross-origin API calls. cloudflared gives you a free temporary `https://*.trycloudflare.com` URL pointed at your local port — no account, no config.

You need **two tunnels**: one for the Mini App, one for the API.

### Tunnel A — Mini App (port 5173)

In a **sixth terminal**:

```bash
cloudflared tunnel --url http://localhost:5173
```

After a few seconds it prints something like:

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://random-words-here.trycloudflare.com                                               |
+--------------------------------------------------------------------------------------------+
```

**Copy the URL.** This is your **MINI_APP_URL**.

### Tunnel B — API (port 3000)

In a **seventh terminal**:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy that URL too. This is your **API_URL**.

> Both tunnels stay alive as long as the terminal runs. They get a fresh URL every time you restart, so you'll re-paste into BotFather + .env.local each session. (Paid Cloudflare Tunnel + a domain gives you a stable URL, but for hackathon dev this is fine.)

---

## Step 6 — Point the Mini App at the API tunnel

Create `apps/mini-app/.env.local`:

```bash
echo "VITE_API_URL=https://YOUR-API-TUNNEL.trycloudflare.com" > apps/mini-app/.env.local
```

**Restart the Mini App dev server** (terminal 5) so Vite picks up the new env. Stop with `Ctrl+C` and run `corepack pnpm --filter mini-app dev` again.

Also update API CORS to allow the Mini App tunnel — open `apps/api/.env` and set:

```
CORS_ORIGIN=https://YOUR-MINI-APP-TUNNEL.trycloudflare.com
```

Restart the API (terminal 3).

---

## Step 7 — Register the Mini App URL with BotFather

1. Go back to **@BotFather** in Telegram.
2. Send `/mybots` → tap your bot.
3. Tap **Bot Settings** → **Menu Button** → **Edit menu button URL**.
4. BotFather asks for a URL. **Paste your MINI_APP_URL** (the cloudflared tunnel for port 5173).
5. BotFather then asks for a button text. Type something short:
   ```
   Open Swifthum
   ```
6. BotFather confirms with: `Success! The new menu button is set up.`

> If you also want to customize the description shown to first-time users, send `/setdescription` to BotFather.

---

## Step 8 — Test it inside Telegram

1. On your **Android phone**, open Telegram.
2. Search for your bot's username (the one you picked in Step 1, e.g. `@swifthum_yourname_bot`).
3. Open the chat.
4. Tap `/start` if it's your first time.
5. Tap the **Menu Button** at the bottom-left of the chat (it now reads "Open Swifthum" or whatever you set).
6. Telegram loads your Mini App inside its WebView.

You should see:
- The Swifthum splash screen briefly (AuthGate calling `/auth/telegram`)
- Then the Dashboard with empty rules (fresh DB)
- The bottom tab bar (Rules · Pay · Settings)

Now build a rule, save it, and watch the worker logs (terminal 4) start checking it every 20 seconds.

---

## Runtime flowchart

What happens when a user opens the Mini App:

```mermaid
sequenceDiagram
    actor U as User
    participant TG as Telegram WebView
    participant MA as Mini App (React)
    participant API as NestJS API
    participant DB as Postgres
    participant W as Worker
    participant SX as SwiftyEx

    U->>TG: Tap Menu Button
    TG->>MA: Load https://mini-app.trycloudflare.com
    Note over MA: AuthGate splash
    MA->>API: POST /auth/telegram { initData }
    API->>API: Verify HMAC against bot token
    API->>DB: Upsert user
    API-->>MA: { sessionToken, user }
    Note over MA: setSession() — JWT stored
    MA->>API: GET /rules (with Bearer JWT)
    API-->>MA: []
    Note over MA: Dashboard renders empty
    U->>MA: Build rule via RuleBuilder
    MA->>API: POST /rules
    API->>DB: INSERT rule
    API-->>MA: rule
    Note over MA: Toast: "Rule saved"

    loop Every 20s
        W->>DB: SELECT active rules
        W->>SX: Get prices
        SX-->>W: { USDT: 1448, ... }
        alt Condition met
            W->>SX: Execute trade
            W->>DB: UPDATE rule.state='fired', insert execution
            W->>API: Notify (bot push)
            API->>U: Telegram DM ✅
        end
    end
```

---

## Troubleshooting

### "No Telegram initData found" error screen
You opened the Mini App **outside Telegram** (in plain Chrome). That's expected — `initData` is injected only by the Telegram WebView. Open via your bot's Menu Button on a phone instead.

### Mini App in Telegram shows a blank screen / spinner forever
Likely the API call failed silently. Check:
- API tunnel URL in `apps/mini-app/.env.local` matches the **currently-running** tunnel (cloudflared changes the URL on restart).
- API is actually running (`curl https://YOUR-API-TUNNEL.trycloudflare.com/health`).
- CORS is set to your Mini App tunnel URL in `apps/api/.env` and API was restarted after the change.

### "Couldn't sign in" with a 401
`TELEGRAM_BOT_TOKEN` in `apps/api/.env` doesn't match the bot you registered. Tokens are case-sensitive and include a colon. Double-check by sending `/mybots → your bot → API Token` in BotFather.

### Worker logs say "swiftyex unreachable"
The `SWIFTYEX_MODE` in `apps/api/.env` is set to `live` but `SWIFTYEX_BASE_URL` is empty. For dev, set:
```
SWIFTYEX_MODE=sandbox
```
The sandbox client uses mock prices.

### Mini App loads but no rules show / can't save
JWT isn't being sent. Browser DevTools (open the Telegram WebView via `chrome://inspect` from desktop Chrome with USB debugging) — check that `/rules` requests include `Authorization: Bearer ...`. If not, AuthGate didn't complete — see "blank screen" above.

### Port conflicts (`address already in use`)
Something else is on port 5173, 3000, 5442, or 6379. Kill it with `lsof -i :PORT` + `kill PID`, or change the port in env / docker-compose.

### `pnpm: command not found`
Use `corepack pnpm <command>` instead, or run `sudo corepack enable` once to put pnpm on your PATH permanently.

### cloudflared tunnel disconnects
Free quick tunnels can die after long idle periods or hit rate limits. Just rerun `cloudflared tunnel --url ...` — you'll get a new URL, re-paste into BotFather and .env.local.

---

## Production / persistent setup (optional)

For something more permanent than dev tunnels:

1. **Get a domain** (e.g. `swifthum.app`) and point a subdomain (e.g. `mini.swifthum.app`) at your server via Cloudflare DNS.
2. Run the Mini App + API behind **Nginx + Let's Encrypt** on an EC2 instance.
3. Use **Cloudflare Tunnel** (the paid version with a real account) for stable URLs without exposing your server's IP.
4. Set bot webhook for production:
   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://api.swifthum.app/bot/webhook"
   ```
5. Pin the menu button URL to your production Mini App URL in BotFather.

---

## Daily restart cheat sheet

After the first-time setup, your daily startup is:

```bash
# Terminal 1: infra
docker compose -f infrastructure/docker-compose.yml up -d

# Terminal 2: API
corepack pnpm --filter api start:dev

# Terminal 3: Worker
corepack pnpm --filter api worker:dev

# Terminal 4: Mini App
corepack pnpm --filter mini-app dev

# Terminal 5: Mini App tunnel
cloudflared tunnel --url http://localhost:5173

# Terminal 6: API tunnel
cloudflared tunnel --url http://localhost:3000
```

Then **update `VITE_API_URL` in `apps/mini-app/.env.local`** and the **BotFather Menu Button URL** to match the new tunnel URLs, and restart the Mini App dev server.

> Want to skip the daily tunnel-shuffle? Buy a $1 domain, set up Cloudflare Tunnel with auth, and the URL stays stable forever.

---

## Quick reference — files you touch

| File | Purpose |
|---|---|
| `apps/api/.env` | Bot token, DB URL, secrets, CORS origin |
| `apps/mini-app/.env.local` | `VITE_API_URL` pointing at API tunnel |
| BotFather → Menu Button | Your Mini App tunnel URL |
| `infrastructure/docker-compose.yml` | Postgres + Redis (don't usually edit) |

---

## When something works that didn't before

Save the commit, push it, and write a short message like `wire bot end-to-end` so future-you knows where the working baseline is.
