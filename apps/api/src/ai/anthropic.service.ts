import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Asset } from '../common/assets';
import {
  DIGEST_SUMMARY_SYSTEM_PROMPT,
  FRAUD_SCORE_SYSTEM_PROMPT,
  PARSE_PAYMENT_SYSTEM_PROMPT,
  SUGGEST_RULES_SYSTEM_PROMPT,
} from './prompts';

export interface SuggestedRule {
  name: string;
  when: {
    asset: Asset;
    op: 'lt' | 'gt' | 'crosses_above' | 'crosses_below';
    priceMinor: number;
  };
  then: {
    action: 'buy' | 'sell' | 'alert';
    amountMinor?: number;
    currency?: 'NGN';
  };
  reason: string;
}

export interface PriceSnapshotInput {
  asset: Asset;
  priceMinor: number;
  takenAt: string;
}

export interface UserRuleInput {
  whenAsset: string;
  whenOp: string;
  whenPriceMinor: number;
}

const SUGGEST_RULES_TIMEOUT_MS = 3000;
const PARSE_PAYMENT_TIMEOUT_MS = 3000;
const FRAUD_SCORE_TIMEOUT_MS = 3000;
const DIGEST_SUMMARY_TIMEOUT_MS = 3000;
const PARSE_PAYMENT_AMOUNT_MAX_KOBO = 10_000_000; // ₦100,000 — anything larger is treated as a parse error
const FRAUD_SCORE_FALLBACK = 0.1; // matches the PaymentIntent.riskScore column default

export interface ParsePaymentResult {
  intent: 'send' | null;
  amountMinor: number | null;
  currency: 'NGN' | null;
  recipient: string | null;
  confidence: number;
  explanation: string | null;
}

export interface FraudScoreInput {
  amountMinor: number;
  walletBalanceMinor: number;
  weeklySentMinor: number;
  weeklySentCount: number;
}

export interface FraudScoreResult {
  score: number;
  reasoning: string;
}

