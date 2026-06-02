import type { ConfigService } from '@nestjs/config';
import { AnthropicService } from './anthropic.service';

/**
 * These tests stub the @anthropic-ai/sdk client by swapping the private
 * `client` field after construction. We don't go over the wire.
 */

function makeService(config: Partial<Record<string, string>> = {}): AnthropicService {
  const cfg = {
    get: (k: string, dflt?: string) => (k in config ? config[k] : dflt),
  } as unknown as ConfigService;
  return new AnthropicService(cfg);
}

function stubClientResponse(svc: AnthropicService, body: string) {
  (svc as unknown as { client: { messages: { create: jest.Mock } } }).client = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: body }],
      }),
    },
  };
}

function stubClientThrows(svc: AnthropicService, err: Error) {
  (svc as unknown as { client: { messages: { create: jest.Mock } } }).client = {
    messages: { create: jest.fn().mockRejectedValue(err) },
  };
}

describe('AnthropicService.parsePayment', () => {
  // The constructor warns about missing key — silence for cleaner test output.
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));

  it('returns the static fallback when no API key is configured', async () => {
    const svc = makeService({});
    const res = await svc.parsePayment('Abeg send 5k');
    expect(res.intent).toBeNull();
    expect(res.confidence).toBe(0);
    expect(res.explanation).toContain("couldn't parse");
  });

  it('returns the fallback for empty input without calling the model', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    const create = jest.fn();
    (svc as unknown as { client: { messages: { create: jest.Mock } } }).client = {
      messages: { create },
    };
    const res = await svc.parsePayment('   ');
    expect(res.intent).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('parses a Pidgin "send 5k" message', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    stubClientResponse(
      svc,
      JSON.stringify({
        intent: 'send',
        amountMinor: 500000,
        currency: 'NGN',
        recipient: 'Bayo',
        confidence: 0.95,
        explanation: null,
      }),
    );
    const res = await svc.parsePayment('Abeg send Bayo 5k');
    expect(res.intent).toBe('send');
    expect(res.amountMinor).toBe(500000);
    expect(res.currency).toBe('NGN');
    expect(res.recipient).toBe('Bayo');
    expect(res.confidence).toBeCloseTo(0.95);
  });

  it('tolerates ```json fences around the response', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    stubClientResponse(
      svc,
      '```json\n{"intent":"send","amountMinor":1000000,"currency":"NGN","recipient":"Ada","confidence":0.9,"explanation":null}\n```',
    );
    const res = await svc.parsePayment('send 10k to Ada');
    expect(res.intent).toBe('send');
    expect(res.amountMinor).toBe(1_000_000);
  });

  it('rejects oversize amounts (>₦100,000 = 10,000,000 kobo) as a non-parse', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    stubClientResponse(
      svc,
      JSON.stringify({
        intent: 'send',
        amountMinor: 50_000_000_00, // ₦50M — definitely a parse error
        currency: 'NGN',
        recipient: 'Ada',
        confidence: 0.9,
        explanation: null,
      }),
    );
    const res = await svc.parsePayment('send 50 million naira to Ada');
    expect(res.intent).toBeNull();
    expect(res.amountMinor).toBeNull();
    expect(res.confidence).toBeLessThan(0.4);
    expect(res.explanation).toContain('too large');
  });

  it('returns intent:null for non-payment messages', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    stubClientResponse(
      svc,
      JSON.stringify({
        intent: null,
        amountMinor: null,
        currency: null,
        recipient: null,
        confidence: 1.0,
        explanation: null,
      }),
    );
    const res = await svc.parsePayment('hi how far');
    expect(res.intent).toBeNull();
    expect(res.confidence).toBe(1);
  });

  it('falls back when the model returns garbage (not JSON)', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    stubClientResponse(svc, 'Sure! Here is a parse: not actually JSON');
    const res = await svc.parsePayment('send 5k');
    expect(res.intent).toBeNull();
    expect(res.confidence).toBe(0);
  });

  it('falls back on timeout / SDK error', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    stubClientThrows(svc, new Error('Request timed out'));
    const res = await svc.parsePayment('send 5k');
    expect(res.intent).toBeNull();
    expect(res.confidence).toBe(0);
    expect(res.explanation).toContain('timeout_or_error');
  });

  it('clamps weird confidence values to [0,1]', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    stubClientResponse(
      svc,
      JSON.stringify({
        intent: 'send',
        amountMinor: 500000,
        currency: 'NGN',
        recipient: 'Bayo',
        confidence: 1.5,
        explanation: null,
      }),
    );
    const res = await svc.parsePayment('send 5k to Bayo');
    expect(res.confidence).toBe(1);
  });

  it('truncates very long recipient strings', async () => {
    const svc = makeService({ ANTHROPIC_API_KEY: 'sk-test' });
    const long = 'a'.repeat(200);
    stubClientResponse(
      svc,
      JSON.stringify({
        intent: 'send',
        amountMinor: 500000,
        currency: 'NGN',
        recipient: long,
        confidence: 0.9,
        explanation: null,
      }),
    );
    const res = await svc.parsePayment('send 5k');
    expect(res.recipient?.length).toBeLessThanOrEqual(60);
  });
});
