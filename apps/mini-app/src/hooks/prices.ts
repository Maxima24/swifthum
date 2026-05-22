import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PriceMap } from '../types';

export function usePrices() {
  return useQuery({
    queryKey: ['prices', 'current'],
    queryFn: () => api<PriceMap>('/prices/current'),
    refetchInterval: 10_000,
  });
}
