import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Suggestion } from '../mocks/rules';

export function useSuggestedRules() {
  return useQuery({
    queryKey: ['insights', 'suggested-rules'],
    queryFn: () => api<Suggestion[]>('/insights/suggested-rules'),
  });
}
