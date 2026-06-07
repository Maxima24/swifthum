import { Global, Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

/**
 * Global so PaymentsService + GiftsService (and later EscrowService) can inject
 * ReceiptsService to emit on completed movements, with no import cycle —
 * ReceiptsService only depends on Prisma + Config.
 */
@Global()
@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
