"""/balance — read GET /wallets/me."""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from ..clients.api import ApiClient
from ..exceptions.api_errors import ApiError
from ..services.formatters import format_balance


def build_router(api: ApiClient) -> Router:
    router = Router(name="wallet")

    @router.message(Command("balance"))
    async def balance(message: Message) -> None:
        if not message.from_user:
            return
        try:
            wallet = await api.get(message.from_user.id, "/wallets/me")
        except ApiError as e:
            await message.answer(f"⚠️ Couldn't fetch your balance: {e.message}")
            return
        await message.answer(format_balance(wallet))

    return router
