"""/start — welcome + WebApp launch button."""
from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from ..config import Settings
from ..keyboards.builders import webapp_launch_kb


def build_router(settings: Settings) -> Router:
    router = Router(name="start")

    @router.message(CommandStart())
    async def start(message: Message) -> None:
        await message.answer(
            "👋 Welcome to <b>SwiftHum</b>!\n\n"
            "I monitor your auto-trading rules and notify you when they fire. "
            "Open the Mini App to manage your wallet, rules, and ultrasonic payments.\n\n"
            "Use /help to see chat commands.",
            reply_markup=webapp_launch_kb(settings.miniapp_url),
        )

    return router
