"""/pay @username <amount> — send NGN directly to another SwiftHum user.

Flow: parse the handle + amount → look the user up → show a Confirm/Cancel card →
on Confirm, POST /transfers. If the handle isn't a SwiftHum user, offer a gift
link instead (which onboards them).
"""
from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, Message

from ..clients.api import ApiClient
from ..config import Settings
from ..exceptions.api_errors import ApiError
from ..keyboards.builders import (
    CB_PAY_CANCEL,
    CB_PAY_CONFIRM,
    gift_create_kb,
    pay_confirm_kb,
)
from ..services.money import kobo_to_naira_str

_AMOUNT_CAP_NAIRA = 100_000  # mirrors the NL parser's per-payment cap


def parse_amount_to_minor(raw: str) -> int | None:
    """'5000' / '5,000' / '5k' / '₦5.5k' → amountMinor (kobo). None if invalid."""
    s = raw.strip().lower().replace(",", "").replace("₦", "")
    mult = 1
    if s.endswith("k"):
        mult, s = 1000, s[:-1]
    try:
        naira = float(s) * mult
    except ValueError:
        return None
    if naira <= 0 or naira > _AMOUNT_CAP_NAIRA:
        return None
    return round(naira * 100)


def parse_pay_args(args: str | None) -> tuple[str, int] | None:
    """'@bob 5k' → ('bob', 500000). None if the shape is wrong."""
    parts = (args or "").split()
    if len(parts) < 2:
        return None
    username = parts[0].lstrip("@").lower()
    amount_minor = parse_amount_to_minor(parts[1])
    if not username or amount_minor is None:
        return None
    return username, amount_minor


def build_router(api: ApiClient, settings: Settings) -> Router:
    router = Router(name="pay")

    @router.message(Command("pay"))
    async def pay(message: Message, command: CommandObject) -> None:
        if not message.from_user:
            return
        parsed = parse_pay_args(command.args)
        if parsed is None:
            await message.answer(
                "💸 <b>Send to a @username</b>\n\n"
                "Usage: <code>/pay @username 5000</code> (or <code>5k</code>).",
            )
            return
        username, amount_minor = parsed
        try:
            result = await api.get(message.from_user.id, f"/users/lookup?username={username}")
        except ApiError as e:
            await message.answer(f"⚠️ {e.message}")
            return
        if not (isinstance(result, dict) and result.get("found")):
            await message.answer(
                f"🤷 <b>@{username}</b> isn't on SwiftHum yet. Send them a gift link instead — "
                "opening it sets up their wallet automatically.",
                reply_markup=gift_create_kb(settings.miniapp_url),
            )
            return
        name = result.get("displayName", username)
        await message.answer(
            f"💸 Send <b>{kobo_to_naira_str(amount_minor)}</b> to <b>{name}</b> (@{username})?",
            reply_markup=pay_confirm_kb(username, amount_minor),
        )

    @router.callback_query(F.data == CB_PAY_CANCEL)
    async def cancel(cq: CallbackQuery) -> None:
        await cq.answer(text="Cancelled")
        if cq.message and isinstance(cq.message, Message):
            try:
                await cq.message.edit_text("✖ Payment cancelled.")
            except Exception:
                pass

    @router.callback_query(F.data.startswith(CB_PAY_CONFIRM))
    async def confirm(cq: CallbackQuery) -> None:
        if not cq.from_user or not cq.data:
            return
        payload = cq.data[len(CB_PAY_CONFIRM):]
        username, _, minor_s = payload.rpartition(":")
        try:
            amount_minor = int(minor_s)
        except ValueError:
            await cq.answer(text="Invalid amount", show_alert=True)
            return
        try:
            result = await api.post(
                cq.from_user.id,
                "/transfers",
                {"recipientUsername": username, "amountMinor": amount_minor},
            )
        except ApiError as e:
            await cq.answer(text=f"⚠️ {e.message}", show_alert=True)
            return
        await cq.answer(text="Sent ✓")
        name = result.get("recipient", {}).get("displayName", username) if isinstance(result, dict) else username
        if cq.message and isinstance(cq.message, Message):
            try:
                await cq.message.edit_text(
                    f"✅ Sent <b>{kobo_to_naira_str(amount_minor)}</b> to <b>{name}</b>."
                )
            except Exception:
                pass

    return router
