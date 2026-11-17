export const TIER_2_QUERY_BUDGETS = {
  'ledgers.listMine': 60,
  'ledgers.unseen': 25,
  'rollups.daysInRange': 127,
  'rollups.month': 1,
  'items.listByDay': 31,
  'ledgers.roster': 32,
  'categories.list': 121,
  'items.list': 30,
  'items.searchMemo': 31,
  'items.searchAmount': 31,
  'rollups.categoriesOfMonth': 120,
  'rollups.balanceBefore': 120,
  'rollups.categoryTrend': 12,
  'items.listByCategory': 30,
  'items.get': 2,
} as const;

export type HealthConflictReview = 'NONE' | 'SUSTAINED' | 'NOT_REVIEWED';
export type LatencyReview = 'STABLE' | 'REGRESSION' | 'NOT_REVIEWED';
export type LoadDecision = 'PASS' | 'FAIL' | 'INCOMPLETE';

export interface LoadSample {
  readonly durationMs: number;
  readonly errorKind?: string;
}

export interface LoadSummary {
  readonly writes: number;
  readonly successes: number;
  readonly errors: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly errorKinds: Readonly<Record<string, number>>;
}

const rounded = (value: number): number => Math.round(value * 100) / 100;

export const percentile = (
  values: readonly number[],
  quantile: number,
): number => {
  if (values.length === 0) return 0;
  if (!Number.isFinite(quantile) || quantile < 0 || quantile > 1)
    throw new Error('quantile must be between 0 and 1');
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return rounded(sorted[index]);
};

export const classifyLoadError = (value: unknown): string => {
  const message = value instanceof Error ? value.message : String(value);
  const normalized = message.toLowerCase();
  if (
    normalized.includes('write conflict') ||
    normalized.includes('optimistic concurrency')
  )
    return 'write-conflict';
  if (normalized.includes('rate limit') || normalized.includes('too many'))
    return 'rate-limit';
  if (normalized.includes('timeout') || normalized.includes('timed out'))
    return 'timeout';
  if (
    normalized.includes('network') ||
    normalized.includes('fetch failed') ||
    normalized.includes('econn')
  )
    return 'network';
  return 'other';
};

export const summarizeLoad = (samples: readonly LoadSample[]): LoadSummary => {
  const successes = samples.filter((sample) => sample.errorKind === undefined);
  const errorKinds: Record<string, number> = {};
  for (const sample of samples) {
    if (sample.errorKind === undefined) continue;
    errorKinds[sample.errorKind] = (errorKinds[sample.errorKind] ?? 0) + 1;
  }
  const durations = successes.map((sample) => sample.durationMs);
  return {
    writes: samples.length,
    successes: successes.length,
    errors: samples.length - successes.length,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    errorKinds,
  };
};

export const decideLoadResult = (
  summary: LoadSummary,
  healthReview: HealthConflictReview,
  latencyReview: LatencyReview,
): LoadDecision => {
  if (
    summary.errors > 0 ||
    healthReview === 'SUSTAINED' ||
    latencyReview === 'REGRESSION'
  )
    return 'FAIL';
  if (healthReview === 'NONE' && latencyReview === 'STABLE') return 'PASS';
  return 'INCOMPLETE';
};
