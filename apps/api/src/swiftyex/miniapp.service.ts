import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Errors } from '../common/errors';

/**
 * Thin client for the **read-only** SwiftyEx Mini App API
 * (https://…/miniapp/{me,wallets,transactions,rates}). Auth is the caller's
 * Telegram `initData` passed in the request body (empty = DEBUG → first chat).
 *
 * Per-user endpoints are reached only from the Mini App (which has initData); the
 * bot can't obtain it. Responses are returned **as-is** (pass-through) — the
 * shapes are upstream-owned, so the controller/Mini-App render them defensively.
 * `rates` is public and also feeds the Watcher (see swiftyex-rates.ts).
 *
 * Everything gates on `SWIFTYEX_MINIAPP_BASE_URL`; unset → `isConfigured()` is
 * false and callers fall back gracefully (Watcher → CoinGecko; UI → empty state).
 */
const TIMEOUT_MS = 3000;

@Injectable()
export class SwiftyexMiniAppService {
  private readonly logger = new Logger('SwiftyexMiniApp');
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('SWIFTYEX_MINIAPP_BASE_URL') ?? '').replace(/\/$/, '');
    if (!this.baseUrl) {
      this.logger.warn('SWIFTYEX_MINIAPP_BASE_URL not set — SwiftyEx Mini App API disabled');
    }
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  /** Public rates (no initData). Raw pass-through. */
  getRates(): Promise<unknown> {
    return this.request('GET', '/miniapp/rates');
  }

  getMe(initData: string): Promise<unknown> {
    return this.request('POST', '/miniapp/me', { initData });
  }

  getWallets(initData: string): Promise<unknown> {
    return this.request('POST', '/miniapp/wallets', { initData });
  }

  getTransactions(initData: string, page = 1, walletType = ''): Promise<unknown> {
    return this.request('POST', '/miniapp/transactions', {
      initData,
      page,
      wallet_type: walletType,
    });
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    if (!this.baseUrl) {
      throw Errors.validation('SwiftyEx not configured');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      const data = text ? safeJson(text) : null;
      if (!res.ok) {
        this.logger.warn(`SwiftyEx ${path} → ${res.status}`);
        throw Errors.validation(`SwiftyEx request failed (${res.status})`);
      }
      return data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw Errors.validation('SwiftyEx request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
