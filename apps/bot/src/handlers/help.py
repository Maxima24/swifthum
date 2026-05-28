"""/help — command roster."""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from ..config import Settings
from ..keyboards.builders import webapp_launch_kb


def build_router(settings: Settings) -> Router:
    router = Router(name="help")

    @router.message(Command("help"))
    async def help_cmd(message: Message) -> None:
        await message.answer(
            "<b>Commands</b>\n"
            "/start — open the Mini App\n"
            "/balance — your NGN wallet balance\n"
            "/rules — list your active rules (with ⏸ Pause / ▶ Resume buttons)\n"
            "/pause &lt;rule_id&gt; — pause a rule\n"
            "/resume &lt;rule_id&gt; — resume a paused rule\n\n"
            "For payments and richer rule editing, open the Mini App below.",
            reply_markup=webapp_launch_kb(settings.miniapp_url),
        )

    return router
