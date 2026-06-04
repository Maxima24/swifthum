"""Speech-to-text via Groq Whisper.

Optional by design: when GROQ_API_KEY is unset the Transcriber is `enabled=False`
and the voice handler degrades to a friendly "type it instead" hint — mirroring
the API's AnthropicService fallback philosophy (never hard-fail on a missing key).
"""
from __future__ import annotations

from ..logger import get

log = get(__name__)


class Transcriber:
    """Thin async wrapper around Groq's Whisper transcription endpoint."""

    def __init__(self, api_key: str, model: str = "whisper-large-v3-turbo") -> None:
        self._model = model
        self._client = None
        if api_key:
            try:
                from groq import AsyncGroq

                self._client = AsyncGroq(api_key=api_key)
            except Exception as e:  # missing dep / bad key shape — stay disabled
                log.warning("groq init failed", error=str(e))

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def transcribe(self, audio: bytes, filename: str = "voice.ogg") -> str | None:
        """Return the transcript, or None on any failure / empty input."""
        if self._client is None or not audio:
            return None
        try:
            resp = await self._client.audio.transcriptions.create(
                file=(filename, audio),
                model=self._model,
                response_format="text",
            )
            # response_format="text" yields a plain string; guard for SDK variance.
            if isinstance(resp, str):
                return resp.strip()
            text = getattr(resp, "text", None)
            return text.strip() if isinstance(text, str) else None
        except Exception as e:
            log.warning("transcription failed", error=str(e))
            return None
