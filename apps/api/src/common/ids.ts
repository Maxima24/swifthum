import { createId } from '@paralleldrive/cuid2';

export type IdPrefix = 'u' | 'r' | 'e' | 'i' | 'tx' | 'ps' | 'sa' | 'sh' | 'so';

export function prefixedId(prefix: IdPrefix): string {
  return `${prefix}_${createId()}`;
}
