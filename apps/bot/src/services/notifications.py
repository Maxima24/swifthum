"""Subscribe to the API's Redis pub/sub channel and DM users.

The backend publishes a small JSON envelope on `swifthum.notifications` after
each rule fire / payment settle. The bot decodes, formats via the pure helpers,
and sends. One bad message must not kill the loop — every iteration is wrapped.
"""
from __future__ import annotations

import asyncio
import json

from aiogram import Bot
from aiogram.enums import ParseMode
from redis.asyncio import Redis

from ..logger import get
from .formatters import format_notification

log = get(__name__)

CHANNEL = "swifthum.notifications"  # mirrors NOTIFICATIONS_CHANNEL in apps/api/src/bot/bot-push.service.ts


async def run(bot: Bot, redis: Redis) -> None:
    """Long-running coroutine. Cancel from the caller on shutdown."""
    pubsub = redis.pubsub()
    await pubsub.subscribe(CHANNEL)
    log.info("notification listener subscribed", channel=CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            await _dispatch(bot, message.get("data"))
    except asyncio.CancelledError:
        log.info("notification listener stopping")
        raise
    finally:
        try:
            await pubsub.unsubscribe(CHANNEL)
            await pubsub.aclose()
        except Exception:  # pragma: no cover — best-effort cleanup
            pass


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

    text = format_notification(payload)
    if not text:
        log.info("notification type not recognized", type=payload.get("type"))
        return

    try:
        await bot.send_message(chat_id=telegram_id, text=text, parse_mode=ParseMode.HTML)
    except Exception as e:
        # Most common: 403 (user blocked the bot) — log and move on.
        log.warning("send_message failed", telegram_id=telegram_id, error=str(e))
