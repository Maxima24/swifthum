"""/menu — tap-to-act hub + quick commands (/prices, /portfolio, /history).

The hub is an inline keyboard; tapping a button edits the message in place to show
that section with a "‹ Back to menu" button. Each section has a shared render
coroutine reused by the matching slash command. All data comes from the backend
the Mini App already uses (wallets, rules, prices, swiftyex, transactions).
"""
from __future__ import annotations

from typing import Any

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from ..clients.api import ApiClient
from ..config import Settings
from ..exceptions.api_errors import ApiError
from ..keyboards.builders import CB_MENU, back_to_menu_kb, menu_hub_kb, swiftyex_kb
from ..logger import get
from ..services.formatters import (
    format_balance,
    format_history,
    format_portfolio,
    format_prices,
    format_rules_list,
    format_swiftyex_account,
)

log = get(__name__)

HUB_TEXT = "🚀 <b>SwiftHum</b> — what would you like to do?"


def build_router(api: ApiClient, settings: Settings) -> Router:
    router = Router(name="menu")

    # ─── section renderers (shared by commands + callbacks) ──────────

    async def render_balance(tg_id: int) -> str:
        return format_balance(await api.get(tg_id, "/wallets/me"))

    async def render_rules(tg_id: int) -> str:
        return format_rules_list(await api.get(tg_id, "/rules") or [])

    async def render_prices(tg_id: int) -> str:
        return format_prices(await api.get(tg_id, "/prices/current") or {})

    async def render_portfolio(tg_id: int) -> str:
        holdings = await api.get(tg_id, "/swiftyex/holdings") or []
        prices = await api.get(tg_id, "/prices/current") or {}
        return format_portfolio(holdings, prices)

    async def render_history(tg_id: int) -> str:
        data = await api.get(tg_id, "/transactions")
        items = data.get("items", []) if isinstance(data, dict) else (data or [])
        return format_history(items)

    async def render_swiftyex(tg_id: int) -> tuple[str, Any]:
        account = await api.get(tg_id, "/swiftyex/account") or {}
        return format_swiftyex_account(account), swiftyex_kb(bool(account.get("linked")))

    _SECTIONS = {
        "balance": render_balance,
        "rules": render_rules,
        "prices": render_prices,
        "portfolio": render_portfolio,
        "history": render_history,
    }

    async def _safe_edit(message: Message, text: str, markup: Any) -> None:
        try:
            await message.edit_text(text, reply_markup=markup)
        except TelegramBadRequest:
            # "message is not modified" when re-tapping the same section — ignore.
            pass

    # ─── commands ────────────────────────────────────────────────────

    @router.message(Command("menu"))
    async def menu_cmd(message: Message) -> None:
        await message.answer(HUB_TEXT, reply_markup=menu_hub_kb(settings.miniapp_url))

    async def _quick(message: Message, renderer) -> None:
        if not message.from_user:
            return
        try:
            text = await renderer(message.from_user.id)
        except ApiError as e:
            await message.answer(f"⚠️ {e.message}")
            return
        await message.answer(text, reply_markup=back_to_menu_kb())

    @router.message(Command("prices"))
    async def prices_cmd(message: Message) -> None:
        await _quick(message, render_prices)

    @router.message(Command("portfolio"))
    async def portfolio_cmd(message: Message) -> None:
        await _quick(message, render_portfolio)

    @router.message(Command("history"))
    async def history_cmd(message: Message) -> None:
        await _quick(message, render_history)

    # ─── hub callbacks ───────────────────────────────────────────────

    @router.callback_query(F.data.startswith(CB_MENU))
    async def on_menu(cq: CallbackQuery) -> None:
        if not cq.from_user or not cq.data or not isinstance(cq.message, Message):
            await cq.answer()
            return
        action = cq.data[len(CB_MENU):]
        tg_id = cq.from_user.id
        try:
            if action == "home":
                await _safe_edit(cq.message, HUB_TEXT, menu_hub_kb(settings.miniapp_url))
                await cq.answer()
                return

            if action == "swiftyex":
                text, kb = await render_swiftyex(tg_id)
                await _safe_edit(cq.message, text, kb)
                await cq.answer()
                return

            if action in ("sx:link", "sx:unlink"):
                if action == "sx:link":
                    await api.post(tg_id, "/swiftyex/link", body={"apiKey": "demo-sandbox-key"})
                else:
                    await api.delete(tg_id, "/swiftyex/link")
                text, kb = await render_swiftyex(tg_id)
                await _safe_edit(cq.message, text, kb)
                await cq.answer(text="Linked" if action == "sx:link" else "Unlinked")
                return

            renderer = _SECTIONS.get(action)
            if renderer is None:
                await cq.answer()
                return
            text = await renderer(tg_id)
            await _safe_edit(cq.message, text, back_to_menu_kb())
            await cq.answer()
        except ApiError as e:
            await cq.answer(text=f"⚠️ {e.message}", show_alert=True)
        except Exception as e:  # pragma: no cover — defensive; never crash the loop
            log.warning("menu callback failed", action=action, error=str(e))
            await cq.answer()

    return router
