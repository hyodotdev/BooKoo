import {
  classifyLoadError,
  decideLoadResult,
  percentile,
  summarizeLoad,
  TIER_2_QUERY_BUDGETS,
} from '../../scripts/perf/loadMetrics';

describe('Tier-3 load metrics', () => {
  it('uses nearest-rank percentiles without mutating input', () => {
    const values = [40, 10, 30, 20];
    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 0.95)).toBe(40);
    expect(values).toEqual([40, 10, 30, 20]);
  });

  it('summarizes successful latencies and redacted error classes', () => {
    expect(
      summarizeLoad([
        {durationMs: 10},
        {durationMs: 20},
        {durationMs: 30, errorKind: 'timeout'},
        {durationMs: 40, errorKind: 'timeout'},
      ]),
    ).toEqual({
      writes: 4,
      successes: 2,
      errors: 2,
      p50Ms: 10,
      p95Ms: 20,
      p99Ms: 20,
      errorKinds: {timeout: 2},
    });
  });

  it('never returns raw error text', () => {
    expect(classifyLoadError(new Error('write conflict for secret row'))).toBe(
      'write-conflict',
    );
    expect(classifyLoadError(new Error('email=user@example.com'))).toBe(
      'other',
    );
  });

  it('requires both dashboard reviews for a pass', () => {
    const summary = summarizeLoad([{durationMs: 12}]);
    expect(decideLoadResult(summary, 'NONE', 'STABLE')).toBe('PASS');
    expect(decideLoadResult(summary, 'NOT_REVIEWED', 'STABLE')).toBe(
      'INCOMPLETE',
    );
    expect(decideLoadResult(summary, 'SUSTAINED', 'STABLE')).toBe('FAIL');
    expect(
      decideLoadResult(
        summarizeLoad([{durationMs: 12, errorKind: 'network'}]),
        'NONE',
        'STABLE',
      ),
    ).toBe('FAIL');
  });

  it('copies every frozen Tier-2 document-read budget', () => {
    expect(TIER_2_QUERY_BUDGETS).toEqual({
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
    });
  });
});
