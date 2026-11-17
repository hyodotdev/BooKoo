import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

import {readSeedStatusWithRetry} from '../../scripts/perf/seedStatusRetry';

const QUERY_BUDGETS = {
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

type QueryName = keyof typeof QUERY_BUDGETS;

interface SeedStatus {
  readonly state: string;
  readonly processed: number;
  readonly items: number;
  readonly years: number;
  readonly members: number;
  readonly categories: number;
  readonly ledgerIds: readonly string[];
  readonly itemId: string | null;
  readonly anchorDayKey: number;
  readonly anchorMonthKey: number;
  readonly firstDayKey: number;
  readonly firstMonthKey: number;
}

interface BudgetMetric {
  readonly name: QueryName;
  readonly documentsRead: number;
  readonly bytesRead: number;
  readonly databaseQueries: number;
  readonly observedRows: number;
}

const deployment = process.env.CONVEX_BUDGET_DEPLOYMENT;
const budgetRequired = process.env.CONVEX_BUDGET_REQUIRED === '1';
const convexCli = resolve('node_modules/convex/bin/main.js');
const SEED_ABSOLUTE_TIMEOUT_MS = 50 * 60 * 1000;
const SEED_STALL_TIMEOUT_MS = 5 * 60 * 1000;

const readSeedStatus = async (): Promise<SeedStatus> =>
  readSeedStatusWithRetry(
    () => runConvex<SeedStatus>('seeds:status', {}),
    {
      onRetry: (attempt, maxAttempts) => {
        process.stdout.write(
          `transient seed status timeout; retry ${attempt}/${maxAttempts - 1}\n`,
        );
      },
    },
  );

const runConvex = <Result>(functionName: string, args: object): Result => {
  if (deployment === undefined)
    throw new Error('CONVEX_BUDGET_DEPLOYMENT is required');
  const deploymentArgs =
    deployment === 'current' ? [] : ['--deployment', deployment];
  const output = execFileSync(
    process.execPath,
    [
      convexCli,
      'run',
      functionName,
      JSON.stringify(args),
      ...deploymentArgs,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return JSON.parse(output) as Result;
};

const waitForFixture = async (): Promise<SeedStatus> => {
  const deadline = Date.now() + SEED_ABSOLUTE_TIMEOUT_MS;
  let status = await readSeedStatus();
  let lastProcessed = status.processed;
  let stallDeadline = Date.now() + SEED_STALL_TIMEOUT_MS;
  while (
    status.state !== 'DONE' &&
    Date.now() < deadline &&
    Date.now() < stallDeadline
  ) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    status = await readSeedStatus();
    if (status.processed > lastProcessed) {
      lastProcessed = status.processed;
      stallDeadline = Date.now() + SEED_STALL_TIMEOUT_MS;
    }
  }
  if (status.state !== 'DONE') {
    const reason =
      Date.now() >= stallDeadline ? 'stalled' : 'exceeded 50 minutes';
    throw new Error(
      `performance seed ${reason} at ${status.processed}/${status.items}`,
    );
  }
  return status;
};

describe('I3 transaction budget contract', () => {
  it('covers every frozen SCHEMA §4 I3 query', () => {
    expect(Object.keys(QUERY_BUDGETS)).toEqual([
      'ledgers.listMine',
      'ledgers.unseen',
      'rollups.daysInRange',
      'rollups.month',
      'items.listByDay',
      'ledgers.roster',
      'categories.list',
      'items.list',
      'items.searchMemo',
      'items.searchAmount',
      'rollups.categoriesOfMonth',
      'rollups.balanceBefore',
      'rollups.categoryTrend',
      'items.listByCategory',
      'items.get',
    ] satisfies readonly QueryName[]);
  });

  if (budgetRequired && deployment === undefined)
    it('requires an isolated deployment in the budget job', () => {
      throw new Error('CONVEX_BUDGET_DEPLOYMENT is required in budget CI');
    });
});

const integrationDescribe = deployment === undefined ? describe.skip : describe;

integrationDescribe('I3 real Convex transaction metrics', () => {
  jest.setTimeout(55 * 60 * 1000);

  let fixture: SeedStatus;

  beforeAll(async () => {
    fixture = await waitForFixture();
    expect(fixture).toMatchObject({
      state: 'DONE',
      processed: 100_000,
      items: 100_000,
      years: 10,
      members: 8,
      categories: 120,
    });
    expect(fixture.ledgerIds).toHaveLength(20);
    expect(fixture.itemId).not.toBeNull();
  });

  it.each(Object.entries(QUERY_BUDGETS) as [QueryName, number][])(
    '%s stays within %i document reads',
    (name, budget) => {
      if (fixture.itemId === null) throw new Error('Fixture item missing');
      const metric = runConvex<BudgetMetric>('budgets:measure', {
        name,
        ledgerId: fixture.ledgerIds[0],
        itemId: fixture.itemId,
        anchorDayKey: fixture.anchorDayKey,
        anchorMonthKey: fixture.anchorMonthKey,
        firstDayKey: fixture.firstDayKey,
        firstMonthKey: fixture.firstMonthKey,
      });
      process.stdout.write(
        `${name}: documents=${metric.documentsRead}/${budget}, ` +
          `bytes=${metric.bytesRead}, queries=${metric.databaseQueries}, ` +
          `rows=${metric.observedRows}\n`,
      );
      expect(metric.name).toBe(name);
      expect(metric.documentsRead).toBeLessThanOrEqual(budget);
    },
  );
});
