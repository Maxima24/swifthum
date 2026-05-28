/**
 * Session source-of-truth.
 *
 * api.ts reads the bearer token from here, AuthGate writes to it after a
 * successful POST /auth/telegram. In-memory only — Telegram Mini Apps
 * re-launch fresh every time and re-auth is fast.
 */

export interface SessionUser {
  id: string;
  telegramId: number;
  displayName: string;
}

let token: string | null = null;
let user: SessionUser | null = null;
const listeners = new Set<() => void>();

export function getToken(): string | null {
  return token;
}

export function getUser(): SessionUser | null {
  return user;
}

export function setSession(nextToken: string | null, nextUser: SessionUser | null = null) {
  token = nextToken;
  user = nextUser;
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
