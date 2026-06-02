"""Catch-all natural-language handler — the bot's "speak naturally" surface.

Free-text messages (anything that didn't match a command) go to POST /payments/parse.
On a confident `send` parse, render a confirmation card with a deep-link button into
the Mini App's Send screen (?amount= prefilled). On a weak / null parse, reply with a
short coaching hint.

IMPORTANT: this router includes a `message()` filter with no other filters, so it will
match every text update. Register it **last** in main.py so commands and callback
handlers get a chance first.
"""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message

from ..clients.api import ApiClient
from ..config import Settings
from ..exceptions.api_errors import ApiError
from ..keyboards.builders import CB_PARSE_CANCEL, parse_confirm_kb
from ..logger import get
from ..services.formatters import format_parse_confirmation, format_parse_unsure

CONFIDENCE_THRESHOLD = 0.7

log = get(__name__)


def build_router(api: ApiClient, settings: Settings) -> Router:
    router = Router(name="parse")

    # Only act on plain text (not commands, not media). Commands are routed
    # by earlier routers — but as a belt-and-braces guard, exclude them.
    @router.message(F.text & ~F.text.startswith("/"))
    async def free_text(message: Message) -> None:
        if not message.from_user or not message.text:
            return

        try:
            result = await api.post(
                message.from_user.id,
                "/payments/parse",
                body={"text": message.text},
            )
        except ApiError as e:
            log.warning("parse api error", code=e.code, status=e.status)
            await message.answer(f"⚠️ {e.message}")
            return

        # Defensive: API always returns ParsePaymentResult, never throws into here.
        intent = (result or {}).get("intent")
        confidence = float((result or {}).get("confidence") or 0)
        amount_minor = (result or {}).get("amountMinor")

        if intent != "send" or amount_minor is None or confidence < CONFIDENCE_THRESHOLD:
            await message.answer(format_parse_unsure(result or {}))
            return

        await message.answer(
            format_parse_confirmation(result),
            reply_markup=parse_confirm_kb(settings.miniapp_url, int(amount_minor)),
        )

    @router.callback_query(F.data == CB_PARSE_CANCEL)
    async def cancel(cq: CallbackQuery) -> None:
        await cq.answer(text="Cancelled")
        if cq.message and isinstance(cq.message, Message):
            try:
                await cq.message.edit_text("Cancelled.")
            except Exception:
                pass

    # Don't shadow /start — aiogram dispatches in router order, so this should
    # never match a CommandStart, but ignore it explicitly just in case.
    @router.message(CommandStart())
    async def _ignore_start(_message: Message) -> None:
        return None

    return router
