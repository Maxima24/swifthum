import { mockApi } from './mockApi';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false';

let sessionToken: string | null = null;

export function setSessionToken(t: string | null) {
  sessionToken = t;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCKS) return mockApi<T>(path, init);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${res.statusText} ${detail}`);
  }
  // 204 No Content (e.g. DELETE /swiftyex/link) has no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
