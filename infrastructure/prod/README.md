# SwiftHum — Production Deployment

Single VPS, Docker Compose, Cloudflare in front (Flexible TLS). Everything runs on one box.

## TL;DR

```bash
ssh user@vps
git clone <repo> && cd swifthum
cp infrastructure/prod/.env.example infrastructure/prod/.env
$EDITOR infrastructure/prod/.env                       # fill DOMAIN + all secrets
docker compose -f infrastructure/docker-compose.prod.yml \
               --env-file infrastructure/prod/.env \
               up -d --build
```

DNS: two A records (`swifthum.${DOMAIN}` and `swifthum-api.${DOMAIN}`) → VPS IP, **proxied through Cloudflare** (orange cloud). Cloudflare SSL/TLS mode: **Flexible**. Lock down port 80 to Cloudflare IPs only via ufw (see below — this is **not optional**).

---

## Architecture

```
   ┌─────────────┐     HTTPS     ┌──────────┐     HTTP     ┌────────────┐
   │  end user   │──────────────▶│Cloudflare│─────────────▶│   edge     │  ── port 80, only this is published
   └─────────────┘    edge TLS   └──────────┘  CF proxy →  │  (nginx)   │
                                                           │ Host-based │
                                                           │  routing   │
                                                           └─────┬──────┘
                                                                 │ (internal net)
                                          ┌──────────────────────┼──────────────────────┐
                                          │                      │                      │
                                     ┌────▼─────┐         ┌──────▼──────┐        ┌──────▼──────┐
                                     │ miniapp  │         │     api     │        │   worker    │
                                     │ (nginx)  │         │ (NestJS)    │        │  (BullMQ)   │
                                     └──────────┘         └──┬───────┬──┘        └──┬───────┬──┘
                                                             │       │              │       │
                                                       ┌─────▼─┐  ┌──▼────┐  ┌──────▼──┐  ┌─▼────┐
                                                       │postgres│  │ redis │  │   bot   │  │ (...)│
                                                       └────────┘  └───────┘  │(aiogram)│
                                                                              └─────────┘
```

Only `edge` exposes a port (`:80`). Everything else is on the `swifthum_net` Docker network.

---

## VPS prerequisites

Tested on Ubuntu 22.04 / 24.04. Minimum spec: 2 vCPU, 4 GB RAM, 20 GB disk. Smaller works but expect slow first builds.

```bash
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out + back in for the group to take effect

# ufw (firewall)
sudo apt-get install -y ufw

# (optional, only if RAM < 4 GB) 2 GB swap so the first Node build doesn't OOM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
  && sudo mkswap /swapfile && sudo swapon /swapfile \
  && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## DNS + Cloudflare

In Cloudflare's dashboard for your zone:

1. **DNS records** — two A records, **proxy on** (orange cloud). These must match
   the edge `server_name`s in `infrastructure/nginx/templates/edge.conf.template`:
   ```
   swifthum.${DOMAIN}        A    <vps public ip>    Proxied
   swifthum-api.${DOMAIN}    A    <vps public ip>    Proxied
   ```
2. **SSL/TLS → Overview** — mode = **Flexible**.
3. **SSL/TLS → Edge Certificates** — enable **Always Use HTTPS** and **Automatic HTTPS Rewrites**.

The Cloudflare edge cert is automatic and free — Telegram's WebApp check is satisfied immediately.

---

## ufw — lock origin port 80 to Cloudflare only

**This is required.** Cloudflare Flexible terminates TLS at the edge, then talks HTTP to the origin. If the VPS IP is reachable on port 80 from anywhere, attackers bypass Cloudflare's WAF entirely. ufw fixes it:

```bash
# Allow SSH from your IP only — replace with your real address
sudo ufw allow from <YOUR_IP> to any port 22 proto tcp

# Allow HTTP only from Cloudflare's IP ranges
# Refresh annually from https://www.cloudflare.com/ips-v4
for cidr in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 \
            141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 \
            197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 \
            104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
  sudo ufw allow from $cidr to any port 80 proto tcp
done

# Deny everything else
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw --force enable
sudo ufw status numbered
```

After enabling, hitting the VPS IP directly on `:80` from your laptop should time out; the same request via Cloudflare succeeds. That asymmetry is the entire point.

---

## First deploy

```bash
ssh user@vps
git clone <repo> && cd swifthum

cp infrastructure/prod/.env.example infrastructure/prod/.env
$EDITOR infrastructure/prod/.env
```

Fill at minimum:
- `DOMAIN` — your apex domain (no `https://`, no slash)
- `POSTGRES_PASSWORD` — `openssl rand -hex 24`
- `JWT_SECRET`, `INTERNAL_API_SECRET`, `PAYMENT_TOKEN_SECRET`, `SWIFTYEX_KEY_ENC_SECRET` — each `openssl rand -hex 32`
- `TELEGRAM_BOT_TOKEN` — @swifthum_bot token from @BotFather
- `ANTHROPIC_API_KEY` — from console.anthropic.com (optional; the AI features degrade to static fallbacks without it)

