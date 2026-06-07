"""/start — welcome + WebApp launch button, plus deep-link routing.

Telegram deep-links arrive as `https://t.me/<bot>?start=<payload>`; aiogram
exposes `<payload>` via `CommandObject.args` when we use
`CommandStart(deep_link=True)`. The payload is capped at 64 url-safe chars, so
gift links carry a short server-authoritative **claim code** (not a full token):
`?start=gift_<claimCode>` → POST /gifts/claim.

A plain /start with no payload shows the normal welcome.
"""
from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message

from ..clients.api import ApiClient
from ..config import Settings
from ..exceptions.api_errors import ApiError
from ..keyboards.builders import escrow_actions_kb, webapp_launch_kb
from ..services.formatters import format_escrow_card

# Deep-link payload prefixes. Each maps to a handler below.
GIFT_PREFIX = "gift_"
ESCROW_PREFIX = "escrow_"


def build_router(api: ApiClient, settings: Settings) -> Router:
    router = Router(name="start")

    async def _welcome(message: Message) -> None:
        await message.answer(
            "👋 Welcome to <b>SwiftHum</b>!\n\n"
            "I monitor your auto-trading rules and notify you when they fire. "
            "Open the Mini App to manage your wallet, rules, and ultrasonic payments.\n\n"
            "Use /help to see chat commands.",
            reply_markup=webapp_launch_kb(settings.miniapp_url),
        )

    # Deep-link start (has a payload). Registered before the bare handler so the
    # `deep_link=True` filter gets first crack at payload-bearing /start commands.
    @router.message(CommandStart(deep_link=True))
    async def start_deep_link(message: Message, command: CommandObject) -> None:
        payload = (command.args or "").strip()
        if payload.startswith(GIFT_PREFIX):
            await _claim_gift(message, payload[len(GIFT_PREFIX):])
            return
        if payload.startswith(ESCROW_PREFIX):
            await _join_escrow(message, payload[len(ESCROW_PREFIX):])
            return
        # Unknown payload — fall back to the welcome rather than erroring.
        await _welcome(message)

    @router.message(CommandStart())
    async def start(message: Message) -> None:
        await _welcome(message)

    async def _claim_gift(message: Message, claim_code: str) -> None:
        if not message.from_user or not claim_code:
            await _welcome(message)
            return
        try:
            result = await api.post(
                message.from_user.id, "/gifts/claim", {"claimCode": claim_code}
            )
        except ApiError as e:
            # The gifts endpoint lands in the next build phase; until then a 404
            # shouldn't look like a crash. Other errors surface their message.
            if e.status == 404:
                await message.answer(
                    "🎁 This is a SwiftHum gift link — gift claiming is almost ready. "
                    "Open the Mini App in the meantime!",
                    reply_markup=webapp_launch_kb(settings.miniapp_url),
                )
            elif e.code in ("already_redeemed", "invalid_or_expired", "expired"):
                await message.answer("🎁 This gift link has already been claimed or has expired.")
            else:
                await message.answer(f"⚠️ Couldn't claim this gift: {e.message}")
            return

        amount = result.get("amountMinor", 0) if isinstance(result, dict) else 0
        naira = f"₦{amount / 100:,.2f}"
        await message.answer(
            f"🎁 Gift claimed! <b>{naira}</b> has been added to your SwiftHum wallet.",
            reply_markup=webapp_launch_kb(settings.miniapp_url),
        )

    async def _join_escrow(message: Message, code: str) -> None:
        if not message.from_user or not code:
            await _welcome(message)
            return
        try:
            escrow = await api.post(message.from_user.id, "/escrow/join", {"joinCode": code})
        except ApiError as e:
            if e.code in ("already_redeemed", "invalid_or_expired", "expired"):
                await message.answer("🛡 This escrow link is no longer available.")
            elif e.code == "validation_error":
                await message.answer(f"🛡 {e.message}")
            else:
                await message.answer(f"⚠️ Couldn't open this escrow: {e.message}")
            return
        await message.answer(
            "🛡 You've been invited to an escrow:\n\n" + format_escrow_card(escrow),
            reply_markup=escrow_actions_kb(escrow),
        )

    return router
