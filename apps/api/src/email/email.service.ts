import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transactional email over SMTP (e.g. Gmail with an app password). Configured via
 * `SMTP_HOST/PORT/USER/PASS/FROM`. If SMTP isn't configured, `isConfigured()` is
 * false and `send` is a logged no-op — the receipt-email endpoint reports that
 * gracefully instead of erroring. `send` never throws.
 *
 * On boot it runs `transporter.verify()` and logs `SMTP ready ✓` or the exact
 * error, so the api log alone tells you whether the login/connectivity works —
 * no need to send a test receipt to diagnose.
 */
export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger('Email');
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly user?: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    const port = Number(config.get<string>('SMTP_PORT', '587'));
    this.user = user;
    this.from = config.get<string>('SMTP_FROM') || (user ? `SwiftHum <${user}>` : 'SwiftHum');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // 465 = implicit TLS
        requireTLS: port !== 465, // force STARTTLS on 587 (Gmail requires TLS)
        auth: { user, pass },
      });
    } else {
      this.transporter = null;
      const missing = [!host && 'SMTP_HOST', !user && 'SMTP_USER', !pass && 'SMTP_PASS']
        .filter(Boolean)
        .join(', ');
      this.logger.warn(`SMTP not configured (missing ${missing}) — email sending disabled`);
    }
  }

  /** Verify the SMTP login at boot so failures are visible in the log immediately. */
  async onModuleInit(): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.verify();
      this.logger.log(`SMTP ready ✓ (${this.user})`);
    } catch (err) {
      // Don't crash boot — sends will surface the same error per-attempt.
      this.logger.warn(`SMTP verify failed: ${(err as Error).message}`);
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Best-effort send. `ok:false` + `error` if it fails (e.g. Gmail auth rejected). */
  async send(args: SendArgs): Promise<SendResult> {
    if (!this.transporter) return { ok: false, error: 'not configured' };
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
      });
      this.logger.log(`sent "${args.subject}" → ${args.to}`);
      return { ok: true };
    } catch (err) {
      const error = (err as Error).message;
      this.logger.warn(`send failed → ${args.to}: ${error}`);
      return { ok: false, error };
    }
  }
}
