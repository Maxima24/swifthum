import { mockApi } from './mockApi';
import { getToken } from './session';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false';

export const useMocks = USE_MOCKS;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCKS) return mockApi<T>(path, init);

  const t = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
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
