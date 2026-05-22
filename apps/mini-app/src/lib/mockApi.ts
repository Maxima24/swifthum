import {
  initialMockExecutions,
  initialMockRules,
  mockPrices,
  mockSuggestions,
} from '../mocks/rules';
import type { Execution, Rule, RuleState } from '../types';

let rules: Rule[] = [...initialMockRules];
let executions: Execution[] = [...initialMockExecutions];

const delay = (ms = 200 + Math.random() * 200) => new Promise((r) => setTimeout(r, ms));

function nextId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function computeState(rule: Pick<Rule, 'when' | 'state'>): RuleState {
  if (rule.state === 'paused') return 'paused';
  const current = mockPrices[rule.when.asset];
  if (!current) return 'sleeping';
  const diffPct = Math.abs(current - rule.when.priceMinor) / rule.when.priceMinor;
  return diffPct <= 0.01 ? 'watching' : 'sleeping';
}

export async function mockApi<T>(path: string, init?: RequestInit): Promise<T> {
  await delay();
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : null;

  // /rules
  if (path === '/rules' && method === 'GET') return rules as T;
  if (path === '/rules' && method === 'POST') {
    const rule: Rule = {
      id: nextId('r'),
      name: body.name || `${body.then.action.toUpperCase()} ${body.when.asset}`,
      when: body.when,
      then: body.then,
      state: 'sleeping',
      createdAt: new Date().toISOString(),
      lastEvaluatedAt: new Date().toISOString(),
      firedCount: 0,
    };
    rule.state = computeState(rule);
    rules = [rule, ...rules];
    return rule as T;
  }

  // /rules/:id
  const idMatch = path.match(/^\/rules\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Mock 404: ${path}`);
    if (method === 'GET') return rules[idx] as T;
    if (method === 'PATCH') {
      rules[idx] = { ...rules[idx], ...body };
      rules[idx].state = computeState(rules[idx]);
      return rules[idx] as T;
    }
    if (method === 'DELETE') {
      rules.splice(idx, 1);
      executions = executions.filter((e) => e.ruleId !== id);
      return undefined as T;
    }
  }

  // /rules/:id/pause | resume
  const pauseMatch = path.match(/^\/rules\/([^/]+)\/(pause|resume)$/);
  if (pauseMatch && method === 'POST') {
    const [, id, action] = pauseMatch;
    const rule = rules.find((r) => r.id === id);
    if (!rule) throw new Error(`Mock 404: ${path}`);
    rule.state = action === 'pause' ? 'paused' : computeState({ ...rule, state: 'sleeping' });
    return rule as T;
  }

  // /rules/:id/executions
  const execMatch = path.match(/^\/rules\/([^/]+)\/executions$/);
  if (execMatch && method === 'GET') {
    const id = execMatch[1];
    return executions.filter((e) => e.ruleId === id) as T;
  }

  // /prices/current
  if (path.startsWith('/prices/current') && method === 'GET') {
    return mockPrices as T;
  }

  // /insights/suggested-rules
  if (path === '/insights/suggested-rules' && method === 'GET') {
    return mockSuggestions as T;
  }

  // /auth/telegram — accept anything in mocks
  if (path === '/auth/telegram' && method === 'POST') {
    return {
      sessionToken: 'mock_jwt_' + Date.now(),
      user: { id: 'u_demo', telegramId: 12345, displayName: 'Demo User' },
    } as T;
  }

  throw new Error(`Mock route not found: ${method} ${path}`);
}
