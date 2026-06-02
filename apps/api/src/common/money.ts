/**
 * Money is stored as BIGINT minor units (kobo for NGN). Never floats.
 * Helpers here are for serializing bigint → number for JSON responses (frontend
 * receives `amountMinor: number`, since JS numbers safely hold integers up to 2^53).
 */

export function bigintToNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`bigint ${value} exceeds safe number range`);
  }
  return Number(value);
}

export function numberToBigint(value: number): bigint {
  if (!Number.isInteger(value)) throw new TypeError(`expected integer, got ${value}`);
  return BigInt(value);
}

/**
 * Recursively walks an object replacing bigint values with numbers. Used by the
 * global serialization interceptor so controllers can return Prisma rows directly.
 */
export function serializeBigints<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'bigint') return bigintToNumber(input) as unknown as T;
  if (Array.isArray(input)) return input.map(serializeBigints) as unknown as T;
  if (input instanceof Date) return input;
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = serializeBigints(v);
    return out as T;
  }
  return input;
}
