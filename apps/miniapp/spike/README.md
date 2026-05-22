# SwiftHum — Audio Spike

The gate decision for the whole project. If two phones can't reliably exchange a
payment-token-sized payload over ultrasonic audio in real-world conditions,
the architecture pivots.

This is a throwaway POC. It will be folded into the Next.js Mini App after
the audio approach is validated.

## Run

```bash
node serve.mjs
# spike server: http://localhost:8080/
```

Mic capture needs a secure context. For phone testing, expose via Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:8080
# trycloudflare gives you a free https URL like https://random-words.trycloudflare.com
```

Open that URL on **both** phones. One taps **Start listening**, the other taps **Send once** (or **Send 10×** for reliability stats).

## What the POC does

- Loads ggwave-js from unpkg (`https://unpkg.com/ggwave/ggwave.js`)
- Encodes a payload string with selectable protocol + volume, plays via Web Audio
- Captures microphone, feeds samples to `ggwave.decode`, logs every successful decode
- Tracks decoded-count, success/min, latency-since-last-decode

No build step. No deps. Single HTML file.

## Protocols available

| Key | Display | Notes |
| --- | --- | --- |
| `ULTRASOUND_NORMAL` | `[U] Normal` | ~19kHz, slowest, most reliable — **start here** |
| `ULTRASOUND_FAST` | `[U] Fast` | |
| `ULTRASOUND_FASTEST` | `[U] Fastest` | least reliable, fastest |
| `AUDIBLE_NORMAL/FAST/FASTEST` | audible | for sanity-check; not the demo target |
| `DT_NORMAL/FAST` | `[DT]` dial tone | durable, slow — fallback if ultrasound fails on cheap phones |

ggwave docs: https://github.com/ggerganov/ggwave

## Test matrix

Run this matrix and record numbers in `results.md` (create when running).

### Variables
- **Protocol**: `[U] Normal`, `[U] Fast`, `[U] Fastest`
- **Distance**: 1ft, 3ft, 6ft
- **Volume**: broadcaster at 25%, 50%, 80% device volume
- **Payload**: 8b (short), 32b (medium), ~70b (realistic payment token), 140b (worst case)
- **Noise**: silent room, background chatter (play café-noise YouTube on laptop), market sim (chatter + music)

### Method
For each cell:
1. Set protocol + payload on broadcaster
2. Tap **Send 10×**
3. Count decodes on receiver. Target = 10/10. Acceptable = 8/10.
4. Note any garbled decodes (wrong text) — those are worse than missed decodes

## Success criteria (the gate)

To greenlight the architecture, we need:

- ✅ `[U] Normal` or `[U] Fast` hits **≥9/10 success** at 1–3ft, ~70b payload, quiet conditions
- ✅ End-to-end (tap-send → decode-event) **under 3 seconds** for the realistic payload
- ✅ Works on at least one iPhone and one Android (the actual demo phones)
- ✅ No catastrophically wrong decodes (token integrity matters more than throughput; HMAC will reject garbled tokens, but a high garble rate means a bad UX even with retries)

### Failure scenarios → fallback plan
- **Ultrasonic fails on the demo phones** → fall back to `AUDIBLE_FAST`. Pitch becomes "data-over-sound" rather than "silent payments." Less magical but still works in markets without QR codes.
- **Decode rate too low even audibly** → add app-layer retry: broadcaster auto-repeats every 1s until receiver ACKs out-of-band. (Acceptable since this is a 30-second token window.)
- **~70b payload too big** → reduce payment token to ~32b by shortening intentId. Trade: more DB lookups by short ID.

## Notes / quirks learned

(populate as you test)

- iOS Safari requires user gesture before AudioContext starts — first **Send** or **Start listening** tap satisfies this.
- ScriptProcessorNode is deprecated but works everywhere. ggwave's own example still uses it (2026-05). AudioWorklet migration deferred.
- Don't run listen + send on the **same** phone — speaker feedback into mic produces noise but also occasional self-decodes that pollute reliability stats.
- Background noise suppression / echo cancellation are disabled in `getUserMedia` constraints — those mangle ultrasonic content.

## What to bring back to the architecture meeting

1. Which protocol won the matrix
2. Realistic payload size budget (this constrains the payment-token format)
3. End-to-end latency (informs the 30-second token TTL)
4. Failure modes observed (informs retry strategy)