Build + start:

```bash
docker compose -f infrastructure/docker-compose.prod.yml \
               --env-file infrastructure/prod/.env \
               up -d --build
```

First build takes ~3–5 minutes (Node + Python deps + Vite build). Subsequent rebuilds are fast (BuildKit caches deps).

Watch the migration run cleanly once:
```bash
docker compose -f infrastructure/docker-compose.prod.yml logs migrate
# Look for: "Your database is now in sync with your schema." then "Exited (0)"
```

---

## Smoke checks

```bash
# 1. API responding through the tunnel
curl -fsSL "https://swifthum-api.${DOMAIN}/health"
# → {"status":"ok",...}

# 2. Mini App serving
curl -fsI "https://swifthum.${DOMAIN}/" | head -1
# → HTTP/2 200

# 3. All containers healthy
docker compose -f infrastructure/docker-compose.prod.yml ps
# api/postgres/redis/miniapp should be (healthy); worker/bot/edge "Up"; migrate "Exited (0)"
```

In Telegram:
1. Open `@swifthum_bot` → tap the chat menu → "Open SwiftHum"
2. Mini App loads through `https://swifthum.${DOMAIN}` → AuthGate exchanges initData → wallet shows ₦25,000
3. `/balance` in chat → ₦25,000
4. Create a rule in the Mini App, `/rules` in chat → shows it with ⏸ Pause inline
5. `Abeg send 5k` → confirmation card → "Open & chirp" deep-links into Mini App's Send screen with ₦5,000 prefilled

---

## Updates

Code changes, including database migrations, ship via:

```bash
git pull
docker compose -f infrastructure/docker-compose.prod.yml --env-file infrastructure/prod/.env up -d --build
```

The `migrate` service runs `prisma migrate deploy` on every `up` — idempotent. `--build` only rebuilds images whose layers changed.

`.env` changes alone (e.g. rotating a secret, switching `SWIFTYEX_MODE` to `live`) don't need `--build`:
```bash
docker compose -f infrastructure/docker-compose.prod.yml --env-file infrastructure/prod/.env up -d
```

---

## Logs / troubleshooting

```bash
# Tail everything
docker compose -f infrastructure/docker-compose.prod.yml logs -f

# A single service
docker compose -f infrastructure/docker-compose.prod.yml logs -f api
docker compose -f infrastructure/docker-compose.prod.yml logs -f bot

# Exec a shell
docker compose -f infrastructure/docker-compose.prod.yml exec api sh
docker compose -f infrastructure/docker-compose.prod.yml exec postgres psql -U swifthum -d swifthum
```

Common gotchas:
- **`Can't reach database server`** after Docker Desktop suspend/resume → `docker restart swifthum-postgres-prod` rebinds the port cleanly (WSL2 port-relay race).
- **Bot says "Couldn't fetch your balance"** → API down or unreachable from the bot container. `docker compose logs api`. The bot's per-user JWT cache + retry-on-401 are forgiving; the API just needs to come back.
- **Telegram WebApp button greys out / nothing happens** → `MINIAPP_URL` in `.env` doesn't match the live URL, OR Cloudflare proxy is off (grey cloud), OR ufw is blocking Cloudflare.
- **502 from `https://swifthum-api.${DOMAIN}/health`** → check `docker compose ps`; api or postgres unhealthy. Tail their logs.

---

## Backups (post-demo)

Cron snippet for nightly Postgres dumps — run as root or a user with docker access:

```bash
# /etc/cron.d/swifthum-backup
0 3 * * * root cd /home/<user>/swifthum && docker compose -f infrastructure/docker-compose.prod.yml exec -T postgres pg_dump -U swifthum swifthum | gzip > /var/backups/swifthum-$(date +\%F).sql.gz
# Keep 14 days
5 3 * * * root find /var/backups -name 'swifthum-*.sql.gz' -mtime +14 -delete
```

Restore: `docker compose exec -T postgres psql -U swifthum swifthum < <(gunzip -c backup.sql.gz)`.

---

## Secrets hygiene

- `infrastructure/prod/.env` is gitignored (by the existing root `.env` rule). **Never commit it.**
- After the demo, rotate every secret in the file. Generated values + `TELEGRAM_BOT_TOKEN` would be compromised if the file ever leaked.
- The `.env.example` is the canonical schema; it's safe to commit.

---

## What's deliberately not here

- **CI / image registry.** You chose on-VPS builds. To switch later, add a GitHub Actions workflow that pushes to ghcr.io and change `image:` fields in `docker-compose.prod.yml` to pin tags.
- **Cloudflare Full TLS.** Would need certbot + a sidecar like `nginx-proxy-manager` or `traefik`. Flexible is fine for the demo and one ufw rule keeps it safe.
- **Horizontal scaling.** Compose handles one VPS. Beyond that, the database + Redis need to move off the box and the API/worker need a real orchestrator (k8s / ECS / fly.io). Out of scope.
