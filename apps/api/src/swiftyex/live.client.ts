import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ASSETS } from '../common/assets';
import { decryptCredential } from './credential-crypto';
import {
  type AccountStatus,
  type Holding,
  type OrderRequest,
  type OrderResult,
  type PriceMapMinor,
  type SwiftyexPort,
} from './swiftyex.port';

/**
 * Live SwiftyEx client — the drop-in target.
 *
 * This is a *real skeleton*, not a throw-stub: configuration plumbing, per-user
 * credential resolution, and the HTTP call shapes are all in place. When the
 * hackathon org releases endpoint docs, the only work is filling in the marked
 * `// TODO:` request/response mapping in each method. No other module changes.
 *
 * Enable with SWIFTYEX_MODE=live + SWIFTYEX_BASE_URL + SWIFTYEX_API_KEY (+ each
 * user links their own key via POST /swiftyex/link).
 */
@Injectable()
export class LiveSwiftyexClient implements SwiftyexPort {
  private readonly logger = new Logger('SwiftyEx.Live');
  private readonly baseUrl: string;
  private readonly appKey: string;
  private readonly encSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.baseUrl = (config.get<string>('SWIFTYEX_BASE_URL') ?? '').replace(/\/$/, '');
    this.appKey = config.get<string>('SWIFTYEX_API_KEY') ?? '';
    this.encSecret = config.get<string>('SWIFTYEX_KEY_ENC_SECRET', '');
  }

  // ─── market data (app-level auth) ───────────────────────────────

  async currentPrices(): Promise<PriceMapMinor> {
    this.requireConfig();
    // TODO: GET ${baseUrl}/market/prices?assets=USDT,BTC,ETH&quote=NGN
    //   const res = await this.appFetch(`/market/prices?assets=${ASSETS.join(',')}&quote=NGN`);
    //   map each asset's NGN price → minor units (×100) into PriceMapMinor.
    return this.notImplemented('currentPrices', `/market/prices (assets: ${ASSETS.join(',')})`);
  }

  // ─── trading (per-user auth) ────────────────────────────────────

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    this.requireConfig();
    const userKey = await this.resolveUserKey(req.userId);
    void userKey;
    // TODO: POST ${baseUrl}/orders  (auth: user key)
    //   body { side, asset, amountMinor, currency }
    //   map response → OrderResult { orderId, status, filledPriceMinor, filledQtyBase }
    return this.notImplemented('placeOrder', '/orders');
  }

  async getOrder(userId: string, orderId: string): Promise<OrderResult | null> {
    this.requireConfig();
    const userKey = await this.resolveUserKey(userId);
    void userKey;
    // TODO: GET ${baseUrl}/orders/${orderId}  (auth: user key) → OrderResult
    return this.notImplemented('getOrder', `/orders/${orderId}`);
  }

  // ─── portfolio (per-user auth) ──────────────────────────────────

  async getHoldings(userId: string): Promise<Holding[]> {
    this.requireConfig();
    const userKey = await this.resolveUserKey(userId);
    void userKey;
    // TODO: GET ${baseUrl}/account/balances  (auth: user key)
    //   map each balance → Holding { asset, qtyBase } (×10^8)
    return this.notImplemented('getHoldings', '/account/balances');
  }

  // ─── account linking ────────────────────────────────────────────

  async linkAccount(userId: string, credential: string): Promise<AccountStatus> {
    this.requireConfig();
    // TODO: validate `credential` against the real API (e.g. GET /account with that key).
    //   On success, encrypt + persist to SwiftyexAccount (see SandboxSwiftyexClient.linkAccount).
    void userId;
    void credential;
    return this.notImplemented('linkAccount', '/account (validate key)');
  }

  async unlinkAccount(userId: string): Promise<void> {
    await this.prisma.swiftyexAccount.deleteMany({ where: { userId } });
  }

  async getAccount(userId: string): Promise<AccountStatus> {
    const row = await this.prisma.swiftyexAccount.findUnique({ where: { userId } });
    if (!row) return { linked: false };
    return { linked: true, label: row.label ?? undefined, linkedAt: row.linkedAt.toISOString() };
  }

  // ─── plumbing ───────────────────────────────────────────────────

  /** Decrypt the calling user's stored SwiftyEx credential, or throw if unlinked. */
  private async resolveUserKey(userId: string): Promise<string> {
    const row = await this.prisma.swiftyexAccount.findUnique({ where: { userId } });
    if (!row) throw new Error('user has not linked a SwiftyEx account');
    return decryptCredential(row.apiKey, this.encSecret);
  }

  /** Authenticated fetch against the SwiftyEx base URL using the app-level key. */
  private async appFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.appKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }

  private requireConfig(): void {
    if (!this.baseUrl) {
      throw new Error('SwiftyEx live mode is not configured — set SWIFTYEX_BASE_URL');
    }
  }

  private notImplemented(method: string, endpoint: string): never {
    throw new Error(
      `LiveSwiftyexClient.${method} not implemented yet — wire to ${endpoint} when SwiftyEx docs land`,
    );
  }
}
