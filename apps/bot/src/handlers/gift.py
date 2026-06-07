"""/gift — point the sender at the Mini App's gift-create screen.

Creating a gift (amount + message → shareable claim link) happens in the Mini
App, reusing the Send UI. Claiming a gift is handled by the deep-link route in
start.py (`gift_<code>` → POST /gifts/claim).
"""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from ..clients.api import ApiClient
from ..config import Settings
from ..keyboards.builders import gift_create_kb


def build_router(api: ApiClient, settings: Settings) -> Router:
    router = Router(name="gift")
    # `api` is unused for now (creation is in the Mini App) but kept in the
    # signature for parity with the other handlers and future in-chat flows.
    _ = api

    @router.message(Command("gift"))
    async def gift(message: Message) -> None:
        await message.answer(
            "🎁 <b>Send an NGN gift</b>\n\n"
            "Lock some naira into a link and share it with anyone on Telegram — "
            "when they open it, a SwiftHum wallet is created for them and the gift "
            "lands instantly.\n\n"
            "Tap below to choose an amount.",
            reply_markup=gift_create_kb(settings.miniapp_url),
        )

    return router
