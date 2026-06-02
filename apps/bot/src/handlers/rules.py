"""/rules + /pause + /resume + inline callback Pause/Resume."""
from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..clients.api import ApiClient
from ..exceptions.api_errors import ApiError
from ..keyboards.builders import CB_RULE_PAUSE, CB_RULE_RESUME, rule_actions_kb
from ..services.formatters import format_rule_line, format_rules_list


def build_router(api: ApiClient) -> Router:
    router = Router(name="rules")

    @router.message(Command("rules"))
    async def list_rules(message: Message) -> None:
        if not message.from_user:
            return
        try:
            rules = await api.get(message.from_user.id, "/rules")
        except ApiError as e:
            await message.answer(f"⚠️ Couldn't load your rules: {e.message}")
            return
        if not rules:
            await message.answer(format_rules_list([]))
            return
        # Header
        await message.answer("<b>Your rules</b>")
        # One message per rule so each gets its own inline keyboard.
        for i, rule in enumerate(rules, start=1):
            await message.answer(
                format_rule_line(i, rule),
                reply_markup=rule_actions_kb(rule["id"], rule.get("state") == "paused"),
            )

    @router.message(Command("pause"))
    async def pause_cmd(message: Message, command: CommandObject) -> None:
        if not message.from_user:
            return
        rule_id = (command.args or "").strip()
        if not rule_id:
            await message.answer("Usage: /pause &lt;rule_id&gt;\nTip: tap the ⏸ button under a /rules entry.")
            return
        await _toggle(message.from_user.id, rule_id, paused=True, sink=message.answer)

    @router.message(Command("resume"))
    async def resume_cmd(message: Message, command: CommandObject) -> None:
        if not message.from_user:
            return
        rule_id = (command.args or "").strip()
        if not rule_id:
            await message.answer("Usage: /resume &lt;rule_id&gt;")
            return
        await _toggle(message.from_user.id, rule_id, paused=False, sink=message.answer)

    @router.callback_query(F.data.startswith(CB_RULE_PAUSE))
    async def cb_pause(cq: CallbackQuery) -> None:
        await _handle_cb(cq, paused=True)

    @router.callback_query(F.data.startswith(CB_RULE_RESUME))
    async def cb_resume(cq: CallbackQuery) -> None:
        await _handle_cb(cq, paused=False)

    async def _handle_cb(cq: CallbackQuery, *, paused: bool) -> None:
        if not cq.from_user or not cq.data:
            return
        prefix = CB_RULE_PAUSE if paused else CB_RULE_RESUME
        rule_id = cq.data[len(prefix):]
        path = f"/rules/{rule_id}/{'pause' if paused else 'resume'}"
        try:
            rule = await api.post(cq.from_user.id, path, body={})
        except ApiError as e:
            await cq.answer(text=f"⚠️ {e.message}", show_alert=True)
            return
        await cq.answer(text="Paused" if paused else "Resumed")
        # Edit the message in place to reflect the new state.
        if cq.message and isinstance(cq.message, Message):
            # `cq.message` is the row card we sent originally; we don't have the
            # original index handy, but re-rendering with index 1 is fine for the
            # status feedback. (Telegram won't allow editing text identical to
            # what's there; ignore that case.)
            try:
                await cq.message.edit_text(
                    format_rule_line(1, rule),
                    reply_markup=rule_actions_kb(rule["id"], rule.get("state") == "paused"),
                )
            except Exception:
                pass

    async def _toggle(tg_id: int, rule_id: str, *, paused: bool, sink) -> None:
        path = f"/rules/{rule_id}/{'pause' if paused else 'resume'}"
        try:
            rule = await api.post(tg_id, path, body={})
        except ApiError as e:
            await sink(f"⚠️ {e.message}")
            return
        await sink(
            ("⏸ Paused: " if paused else "▶ Resumed: ") + format_rule_line(1, rule),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text="▶ Resume" if paused else "⏸ Pause",
                    callback_data=(CB_RULE_RESUME if paused else CB_RULE_PAUSE) + rule_id,
                )
            ]]),
        )

    return router
