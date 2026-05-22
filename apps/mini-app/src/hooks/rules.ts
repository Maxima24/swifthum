import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Execution, Rule, RuleAction, RuleCondition } from '../types';

export interface NewRuleInput {
  name: string;
  when: RuleCondition;
  then: RuleAction;
}

export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: () => api<Rule[]>('/rules'),
  });
}

export function useRule(id: string | undefined) {
  return useQuery({
    queryKey: ['rules', id],
    queryFn: () => api<Rule>(`/rules/${id}`),
    enabled: !!id,
  });
}

export function useRuleExecutions(id: string | undefined) {
  return useQuery({
    queryKey: ['rules', id, 'executions'],
    queryFn: () => api<Execution[]>(`/rules/${id}/executions`),
    enabled: !!id,
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NewRuleInput) =>
      api<Rule>('/rules', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function usePauseRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Rule>(`/rules/${id}/pause`, { method: 'POST' }),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.setQueryData(['rules', rule.id], rule);
    },
  });
}

export function useResumeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Rule>(`/rules/${id}/resume`, { method: 'POST' }),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.setQueryData(['rules', rule.id], rule);
    },
  });
}
