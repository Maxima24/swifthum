import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Global so ReceiptsService (and anything else) can inject EmailService without
 * repeated imports. Must be registered in BOTH app.module and worker.module —
 * the worker instantiates ReceiptsService too, and @Global only applies within
 * the context that imports it.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
