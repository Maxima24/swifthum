"""SwiftHum bot entry point.

Wires up:
  - aiogram Dispatcher with command + callback handlers
  - the chat-wide WebApp menu button (so every user sees "Open SwiftHum" in
    Telegram's bot menu, no /start required)
  - the Redis notification loop as a background asyncio task
  - graceful shutdown of all three on SIGINT / SIGTERM
"""
from __future__ import annotations

import asyncio
import sys
from contextlib import suppress

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo
from redis.asyncio import Redis

from src import logger
from src.clients.api import ApiClient
from src.config import load
from src.handlers import help as help_handler
from src.handlers import menu as menu_handler
from src.handlers import parse as parse_handler
from src.handlers import rules as rules_handler
from src.handlers import start as start_handler
from src.handlers import voice as voice_handler
from src.handlers import wallet as wallet_handler
from src.services import notifications

# Shown in Telegram's "/" command menu (set_my_commands).
BOT_COMMANDS = [
    BotCommand(command="menu", description="Open the action menu"),
    BotCommand(command="balance", description="Your NGN wallet balance"),
    BotCommand(command="rules", description="Your auto-trading rules"),
    BotCommand(command="portfolio", description="Your SwiftyEx holdings"),
    BotCommand(command="prices", description="Live USDT/BTC/ETH prices"),
    BotCommand(command="history", description="Recent payments"),
    BotCommand(command="help", description="Help & commands"),
]


async def amain() -> None:
    settings = load()
    logger.configure(settings.log_level)
    log = logger.get("main")

    bot = Bot(
        token=settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()
    # decode_responses=True so pubsub yields str (not bytes) — otherwise the
    # notifications loop's `type == "message"` check never matches and every
    # message is silently dropped. This client is used only for the pubsub.
    redis = Redis.from_url(settings.redis_url, decode_responses=True)

    async with ApiClient(settings.api_base_url, settings.internal_api_secret) as api:
        dp.include_router(start_handler.build_router(api, settings))
        dp.include_router(help_handler.build_router(settings))
        dp.include_router(menu_handler.build_router(api, settings))
        dp.include_router(wallet_handler.build_router(api))
        dp.include_router(rules_handler.build_router(api))
        # Voice notes (F.voice) → transcribe → same parse/confirm flow as text.
        # Registered before the catch-all text parser.
        dp.include_router(voice_handler.build_router(api, settings))
        # The free-text parser must register LAST — it has a catch-all message filter
        # and would otherwise shadow /start, /help, etc.
        dp.include_router(parse_handler.build_router(api, settings))

        # Idempotent: every user sees an "Open SwiftHum" button in the bot's
        # main menu, without needing to /start first.
        try:
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text="Open SwiftHum",
                    web_app=WebAppInfo(url=settings.miniapp_url),
                ),
            )
            log.info("chat menu button set", url=settings.miniapp_url)
        except Exception as e:
            # Don't crash on a 403/etc. — the bot is still useful without the menu button.
            log.warning("set_chat_menu_button failed", error=str(e))

        # Populate the Telegram "/" command menu so commands are discoverable.
        try:
            await bot.set_my_commands(BOT_COMMANDS)
            log.info("bot commands set", count=len(BOT_COMMANDS))
        except Exception as e:
            log.warning("set_my_commands failed", error=str(e))

        notif_task = asyncio.create_task(notifications.run(bot, redis), name="notifications")
        log.info("bot starting polling")

        try:
            await dp.start_polling(bot)
        finally:
            notif_task.cancel()
            with suppress(asyncio.CancelledError):
                await notif_task
            await redis.aclose()
            await bot.session.close()


def main() -> None:
    try:
        asyncio.run(amain())
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
