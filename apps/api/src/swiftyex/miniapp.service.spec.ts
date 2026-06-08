import type { ConfigService } from '@nestjs/config';
import { SwiftyexMiniAppService } from './miniapp.service';

function makeService(baseUrl?: string) {
  const config = {
    get: (k: string) => (k === 'SWIFTYEX_MINIAPP_BASE_URL' ? baseUrl : undefined),
  } as unknown as ConfigService;
  return new SwiftyexMiniAppService(config);
}

describe('SwiftyexMiniAppService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('isConfigured reflects the base URL', () => {
    expect(makeService('').isConfigured()).toBe(false);
    expect(makeService('https://sx.example').isConfigured()).toBe(true);
  });

  it('throws when called while unconfigured', async () => {
    await expect(makeService('').getRates()).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('GET rates hits <base>/miniapp/rates and returns the JSON', async () => {
    let calledUrl = '';
    global.fetch = jest.fn(async (input: unknown) => {
      calledUrl = String(input);
      return { ok: true, status: 200, text: async () => JSON.stringify([{ asset: 'USDT' }]) } as Response;
    }) as unknown as typeof fetch;
    const out = await makeService('https://sx.example/').getRates();
    expect(calledUrl).toBe('https://sx.example/miniapp/rates');
    expect(out).toEqual([{ asset: 'USDT' }]);
  });

  it('POSTs initData in the body for per-user calls', async () => {
    let body: unknown;
    global.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, status: 200, text: async () => '{"chat_id":1}' } as Response;
    }) as unknown as typeof fetch;
    await makeService('https://sx.example').getMe('tg-init-data-123');
    expect(body).toEqual({ initData: 'tg-init-data-123' });
  });

  it('maps a non-2xx upstream response to a validation error', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 502, text: async () => '' }) as Response) as unknown as typeof fetch;
    await expect(makeService('https://sx.example').getWallets('x')).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
});
