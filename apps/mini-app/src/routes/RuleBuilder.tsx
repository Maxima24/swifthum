import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { haptic } from '../lib/tg';
import { formatRuleSummary } from '../lib/format';
import { useCreateRule } from '../hooks/rules';
import { useMainButton } from '../hooks/useMainButton';
import { useBackButton } from '../hooks/useBackButton';
import type { Action, Asset, Operator, Rule } from '../types';

const ASSETS: Asset[] = ['USDT', 'BTC', 'ETH'];
const OPERATORS: { value: Operator; label: string }[] = [
  { value: 'lt', label: 'drops below' },
  { value: 'gt', label: 'rises above' },
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'crosses_below', label: 'crosses below' },
];
const ACTIONS: { value: Action; label: string }[] = [
  { value: 'buy', label: 'BUY' },
  { value: 'sell', label: 'SELL' },
  { value: 'alert', label: 'ALERT only' },
];

export function RuleBuilder() {
  const navigate = useNavigate();
  const create = useCreateRule();
  const [name, setName] = useState('');
  const [asset, setAsset] = useState<Asset>('USDT');
  const [op, setOp] = useState<Operator>('lt');
  const [priceNgn, setPriceNgn] = useState<string>('1450');
  const [action, setAction] = useState<Action>('buy');
  const [amountNgn, setAmountNgn] = useState<string>('50000');

  const priceMinor = Math.round(parseFloat(priceNgn || '0') * 100);
  const amountMinor = Math.round(parseFloat(amountNgn || '0') * 100);

  const draft: Rule = useMemo(
    () => ({
      id: 'draft',
      name: name || `${action.toUpperCase()} ${asset}`,
      when: { asset, op, priceMinor },
      then:
        action === 'alert' ? { action } : { action, amountMinor, currency: 'NGN' },
      state: 'sleeping',
      createdAt: new Date().toISOString(),
      firedCount: 0,
    }),
    [name, asset, op, priceMinor, action, amountMinor],
  );

  const isValid = priceMinor > 0 && (action === 'alert' || amountMinor > 0) && !create.isPending;

  const save = useCallback(async () => {
    if (!isValid) return;
    haptic('success');
    await create.mutateAsync({
      name: draft.name,
      when: draft.when,
      then: draft.then,
    });
    navigate('/');
  }, [isValid, create, draft, navigate]);

  useMainButton({
    text: create.isPending ? 'Saving…' : 'Save rule',
    isEnabled: isValid,
    onClick: save,
  });

  useBackButton(useCallback(() => navigate(-1), [navigate]));

  return (
    <div className="flex flex-col gap-6 p-5 pt-10 pb-32">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <p className="text-tg-hint text-xs uppercase tracking-wider">New rule</p>
        <h1 className="text-2xl font-semibold">Build a rule</h1>
      </motion.header>

      <Field label="Name (optional)">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Buy USDT dip"
          className="w-full rounded-xl bg-tg-secondary-bg px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button"
        />
      </Field>

      <Section label="WHEN">
        <Field label="Asset">
          <Select
            value={asset}
            onChange={(v) => setAsset(v as Asset)}
            options={ASSETS.map((a) => ({ value: a, label: a }))}
          />
        </Field>
        <Field label="Condition">
          <Select value={op} onChange={(v) => setOp(v as Operator)} options={OPERATORS} />
        </Field>
        <Field label="Threshold price (₦)">
          <input
            type="number"
            inputMode="decimal"
            value={priceNgn}
            onChange={(e) => setPriceNgn(e.target.value)}
            className="w-full rounded-xl bg-tg-secondary-bg px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button"
          />
        </Field>
      </Section>

      <Section label="THEN">
        <Field label="Action">
          <Select value={action} onChange={(v) => setAction(v as Action)} options={ACTIONS} />
        </Field>
        {action !== 'alert' && (
          <Field label="Amount (₦)">
            <input
              type="number"
              inputMode="decimal"
              value={amountNgn}
              onChange={(e) => setAmountNgn(e.target.value)}
              className="w-full rounded-xl bg-tg-secondary-bg px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button"
            />
          </Field>
        )}
      </Section>

      <motion.div
        layout
        className="rounded-2xl bg-tg-secondary-bg p-4"
      >
        <p className="text-xs text-tg-hint uppercase tracking-wider mb-2">Preview</p>
        <motion.p
          key={formatRuleSummary(draft)}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-sm leading-snug"
        >
          {formatRuleSummary(draft)}
        </motion.p>
      </motion.div>

      {/* Fallback button for outside-Telegram dev */}
      <button
        onClick={save}
        disabled={!isValid}
        className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-tg-button text-tg-button-text px-10 py-4 font-medium shadow-lg shadow-black/10 active:scale-95 transition-transform disabled:opacity-40"
      >
        {create.isPending ? 'Saving…' : 'Save rule'}
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-tg-hint uppercase tracking-wider">{label}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-tg-hint">{label}</span>
      {children}
    </label>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-xl bg-tg-secondary-bg px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button appearance-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
