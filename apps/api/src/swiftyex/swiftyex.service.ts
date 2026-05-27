import { Inject, Injectable } from '@nestjs/common';
import {
  type AccountStatus,
  type Holding,
  type OrderRequest,
  type OrderResult,
  type PriceMapMinor,
  type SwiftyexPort,
  SWIFTYEX_CLIENT,
} from './swiftyex.port';

/**
 * Thin facade over whichever SwiftyEx implementation the module factory bound to
 * SWIFTYEX_CLIENT (sandbox or live). Consumers inject SwiftyexService and never
 * learn which adapter is active — that's the whole point of the seam.
 */
@Injectable()
export class SwiftyexService implements SwiftyexPort {
  constructor(@Inject(SWIFTYEX_CLIENT) private readonly client: SwiftyexPort) {}

  currentPrices(): Promise<PriceMapMinor> {
    return this.client.currentPrices();
  }

  placeOrder(req: OrderRequest): Promise<OrderResult> {
    return this.client.placeOrder(req);
  }

  getOrder(userId: string, orderId: string): Promise<OrderResult | null> {
    return this.client.getOrder(userId, orderId);
  }

  getHoldings(userId: string): Promise<Holding[]> {
    return this.client.getHoldings(userId);
  }

  linkAccount(userId: string, credential: string): Promise<AccountStatus> {
    return this.client.linkAccount(userId, credential);
  }

  unlinkAccount(userId: string): Promise<void> {
    return this.client.unlinkAccount(userId);
  }

  getAccount(userId: string): Promise<AccountStatus> {
    return this.client.getAccount(userId);
  }
}
