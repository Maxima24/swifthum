import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../lib/tg';
import { formatRuleSummary } from '../lib/format';
import { useCreateRule } from '../hooks/rules';
import { useMainButton } from '../hooks/useMainButton';
import { useBackButton } from '../hooks/useBackButton';
import type { Action, Asset, Operator, Rule } from '../types';
import { Header, Card, Button, Field, Input, Select } from '../ui';

const ASSETS: Asset[] = ['USDT', 'BTC', 'ETH'];
const OPERATORS: { value: Operator; label: string }[] = [
  { value: 'lt', label: 'drops below' },
  { value: 'gt', label: 'rises above' },
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'crosses_below', label: 'crosses below' },
];
const ACTIONS: { value: Action; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'alert', label: 'Alert only' },
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
      then: action === 'alert' ? { action } : { action, amountMinor, currency: 'NGN' },
      state: 'sleeping',
      createdAt: new Date().toISOString(),
      firedCount: 0,
    }),
    [name, asset, op, priceMinor, action, amountMinor],
  );

  const isValid =
    priceMinor > 0 && (action === 'alert' || amountMinor > 0) && !create.isPending;

  const save = useCallback(async () => {
    if (!isValid) return;
    haptic('success');
    await create.mutateAsync({ name: draft.name, when: draft.when, then: draft.then });
    navigate('/rules');
  }, [isValid, create, draft, navigate]);

  useMainButton({
    text: create.isPending ? 'Saving…' : 'Save rule',
    isEnabled: isValid,
    onClick: save,
  });

  const goBack = useCallback(() => navigate('/rules'), [navigate]);
  useBackButton(goBack);

  return (
    <>
      <Header back onBack={goBack} title="New rule" />

      <div className="flex flex-col gap-8 pt-5">
        <Field label="Name (optional)">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Buy USDT dip"
          />
        </Field>

        <div>
          <SectionTitle index="1" label="When this happens" />
          <Card className="flex flex-col gap-4">
            <Field label="Asset">
              <Select
                value={asset}
                onChange={setAsset}
                options={ASSETS.map((a) => ({ value: a, label: a }))}
              />
            </Field>
            <Field label="Condition">
              <Select value={op} onChange={setOp} options={OPERATORS} />
            </Field>
            <Field label="Threshold price (₦)">
              <Input
                type="number"
                inputMode="decimal"
                value={priceNgn}
                onChange={(e) => setPriceNgn(e.target.value)}
              />
            </Field>
          </Card>
        </div>

        <div>
          <SectionTitle index="2" label="Then do this" />
          <Card className="flex flex-col gap-4">
            <Field label="Action">
              <Select value={action} onChange={setAction} options={ACTIONS} />
            </Field>
            {action !== 'alert' && (
              <Field label="Amount (₦)">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={amountNgn}
                  onChange={(e) => setAmountNgn(e.target.value)}
                />
              </Field>
            )}
          </Card>
        </div>

        <div>
          <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            Preview
          </p>
          <Card>
            <p className="text-[15px] font-medium leading-snug text-text-primary">
              {formatRuleSummary(draft)}
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <Button size="lg" block disabled={!isValid} onClick={save}>
            {create.isPending ? 'Saving…' : 'Save rule'}
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              haptic('light');
              navigate('/rules');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}

function SectionTitle({ index, label }: { index: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 mb-3">
      <span className="w-6 h-6 rounded-lg bg-accent-soft text-accent text-[12px] font-bold flex items-center justify-center">
        {index}
      </span>
      <h2 className="text-[15px] font-bold tracking-[-0.01em] text-text-primary">
        {label}
      </h2>
    </div>
  );
}
