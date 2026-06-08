import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transactional email over SMTP (e.g. Gmail with an app password). Configured via
 * `SMTP_HOST/PORT/USER/PASS/FROM`. If SMTP isn't configured, `isConfigured()` is
 * false and `send` is a logged no-op — the receipt-email endpoint reports that
 * gracefully instead of erroring. `send` never throws.
 */
export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    const port = Number(config.get<string>('SMTP_PORT', '587'));
    this.from = config.get<string>('SMTP_FROM') || (user ? `SwiftHum <${user}>` : 'SwiftHum');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: { user, pass },
      });
    } else {
      this.transporter = null;
      this.logger.warn('SMTP not configured (SMTP_HOST/USER/PASS) — email sending disabled');
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Best-effort send. Returns true on success, false if unconfigured or it failed. */
  async send(args: SendArgs): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
      });
      this.logger.log(`sent "${args.subject}" → ${args.to}`);
      return true;
    } catch (err) {
      this.logger.warn(`send failed → ${args.to}: ${(err as Error).message}`);
      return false;
    }
  }
}
