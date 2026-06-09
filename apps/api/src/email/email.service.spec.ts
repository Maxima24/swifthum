import type { ConfigService } from '@nestjs/config';

const mockSendMail = jest.fn(async () => ({}));
const mockVerify = jest.fn(async () => true);
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail, verify: mockVerify }));
jest.mock('nodemailer', () => ({ createTransport: mockCreateTransport }));

import { EmailService } from './email.service';

function cfg(vals: Record<string, string | undefined>): ConfigService {
  return { get: (k: string, d?: string) => (k in vals ? vals[k] : d) } as unknown as ConfigService;
}

const SMTP = { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'app-pw', SMTP_PORT: '587' };

describe('EmailService', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    mockVerify.mockClear();
    mockVerify.mockResolvedValue(true);
    mockCreateTransport.mockClear();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('onModuleInit verifies SMTP when configured, and never throws on failure', async () => {
    const svc = new EmailService(cfg(SMTP));
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    expect(mockVerify).toHaveBeenCalled();

    mockVerify.mockRejectedValueOnce(new Error('535 Invalid login'));
    const svc2 = new EmailService(cfg(SMTP));
    await expect(svc2.onModuleInit()).resolves.toBeUndefined(); // swallowed, logged

    const svc3 = new EmailService(cfg({})); // unconfigured → no verify call
    await svc3.onModuleInit();
  });

  it('is unconfigured + send is a no-op when SMTP env is missing', async () => {
    const svc = new EmailService(cfg({}));
    expect(svc.isConfigured()).toBe(false);
    expect(await svc.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).toEqual({
      ok: false,
      error: 'not configured',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sends via SMTP when configured', async () => {
    const svc = new EmailService(cfg(SMTP));
    expect(svc.isConfigured()).toBe(true);
    const res = await svc.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>', text: 't' });
    expect(res.ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', from: expect.stringContaining('me@gmail.com') }),
    );
  });

  it('returns the error (never throws) when the transport rejects', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('535 Invalid login'));
    const svc = new EmailService(cfg(SMTP));
    const res = await svc.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('535');
  });
});
