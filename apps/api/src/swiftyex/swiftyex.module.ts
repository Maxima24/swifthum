import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SandboxSwiftyexClient } from './sandbox.client';
import { LiveSwiftyexClient } from './live.client';
import { SwiftyexService } from './swiftyex.service';
import { SwiftyexController } from './swiftyex.controller';
import { SWIFTYEX_CLIENT } from './swiftyex.port';

/**
 * Binds SWIFTYEX_CLIENT to exactly one implementation based on SWIFTYEX_MODE.
 * `sandbox` (default) or legacy alias `simulated` → SandboxSwiftyexClient;
 * `live` → LiveSwiftyexClient. This factory is the single selection point — no
 * other module knows which adapter is active.
 */
@Global()
@Module({
  controllers: [SwiftyexController],
  providers: [
    SandboxSwiftyexClient,
    LiveSwiftyexClient,
    {
      provide: SWIFTYEX_CLIENT,
      useFactory: (
        config: ConfigService,
        sandbox: SandboxSwiftyexClient,
        live: LiveSwiftyexClient,
      ) => {
        const mode = (config.get<string>('SWIFTYEX_MODE') ?? 'sandbox').toLowerCase();
        return mode === 'live' ? live : sandbox;
      },
      inject: [ConfigService, SandboxSwiftyexClient, LiveSwiftyexClient],
    },
    SwiftyexService,
  ],
  exports: [SwiftyexService],
})
export class SwiftyexModule {}
