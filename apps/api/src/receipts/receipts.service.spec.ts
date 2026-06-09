import type { ConfigService } from '@nestjs/config';
import { ReceiptsService } from './receipts.service';

const SECRET = 'test-signed-token-secret';

function makeService(
  opts: {
    emailConfigured?: boolean;
    userEmail?: string | null;
    emails?: Record<string, string | null>;
    sendFails?: boolean;
  } = {},
) {
  const store = new Map<string, any>();
  const db: any = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    receipt: {
      create: async ({ data }: any) => {
        const row = { ...data, emailedAt: data.emailedAt ?? null, createdAt: new Date() };
        store.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }: any) => store.get(where.id) ?? null,
      findFirst: async ({ where }: any) =>
        [...store.values()].find(
          (r) => r.sourceType === where.sourceType && r.sourceId === where.sourceId,
        ) ?? null,
      update: async ({ where, data }: any) => {
        const row = store.get(where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: any) => {
        const rows = [...store.values()];
        if (where?.OR) {
          const ids = new Set(
            where.OR.flatMap((c: any) => Object.entries(c)).map(([k, v]) => `${k}:${v}`),
          );
          return rows.filter(
            (r) => ids.has(`fromUserId:${r.fromUserId}`) || ids.has(`toUserId:${r.toUserId}`),
          );
        }
        return rows;
      },
    },
    user: {
      findUnique: async ({ where }: any) => ({
        email: opts.emails ? (opts.emails[where.id] ?? null) : (opts.userEmail ?? null),
      }),
    },
  };

  const config = {
    get: (k: string, d?: string) =>
      k === 'SIGNED_TOKEN_SECRET'
        ? SECRET
        : k === 'MINIAPP_URL'
          ? 'https://swifthum.example.org'
          : d,
    getOrThrow: (_k: string) => SECRET,
  } as unknown as ConfigService;

  const email = {
    isConfigured: jest.fn(() => opts.emailConfigured ?? true),
    send: jest.fn(async () =>
      opts.sendFails ? { ok: false, error: '535 Invalid login' } : { ok: true },
    ),
  } as any;

  const svc = new ReceiptsService(db, email, config);
  return { svc, db, store, email };
}

const baseArgs = {
  sourceType: 'payment' as const,
  sourceId: 'i_1',
  fromUserId: 'u_a',
  toUserId: 'u_b',
  fromName: 'Ada',
  toName: 'Bayo',
  amountMinor: 50_000n,
};

describe('ReceiptsService.emit + verifyToken', () => {
  it('emits a signed receipt that verifies, with masked names from the DB', async () => {
    const { svc, db } = makeService();
    const row = await svc.emit(db, baseArgs);
    expect(row.id).toMatch(/^rcpt_/);
    expect(row.token).toContain('.');

    const res = await svc.verifyToken(row.token);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.receipt.id).toBe(row.id);
      expect(res.receipt.amountMinor).toBe(50000);
      expect(res.receipt.from).toBe('Ada');
      expect(res.receipt.to).toBe('Bayo');
      expect(res.receipt.sourceType).toBe('payment');
    }
  });

  it('rejects a tampered token (the URL-tamper demo)', async () => {
    const { svc, db } = makeService();
    const row = await svc.emit(db, baseArgs);
    const [body, sig] = row.token.split('.');
    const tamperedBody = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A');
    const res = await svc.verifyToken(`${tamperedBody}.${sig}`);
    expect(res.valid).toBe(false);
  });

  it('rejects a garbage / empty token', async () => {
    const { svc } = makeService();
    expect((await svc.verifyToken('')).valid).toBe(false);
    expect((await svc.verifyToken('not-a-token')).valid).toBe(false);
  });

  it('rejects a validly-signed token whose receipt does not exist', async () => {
    const { svc, db } = makeService();
    const row = await svc.emit(db, baseArgs);
    // Drop the row but keep the (otherwise valid) token.
    (db.receipt as any).findUnique = async () => null;
    expect((await svc.verifyToken(row.token)).valid).toBe(false);
  });
});

