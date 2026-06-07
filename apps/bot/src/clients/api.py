"""Async API client used by the bot to act on behalf of users.

Auth model: the bot has an `INTERNAL_API_SECRET` shared with the API. On first
call for a given telegramId it POSTs `/auth/bot/exchange` (guarded by that
secret) and receives a normal session JWT. The JWT is cached per telegramId
until expiry; on 401 we invalidate and re-exchange exactly once.

Every other call is plain `Authorization: Bearer <jwt>` against the same
endpoints the Mini App uses — no internal-only proxy routes.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import aiohttp

from ..exceptions.api_errors import ApiError

# Session JWTs are signed with `JWT_EXPIRES_IN=24h`. We refresh well before
# that to avoid mid-call expiry. 23h is fine; cheap to re-exchange.
_JWT_TTL_SEC = 23 * 60 * 60


@dataclass
class _CachedSession:
    token: str
    expires_at: float  # epoch seconds


class ApiClient:
    def __init__(self, base_url: str, internal_secret: str) -> None:
        self._base = base_url.rstrip("/")
        self._secret = internal_secret
        self._sessions: dict[int, _CachedSession] = {}
        self._locks: dict[int, asyncio.Lock] = {}
        self._usernames: dict[int, str] = {}
        self._http: aiohttp.ClientSession | None = None

    def note_username(self, telegram_id: int, username: str | None) -> None:
        """Remember a user's @handle (from any bot update) so the next session
        exchange forwards it to the API — lets others pay this user by username
        even if they never opened the Mini App. In-memory only, no network."""
        if username:
            self._usernames[telegram_id] = username

    async def __aenter__(self) -> "ApiClient":
        self._http = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._http:
            await self._http.close()
            self._http = None

    # ─── session management ────────────────────────────────────────

    async def _token_for(self, telegram_id: int, *, force_refresh: bool = False) -> str:
        if not force_refresh:
            cached = self._sessions.get(telegram_id)
            if cached and cached.expires_at > time.time():
                return cached.token

        lock = self._locks.setdefault(telegram_id, asyncio.Lock())
        async with lock:
            cached = self._sessions.get(telegram_id)
            if cached and cached.expires_at > time.time() and not force_refresh:
                return cached.token
            body: dict[str, Any] = {"telegramId": telegram_id}
            username = self._usernames.get(telegram_id)
            if username:
                body["username"] = username
            resp = await self._raw(
                "POST", "/auth/bot/exchange",
                json_body=body,
                headers={"X-Internal-Secret": self._secret},
            )
            token = resp["sessionToken"]
            self._sessions[telegram_id] = _CachedSession(
                token=token, expires_at=time.time() + _JWT_TTL_SEC,
            )
            return token

    def invalidate(self, telegram_id: int) -> None:
        self._sessions.pop(telegram_id, None)

    # ─── high-level helpers ────────────────────────────────────────

    async def get(self, telegram_id: int, path: str) -> Any:
        return await self._authed(telegram_id, "GET", path)

    async def post(self, telegram_id: int, path: str, body: dict[str, Any] | None = None) -> Any:
        return await self._authed(telegram_id, "POST", path, json_body=body)

    async def delete(self, telegram_id: int, path: str) -> Any:
        return await self._authed(telegram_id, "DELETE", path)

    # ─── internals ─────────────────────────────────────────────────

    async def _authed(
        self,
        telegram_id: int,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        token = await self._token_for(telegram_id)
        try:
            return await self._raw(
                method, path,
                json_body=json_body,
                headers={"Authorization": f"Bearer {token}"},
            )
        except ApiError as e:
            if e.status != 401:
                raise
            # Single retry with a refreshed session.
            self.invalidate(telegram_id)
            token = await self._token_for(telegram_id, force_refresh=True)
            return await self._raw(
                method, path,
                json_body=json_body,
                headers={"Authorization": f"Bearer {token}"},
            )

    async def _raw(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        if self._http is None:
            raise RuntimeError("ApiClient used outside async context")
        url = f"{self._base}{path}"
        async with self._http.request(method, url, json=json_body, headers=headers) as resp:
            text = await resp.text()
            if resp.status == 204 or not text:
                return None
            try:
                data = await resp.json(content_type=None)
            except Exception:
                data = None
            if 200 <= resp.status < 300:
                return data
            code = (data or {}).get("error", "unknown") if isinstance(data, dict) else "unknown"
            message = (data or {}).get("message", text) if isinstance(data, dict) else text
            raise ApiError(resp.status, str(code), str(message))
