"""/escrow — list the caller's active escrows with role/state-aware action
buttons, and handle the Accept/Decline/Cancel/Mark-paid/Release/Dispute taps.

Creating an escrow happens in the Mini App (/pay/escrow/new). The counterparty
is bound via the `escrow_<code>` deep-link (see start.py), which renders the same
card + Accept/Decline buttons handled here.
"""
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from ..clients.api import ApiClient
from ..config import Settings
from ..exceptions.api_errors import ApiError
from ..keyboards.builders import (
    CB_ESCROW_ACCEPT,
    CB_ESCROW_CANCEL,
    CB_ESCROW_DECLINE,
    CB_ESCROW_DISPUTE,
    CB_ESCROW_MARKPAID,
    CB_ESCROW_RELEASE,
    escrow_actions_kb,
    escrow_create_kb,
)
from ..services.formatters import format_escrow_card

_TERMINAL = {"COMPLETED", "DECLINED", "CANCELLED", "EXPIRED", "RESOLVED_RELEASED", "RESOLVED_REFUNDED"}

# callback prefix → (API path suffix, toast text)
_ACTIONS = {
    CB_ESCROW_ACCEPT: ("accept", "Accepted"),
    CB_ESCROW_DECLINE: ("decline", "Declined"),
    CB_ESCROW_CANCEL: ("cancel", "Cancelled"),
    CB_ESCROW_MARKPAID: ("mark-paid", "Marked paid"),
    CB_ESCROW_RELEASE: ("release", "Released"),
    CB_ESCROW_DISPUTE: ("dispute", "Dispute opened"),
}


def build_router(api: ApiClient, settings: Settings) -> Router:
    router = Router(name="escrow")

    @router.message(Command("escrow"))
    async def escrow_cmd(message: Message) -> None:
        if not message.from_user:
            return
        try:
            res = await api.get(message.from_user.id, "/escrows")
        except ApiError as e:
            await message.answer(f"⚠️ Couldn't load your escrows: {e.message}")
            return
        items = res.get("items", []) if isinstance(res, dict) else []
        active = [e for e in items if e.get("state") not in _TERMINAL]
        if not active:
            await message.answer(
                "🛡 You have no active escrows.\n\nEscrow locks NGN safely until both sides "
                "are happy. Create one in the Mini App.",
                reply_markup=escrow_create_kb(settings.miniapp_url),
            )
            return
        for e in active[:10]:
            await message.answer(format_escrow_card(e), reply_markup=escrow_actions_kb(e))

    async def _act(cq: CallbackQuery, suffix: str, toast: str) -> None:
        if not cq.from_user or not cq.data:
            return
        escrow_id = cq.data.split(":")[-1]
        try:
            updated = await api.post(cq.from_user.id, f"/escrows/{escrow_id}/{suffix}", {})
        except ApiError as e:
            await cq.answer(text=f"⚠️ {e.message}", show_alert=True)
            return
        await cq.answer(text=toast)
        if cq.message and isinstance(cq.message, Message):
            try:
                await cq.message.edit_text(
                    format_escrow_card(updated), reply_markup=escrow_actions_kb(updated)
                )
            except Exception:
                pass

    for prefix, (suffix, toast) in _ACTIONS.items():
        @router.callback_query(F.data.startswith(prefix))
        async def cb(cq: CallbackQuery, _s: str = suffix, _t: str = toast) -> None:
            await _act(cq, _s, _t)

    return router