export interface DigestSummaryInput {
  userName: string;
  rulesFired: number;
  transactions: number;
  netSentMinor: number;
  netReceivedMinor: number;
  topAsset?: string | null;
}

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger('Anthropic');
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.model = config.get<string>('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY not set — all AI calls will fall back to static results');
    }
  }

  /**
   * Returns 3-5 suggested rules for the dashboard. Uses prompt caching on the
   * system block so subsequent calls only pay for the user-message tokens.
   * On any failure (no key, timeout, parse error, network), returns the static
   * fallback list — the frontend treats either as success.
   */
  async suggestRules(args: {
    recentPrices: PriceSnapshotInput[];
    userRules: UserRuleInput[];
  }): Promise<SuggestedRule[]> {
    if (!this.client) return this.fallbackSuggestions();

    try {
      const userPrompt = JSON.stringify(args);
      const res = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 1024,
          system: [
            {
              type: 'text',
              text: SUGGEST_RULES_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userPrompt }],
        },
        { timeout: SUGGEST_RULES_TIMEOUT_MS },
      );

      const textBlock = res.content.find((b) => b.type === 'text');
      const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
      const parsed = this.parseSuggestionsJson(raw);
      if (!parsed || parsed.length === 0) return this.fallbackSuggestions();
      return parsed.slice(0, 5);
    } catch (err) {
      this.logger.warn(`suggestRules failed (${(err as Error).message}); using fallback`);
      return this.fallbackSuggestions();
    }
  }

  /**
   * Parse a free-text payment intent like "Abeg send Bayo 5k". Mirrors `suggestRules`:
   * prompt-cached system block, 3s timeout, static fallback so callers never see throws.
   * Returns {intent:null} on any failure — the bot turns that into a polite "I didn't
   * catch that" message. Recipient is display-only (not bound to any user record).
   */
  async parsePayment(text: string): Promise<ParsePaymentResult> {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return this.fallbackParse('empty');
    if (!this.client) return this.fallbackParse('no_api_key');

    try {
      const res = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 256,
          system: [
            {
              type: 'text',
              text: PARSE_PAYMENT_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: trimmed }],
        },
        { timeout: PARSE_PAYMENT_TIMEOUT_MS },
      );

      const textBlock = res.content.find((b) => b.type === 'text');
      const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
      const parsed = this.parsePaymentJson(raw);
      return parsed ?? this.fallbackParse('bad_json');
    } catch (err) {
      this.logger.warn(`parsePayment failed (${(err as Error).message}); using fallback`);
      return this.fallbackParse('timeout_or_error');
    }
  }

  /**
   * Score the fraud risk of an outgoing payment (0..1). Mirrors the other AI
   * methods: prompt-cached system block, short timeout, and a safe fallback to
   * {@link FRAUD_SCORE_FALLBACK} on no-key / timeout / bad JSON. The score is
   * informational (stored on PaymentIntent.riskScore, surfaced to the Mini App),
   * so a fallback never blocks a payment.
   */
  async scoreFraud(args: FraudScoreInput): Promise<FraudScoreResult> {
    if (!this.client) return { score: FRAUD_SCORE_FALLBACK, reasoning: 'no_api_key' };

    try {
      const res = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 128,
          system: [
            {
              type: 'text',
              text: FRAUD_SCORE_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: JSON.stringify(args) }],
        },
        { timeout: FRAUD_SCORE_TIMEOUT_MS },
      );

      const textBlock = res.content.find((b) => b.type === 'text');
      const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
      const parsed = this.parseFraudScoreJson(raw);
      return parsed ?? { score: FRAUD_SCORE_FALLBACK, reasoning: 'bad_json' };
    } catch (err) {
      this.logger.warn(`scoreFraud failed (${(err as Error).message}); using fallback`);
      return { score: FRAUD_SCORE_FALLBACK, reasoning: 'timeout_or_error' };
    }
  }

  /**
   * One-sentence weekly insight for the digest DM. Returns '' on any failure so
   * the worker can fall back to a static summary line.
   */
  async digestSummary(args: DigestSummaryInput): Promise<string> {
    if (!this.client) return '';

    try {
      const res = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 80,
          system: [
            {
              type: 'text',
              text: DIGEST_SUMMARY_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: JSON.stringify(args) }],
        },
        { timeout: DIGEST_SUMMARY_TIMEOUT_MS },
      );

      const textBlock = res.content.find((b) => b.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : '';
      return text.trim().slice(0, 200);
    } catch (err) {
      this.logger.warn(`digestSummary failed (${(err as Error).message})`);
      return '';
    }
  }

  private parseFraudScoreJson(text: string): FraudScoreResult | null {
    if (!text) return null;
    const stripped = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    try {
      const parsed = JSON.parse(stripped) as Record<string, unknown>;
      if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) return null;
      const score = Math.max(0, Math.min(1, parsed.score));
      const reasoning =
        typeof parsed.reasoning === 'string' ? parsed.reasoning.trim().slice(0, 120) : '';
      return { score, reasoning };
    } catch {
      return null;
    }
  }

  private parsePaymentJson(text: string): ParsePaymentResult | null {
    if (!text) return null;
    const stripped = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    try {
      const parsed = JSON.parse(stripped) as Record<string, unknown>;
      return this.normalizeParseResult(parsed);
    } catch {
      return null;
    }
  }

  private normalizeParseResult(raw: Record<string, unknown>): ParsePaymentResult | null {
    if (!raw || typeof raw !== 'object') return null;
    const intent = raw.intent === 'send' ? 'send' : null;
    const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0;
    const recipient = typeof raw.recipient === 'string' && raw.recipient.trim().length > 0 ? raw.recipient.trim().slice(0, 60) : null;
    const explanation = typeof raw.explanation === 'string' && raw.explanation.trim().length > 0 ? raw.explanation.trim().slice(0, 200) : null;

    let amountMinor: number | null = null;
    if (intent === 'send' && typeof raw.amountMinor === 'number' && Number.isFinite(raw.amountMinor)) {
      const candidate = Math.round(raw.amountMinor);
      if (candidate > 0 && candidate <= PARSE_PAYMENT_AMOUNT_MAX_KOBO) {
        amountMinor = candidate;
      } else {
        // The model said "send" but proposed an out-of-bounds amount — treat as non-parse.
        return {
          intent: null,
          amountMinor: null,
          currency: null,
          recipient,
          confidence: Math.min(confidence, 0.3),
          explanation: candidate > PARSE_PAYMENT_AMOUNT_MAX_KOBO
            ? 'amount too large'
            : (explanation ?? 'amount invalid'),
        };
      }
    }

    const currency: 'NGN' | null = intent === 'send' && amountMinor !== null ? 'NGN' : null;
    return { intent, amountMinor, currency, recipient, confidence, explanation };
  }

  private fallbackParse(reason: string): ParsePaymentResult {
    return {
      intent: null,
      amountMinor: null,
      currency: null,
      recipient: null,
      confidence: 0,
      explanation: `couldn't parse (${reason})`,
    };
  }

  private parseSuggestionsJson(text: string): SuggestedRule[] | null {
    if (!text) return null;
    // Models occasionally wrap JSON in ```json fences; strip them defensively.
    const stripped = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    try {
      const parsed = JSON.parse(stripped);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter(this.isValidSuggestion);
    } catch {
      return null;
    }
  }

  private isValidSuggestion = (s: unknown): s is SuggestedRule => {
    if (!s || typeof s !== 'object') return false;
    const obj = s as Record<string, unknown>;
    const w = obj.when as Record<string, unknown> | undefined;
    const t = obj.then as Record<string, unknown> | undefined;
    if (!w || !t) return false;
    return (
      typeof obj.name === 'string' &&
      typeof obj.reason === 'string' &&
      typeof w.asset === 'string' &&
      typeof w.op === 'string' &&
      typeof w.priceMinor === 'number' &&
      typeof t.action === 'string'
    );
  };

  private fallbackSuggestions(): SuggestedRule[] {
    return [
      {
        name: 'Buy the dip — USDT under ₦1,600',
        when: { asset: 'USDT', op: 'lt', priceMinor: 1_600_00 },
        then: { action: 'buy', amountMinor: 5_000_00, currency: 'NGN' },
        reason: 'USDT often briefly dips below ₦1,600 — accumulate at the low.',
      },
      {
        name: 'Sell the peak — USDT above ₦1,700',
        when: { asset: 'USDT', op: 'gt', priceMinor: 1_700_00 },
        then: { action: 'sell', amountMinor: 10_000_00, currency: 'NGN' },
        reason: 'Lock in gains when USDT runs hot above ₦1,700.',
      },
      {
        name: 'Alert — BTC crosses ₦100M',
        when: { asset: 'BTC', op: 'crosses_above', priceMinor: 100_000_000_00 },
        then: { action: 'alert' },
        reason: 'Watch the psychological ₦100M level; useful for re-evaluating your stack.',
      },
    ];
  }
}
