"""/verify <token> — verify a SwiftHum receipt by its signed token.

Calls the public GET /receipts/verify endpoint and reports valid/invalid. Accepts
either the raw token or a full receipt link (we extract the `token=` param).
"""
from urllib.parse import quote

from aiogram import Router
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from ..clients.api import ApiClient
from ..exceptions.api_errors import ApiError
from ..services.formatters import format_receipt_verification


def _extract_token(raw: str) -> str:
    raw = raw.strip()
    if "token=" in raw:
        raw = raw.split("token=", 1)[1].split("&")[0]
    return raw.strip()


def build_router(api: ApiClient) -> Router:
    router = Router(name="verify")

    @router.message(Command("verify"))
    async def verify(message: Message, command: CommandObject) -> None:
        if not message.from_user:
            return
        token = _extract_token(command.args or "")
        if not token:
            await message.answer(
                "Usage: <code>/verify &lt;token&gt;</code>\n"
                "Paste the token (or the whole link) from a SwiftHum receipt.",
            )
            return
        try:
            result = await api.get(
                message.from_user.id, f"/receipts/verify?token={quote(token, safe='')}"
            )
        except ApiError as e:
            await message.answer(f"⚠️ Couldn't verify that receipt: {e.message}")
            return
        await message.answer(format_receipt_verification(result))

    return router
