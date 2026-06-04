"""Voice-note payment handler — the spoken counterpart to parse.py.

A voice note is downloaded, transcribed to text (Groq Whisper), then fed to the
exact same POST /payments/parse + confirmation-card flow the text handler uses.
On a confident `send`, render the confirmation card; otherwise a coaching hint.

Register this BEFORE the catch-all text parser in main.py (it filters on F.voice,
so order vs. the text router doesn't actually clash, but keep media handlers ahead
of the catch-all for clarity). The '✖' cancel button is handled by parse.py's
router, so cards produced here cancel correctly without extra wiring.
"""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

from ..clients.api import ApiClient
from ..config import Settings
from ..exceptions.api_errors import ApiError
from ..keyboards.builders import parse_confirm_kb
from ..logger import get
from ..services.formatters import format_parse_confirmation, format_parse_unsure
from ..services.transcribe import Transcriber

CONFIDENCE_THRESHOLD = 0.7

log = get(__name__)


def build_router(api: ApiClient, settings: Settings) -> Router:
    router = Router(name="voice")
    transcriber = Transcriber(settings.groq_api_key, settings.groq_model)

    @router.message(F.voice)
    async def voice_note(message: Message) -> None:
        if not message.from_user or not message.voice or message.bot is None:
            return

        if not transcriber.enabled:
            await message.answer(
                "🎙️ Voice payments aren't switched on yet. Try typing instead — "
                "e.g. <i>Send 5k to Bayo</i>."
            )
            return

        # Download the OGG/Opus voice note into memory.
        try:
            file = await message.bot.get_file(message.voice.file_id)
            buf = await message.bot.download_file(file.file_path)
            audio = buf.read() if buf is not None else b""
        except Exception as e:
            log.warning("voice download failed", error=str(e))
            await message.answer("⚠️ Couldn't grab that voice note. Mind trying again?")
            return

        transcript = await transcriber.transcribe(audio)
        if not transcript or not transcript.strip():
            await message.answer(
                "🤔 I couldn't make out that voice note. Try again, or type it — "
                "e.g. <i>Send 5k to Bayo</i>."
            )
            return

        try:
            result = await api.post(
                message.from_user.id,
                "/payments/parse",
                body={"text": transcript},
            )
        except ApiError as e:
            log.warning("parse api error", code=e.code, status=e.status)
            await message.answer(f"⚠️ {e.message}")
            return

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

    return router
