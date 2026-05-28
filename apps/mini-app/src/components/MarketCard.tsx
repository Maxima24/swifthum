import { motion } from 'framer-motion';
import { Icon } from './Icon';
import { Sparkline } from './Sparkline';
import { formatPriceMinor } from '../lib/format';
import type { Asset } from '../types';

interface Props {
  asset: Asset;
  priceMinor: number | undefined;
  /** Optional 24h series. When the backend exposes /prices/:asset?range=24h, pass it here. */
  data?: number[];
  index?: number;
}

export function MarketCard({ asset, priceMinor, data, index = 0 }: Props) {
  const hasSeries = !!data && data.length > 1;
  const delta = hasSeries ? data![data!.length - 1] - data![0] : 0;
  const deltaPct = hasSeries && data![0] !== 0 ? (delta / data![0]) * 100 : 0;
  const up = delta >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4 space-y-3 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
          {asset}
        </span>
        {hasSeries && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
              up ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
            }`}
          >
            <Icon name={up ? 'trending-up' : 'trending-down'} size={10} strokeWidth={2.5} />
            {up ? '+' : ''}
            {deltaPct.toFixed(2)}%
          </span>
        )}
      </div>

      <p className="text-xl font-semibold tabular-nums leading-none">
        {priceMinor ? formatPriceMinor(priceMinor) : '—'}
      </p>

      {hasSeries && (
        <div className="h-10 -mx-1">
          <Sparkline
            data={data!}
            strokeClassName={up ? 'stroke-emerald-500' : 'stroke-red-500'}
            fillClassName={up ? 'fill-emerald-500/12' : 'fill-red-500/12'}
          />
        </div>
      )}
    </motion.div>
  );
}
