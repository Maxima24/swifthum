"""Subscribe to the API's Redis pub/sub channel and DM users.

The backend publishes a small JSON envelope on `swifthum.notifications` after
each rule fire / payment settle. The bot decodes, formats via the pure helpers,
and sends. One bad message must not kill the loop — every iteration is wrapped.
"""
from __future__ import annotations

import asyncio
import json
from contextlib import suppress

from aiogram import Bot
from aiogram.enums import ParseMode
from redis.asyncio import Redis

from ..logger import get
from .formatters import format_notification

log = get(__name__)

CHANNEL = "swifthum.notifications"  # mirrors NOTIFICATIONS_CHANNEL in apps/api/src/bot/bot-push.service.ts


def _as_str(value: bytes | str | None) -> str | None:
    """Normalize a redis pubsub field to str — robust whether the client was
    created with decode_responses=True (str) or not (bytes)."""
    if value is None:
        return None
    return value.decode("utf-8") if isinstance(value, bytes) else str(value)


def is_real_message(message: dict) -> bool:
    """A pubsub envelope is an actual published message (not a subscribe ack)."""
    return _as_str(message.get("type")) == "message"


async def run(bot: Bot, redis: Redis) -> None:
    """Long-running coroutine. Cancel from the caller on shutdown.

    Supervised: a failed subscribe or a dropped Redis connection must NOT leave
    the listener silently dead (which drops every notification while the bot
    otherwise keeps working). On any non-cancellation error we log loudly and
    reconnect, so the subscription self-heals.
    """
    while True:
        pubsub = redis.pubsub()
        try:
            await pubsub.subscribe(CHANNEL)
            log.info("notification listener subscribed", channel=CHANNEL)
            # Poll with a short per-call timeout instead of the blocking
            # `listen()`: an idle subscription with a socket read-timeout makes
            # `listen()` RAISE on every quiet window (we saw a 5s "Timeout reading
            # from redis" storm). `get_message(timeout=…)` returns None on an idle
            # tick — no error, no reconnect — and a real message otherwise.
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    continue
                await _dispatch(bot, message.get("data"))
        except asyncio.CancelledError:
            log.info("notification listener stopping")
            with suppress(Exception):  # best-effort cleanup
                await pubsub.unsubscribe(CHANNEL)
                await pubsub.aclose()
            raise
        except Exception as e:  # noqa: BLE001 — subscribe failure / dropped conn
            log.warning("notification listener error; reconnecting in 3s", error=str(e))
            with suppress(Exception):
                await pubsub.aclose()
            await asyncio.sleep(3)


async def _dispatch(bot: Bot, raw: bytes | str | None) -> None:
    if raw is None:
        return
    try:
        payload = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as e:
        log.warning("notification not valid json", error=str(e), raw=str(raw)[:120])
        return

    telegram_id = payload.get("telegramId")
    if not isinstance(telegram_id, int):
        log.warning("notification missing telegramId", payload=payload)
        return

    ntype = payload.get("type")
    # A formatter must never kill the listener: an unhandled raise here would
    # propagate out of `pubsub.listen()` in run() and stop ALL future DMs
    # (including payments) until the bot restarts.
    try:
        text = format_notification(payload)
    except Exception as e:  # noqa: BLE001 — defensive: keep the loop alive
        log.warning("format_notification raised", type=ntype, error=str(e))
        return
    if not text:
        log.info("notification type not recognized", type=ntype)
        return

    log.info("dispatching notification", type=ntype, telegram_id=telegram_id)
    try:
        await bot.send_message(chat_id=telegram_id, text=text, parse_mode=ParseMode.HTML)
        log.info("notification sent", type=ntype, telegram_id=telegram_id)
    except Exception as e:
        # Most common: 403 — the user hasn't started the bot or blocked it.
        log.warning("send_message failed", type=ntype, telegram_id=telegram_id, error=str(e))
