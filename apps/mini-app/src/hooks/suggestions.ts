import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Suggestion } from '../types';

export function useSuggestedRules() {
  return useQuery({
    queryKey: ['insights', 'suggested-rules'],
    queryFn: () => api<Suggestion[]>('/insights/suggested-rules'),
  });
}
