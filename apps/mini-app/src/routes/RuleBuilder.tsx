import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { haptic } from '../lib/tg';
import { formatRuleSummary } from '../lib/format';
import { useCreateRule } from '../hooks/rules';
import { useMainButton } from '../hooks/useMainButton';
import { useBackButton } from '../hooks/useBackButton';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { toast } from '../lib/toast';
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
    try {
      const saved = await create.mutateAsync({
        name: draft.name,
        when: draft.when,
        then: draft.then,
      });
      toast.success('Rule saved', saved.name);
      navigate('/rules');
    } catch (e: any) {
      toast.error('Could not save rule', String(e?.message ?? e));
    }
  }, [isValid, create, draft, navigate]);

  useMainButton({
    text: create.isPending ? 'Saving…' : 'Save rule',
    isEnabled: isValid,
    onClick: save,
  });

  const goBack = useCallback(() => navigate('/rules'), [navigate]);
  useBackButton(goBack);

  return (
    <div className="flex flex-col pb-28 lg:pb-12">
      <Header back onBack={goBack} eyebrow="New rule" title="Build a rule" />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 pt-4 lg:gap-8 lg:pt-6">
        {/* Form — 3 cols on desktop */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          <Field label="Name (optional)">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Buy USDT dip"
              className="w-full rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button"
            />
          </Field>

          <Section label="WHEN" icon="trending-up" tone="amber">
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
                className="w-full rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button"
              />
            </Field>
          </Section>

          <Section label="THEN" icon="zap" tone="emerald">
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
                  className="w-full rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button"
                />
              </Field>
            )}
          </Section>
        </div>

        {/* Preview + Save — 2 cols on desktop, sticky */}
        <div className="lg:col-span-2 lg:sticky lg:top-24 flex flex-col gap-3 lg:self-start">
          <motion.div
            layout
            className="rounded-2xl bg-gradient-to-br from-brand-from/[0.08] to-brand-to/[0.08] ring-1 ring-brand-from/10 p-5"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Icon name="sparkles" size={12} className="text-violet-500" />
              <p className="text-[10px] text-tg-hint uppercase tracking-[0.12em] font-semibold">
                Preview
              </p>
            </div>
            <motion.p
              key={formatRuleSummary(draft)}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="text-sm leading-snug font-medium"
            >
              {formatRuleSummary(draft)}
            </motion.p>
          </motion.div>

          <button
            onClick={save}
            disabled={!isValid}
            className="w-full rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-white px-6 py-4 font-semibold shadow-lg shadow-brand-from/30 disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {create.isPending ? 'Saving…' : 'Save rule'}
          </button>

          <button
            onClick={() => {
              haptic('light');
              navigate('/rules');
            }}
            className="rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 py-3 font-medium active:scale-[0.98] transition-transform"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  icon,
  tone,
  children,
}: {
  label: string;
  icon: 'trending-up' | 'zap';
  tone: 'amber' | 'emerald';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon name={icon} size={14} />
        </div>
        <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
          {label}
        </h2>
      </div>
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
      className="w-full rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 px-4 py-3 outline-none focus:ring-2 focus:ring-tg-button appearance-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
