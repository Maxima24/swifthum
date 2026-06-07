import 'reflect-metadata';
import { AppModule } from './app.module';
import { WorkerModule } from './worker/worker.module';
import { LedgerModule } from './ledger/ledger.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { GiftsModule } from './gifts/gifts.module';
import { PaymentsModule } from './payments/payments.module';
import { EscrowModule } from './escrow/escrow.module';

/**
 * Guards against the imported-but-not-registered bug: a module referenced in a
 * service's constructor whose providing module is `import`ed at the top of
 * app.module / worker.module but missing from the `imports: []` array. That
 * compiles and unit-tests fine but crashes Nest DI at boot. Both the API and the
 * worker are separate application contexts, so each must register the global
 * money modules it (transitively) depends on.
 */
function importsOf(mod: object): unknown[] {
  return (Reflect.getMetadata('imports', mod) as unknown[]) ?? [];
}

describe('module wiring', () => {
  it('AppModule registers the money/receipt modules its services depend on', () => {
    const imports = importsOf(AppModule);
    for (const m of [LedgerModule, ReceiptsModule, GiftsModule, PaymentsModule, EscrowModule]) {
      expect(imports).toContain(m);
    }
  });

  it('WorkerModule registers the modules its processor depends on', () => {
    const imports = importsOf(WorkerModule);
    for (const m of [LedgerModule, ReceiptsModule, GiftsModule, PaymentsModule, EscrowModule]) {
      expect(imports).toContain(m);
    }
  });
});
