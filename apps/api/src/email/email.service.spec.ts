import type { ConfigService } from '@nestjs/config';

const mockSendMail = jest.fn(async () => ({}));
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
jest.mock('nodemailer', () => ({ createTransport: mockCreateTransport }));

import { EmailService } from './email.service';

function cfg(vals: Record<string, string | undefined>): ConfigService {
  return { get: (k: string, d?: string) => (k in vals ? vals[k] : d) } as unknown as ConfigService;
}

const SMTP = { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'app-pw', SMTP_PORT: '587' };

describe('EmailService', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('is unconfigured + send is a no-op when SMTP env is missing', async () => {
    const svc = new EmailService(cfg({}));
    expect(svc.isConfigured()).toBe(false);
    expect(await svc.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sends via SMTP when configured', async () => {
    const svc = new EmailService(cfg(SMTP));
    expect(svc.isConfigured()).toBe(true);
    const ok = await svc.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>', text: 't' });
    expect(ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', from: expect.stringContaining('me@gmail.com') }),
    );
  });

  it('returns false (never throws) when the transport errors', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('smtp down'));
    const svc = new EmailService(cfg(SMTP));
    expect(await svc.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).toBe(false);
  });
});