describe('ReceiptsService.emailReceipt', () => {
  it('sends to the caller’s saved email when configured + marks it emailed', async () => {
    const { svc, db, store, email } = makeService({ emailConfigured: true, userEmail: 'ada@gmail.com' });
    const row = await svc.emit(db, baseArgs);
    const res = await svc.emailReceipt('u_a', row.id);
    expect(res.status).toBe('ok');
    expect(res.to).toBe('ada@gmail.com');
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@gmail.com', subject: expect.stringContaining('SwiftHum receipt') }),
    );
    expect(store.get(row.id).emailedAt).toBeInstanceOf(Date);
  });

  it('uses an override email over the saved one', async () => {
    const { svc, db, email } = makeService({ userEmail: 'saved@x.com' });
    const row = await svc.emit(db, baseArgs);
    await svc.emailReceipt('u_b', row.id, 'Override@X.com');
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'override@x.com' }));
  });

  it('returns no_email when the caller has no email and none is given', async () => {
    const { svc, db } = makeService({ userEmail: null });
    const row = await svc.emit(db, baseArgs);
    expect((await svc.emailReceipt('u_a', row.id)).status).toBe('no_email');
  });

  it('returns not_configured when SMTP is off', async () => {
    const { svc, db } = makeService({ emailConfigured: false, userEmail: 'a@b.com' });
    const row = await svc.emit(db, baseArgs);
    expect((await svc.emailReceipt('u_a', row.id)).status).toBe('not_configured');
  });

  it('returns failed (with the SMTP error) when configured but the send is rejected', async () => {
    const { svc, db } = makeService({ emailConfigured: true, userEmail: 'a@b.com', sendFails: true });
    const row = await svc.emit(db, baseArgs);
    const res = await svc.emailReceipt('u_a', row.id);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('535');
  });

  it('rejects a non-party (404, does not reveal the receipt)', async () => {
    const { svc, db } = makeService({ userEmail: 'x@y.com' });
    const row = await svc.emit(db, baseArgs);
    await expect(svc.emailReceipt('u_stranger', row.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('ReceiptsService.autoEmail (fire-and-forget on success)', () => {
  it('emails every party with a saved email + marks the receipt emailed', async () => {
    const { svc, db, store, email } = makeService({
      emails: { u_a: 'from@x.com', u_b: 'to@x.com' },
    });
    const row = await svc.emit(db, baseArgs); // from u_a → to u_b
    await svc.autoEmail('payment', 'i_1');
    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'to@x.com' }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'from@x.com' }));
    expect(store.get(row.id).emailedAt).toBeInstanceOf(Date);
  });

  it('only emails the party that has an email', async () => {
    const { svc, db, email } = makeService({ emails: { u_a: null, u_b: 'to@x.com' } });
    await svc.emit(db, baseArgs);
    await svc.autoEmail('payment', 'i_1');
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'to@x.com' }));
  });

  it('is a no-op when already emailed, no party emails, or SMTP is off', async () => {
    const already = makeService({ emails: { u_b: 'to@x.com' } });
    const r = await already.svc.emit(already.db, baseArgs);
    already.store.get(r.id).emailedAt = new Date();
    await already.svc.autoEmail('payment', 'i_1');
    expect(already.email.send).not.toHaveBeenCalled();

    const none = makeService({ emails: {} });
    await none.svc.emit(none.db, baseArgs);
    await none.svc.autoEmail('payment', 'i_1');
    expect(none.email.send).not.toHaveBeenCalled();

    const off = makeService({ emailConfigured: false, emails: { u_b: 'to@x.com' } });
    await off.svc.emit(off.db, baseArgs);
    await off.svc.autoEmail('payment', 'i_1');
    expect(off.email.send).not.toHaveBeenCalled();
  });

  it('never throws (best-effort)', async () => {
    const { svc } = makeService();
    await expect(svc.autoEmail('payment', 'does-not-exist')).resolves.toBeUndefined();
  });
});

describe('ReceiptsService.listForUser', () => {
  it('returns receipts with direction, counterparty, and a share url', async () => {
    const { svc, db } = makeService();
    await svc.emit(db, baseArgs); // u_a → u_b

    const sender = await svc.listForUser('u_a');
    expect(sender.items).toHaveLength(1);
    expect(sender.items[0].direction).toBe('sent');
    expect(sender.items[0].counterparty.displayName).toBe('Bayo');
    expect(sender.items[0].url).toContain('https://swifthum.example.org/r/');
    expect(sender.items[0].url).toContain('?token=');

    const recipient = await svc.listForUser('u_b');
    expect(recipient.items[0].direction).toBe('received');
    expect(recipient.items[0].counterparty.displayName).toBe('Ada');
  });
});
