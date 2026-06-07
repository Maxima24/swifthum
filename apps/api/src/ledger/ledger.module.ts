import { Global, Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/**
 * Global so the seed (users), payments, and (later) gift/escrow flows all share
 * one LedgerService without repeated imports across the api + worker apps.
 */
@Global()
@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
