import { mockApi } from './mockApi';
import { getToken } from './session';
import { getInitDataRaw } from './tg';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false';

export const useMocks = USE_MOCKS;

/**
 * Error thrown on a non-2xx API response. Carries the HTTP `status` and the
 * backend's machine `code` (the `error` field of the `{ error, message }` body)
 * so callers can branch on a stable code instead of parsing message strings.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCKS) return mockApi<T>(path, init);

  const t = getToken();
  // Forward the raw Telegram initData so SwiftyEx-proxy endpoints can authenticate
  // the user to the real SwiftyEx Mini App API. Harmless on every other call.
  const initData = getInitDataRaw();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(initData ? { 'X-Telegram-InitData': initData } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let code: string | null = null;
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body === 'object') {
        if (typeof body.error === 'string') code = body.error;
        if (typeof body.message === 'string' && body.message) message = body.message;
      }
    } catch {
      /* non-JSON body — keep the status line */
    }
    throw new ApiError(res.status, code, message);
  }
  // 204 No Content (e.g. DELETE /swiftyex/link) has no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
