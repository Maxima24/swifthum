"""Outer middleware that remembers each user's Telegram @handle.

Runs for every message + callback. It only stores the handle in the ApiClient's
in-memory map (no network call); the handle is forwarded to the API on the next
session exchange, so bot-only users become findable by pay-by-username.
"""
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from ..clients.api import ApiClient


class UsernameCaptureMiddleware(BaseMiddleware):
    def __init__(self, api: ApiClient) -> None:
        self._api = api

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = getattr(event, "from_user", None)
        if user is not None:
            self._api.note_username(user.id, getattr(user, "username", None))
        return await handler(event, data)
