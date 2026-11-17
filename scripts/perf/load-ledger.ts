import {execFile, execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {promisify} from 'node:util';

import {
  classifyLoadError,
  decideLoadResult,
  type HealthConflictReview,
  type LatencyReview,
  type LoadSample,
  type LoadSummary,
  summarizeLoad,
  TIER_2_QUERY_BUDGETS,
} from './loadMetrics';
import {readSeedStatusWithRetry} from './seedStatusRetry';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const CONVEX_CLI = resolve(ROOT, 'node_modules/convex/bin/main.js');
const WRITERS = 8;
const SEED_ABSOLUTE_TIMEOUT_MS = 50 * 60 * 1000;
const SEED_STALL_TIMEOUT_MS = 5 * 60 * 1000;
const SEED = {
  items: 100_000,
  years: 10,
  members: WRITERS,
  categories: 120,
} as const;

interface SeedStatus {
  readonly state: string;
  readonly processed: number;
  readonly items: number;
  readonly years: number;
  readonly members: number;
  readonly categories: number;
  readonly deploymentName: string;
  readonly userIds: readonly string[];
  readonly ledgerIds: readonly string[];
  readonly categoryKeys: readonly string[];
}

interface Options {
  readonly run: boolean;
  readonly writesPerWriter: number;
  readonly reportPath?: string;
  readonly approver?: string;
  readonly healthReview: HealthConflictReview;
  readonly latencyReview: LatencyReview;
}

const usage = `BooKoo Tier-3 load test

Dry plan (default):
  bun scripts/perf/load-ledger.ts

Explicit isolated run:
  CONVEX_LOAD_DEPLOYMENT=<isolated-name> \\
  CONVEX_LOAD_CONFIRM_ISOLATED=1 \\
  CONVEX_LOAD_CONFIRM_SYNTHETIC=1 \\
  bun scripts/perf/load-ledger.ts --run [--writes-per-writer 100]

Anonymous local backend (inside \`convex dev --start\` only):
  CONVEX_AGENT_MODE=anonymous CONVEX_LOAD_DEPLOYMENT=current ...

Reviewed aggregate report:
  ... --report docs/perf/loadtest-YYYY-MM-DD.md \\
      --health-conflicts none|sustained \\
      --latency stable|regression --approver <name>

The driver never creates or deploys a Convex deployment. It accepts only an
existing isolated non-production deployment, seeds synthetic rows, and invokes
items.create as the eight synthetic members. Raw evidence stays under .local/.
`;

const argumentValue = (
  args: readonly string[],
  name: string,
): string | undefined => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--'))
    throw new Error(`${name} requires a value`);
  return value;
};

const parseReview = <Value extends string>(
  value: string | undefined,
  values: readonly Value[],
  fallback: Value,
  name: string,
): Value => {
  const normalized = value?.toUpperCase().replace('-', '_') as
    Value | undefined;
  if (normalized === undefined) return fallback;
  if (!values.includes(normalized))
    throw new Error(`${name} must be one of ${values.join(', ')}`);
  return normalized;
};

const parseOptions = (args: readonly string[]): Options => {
  if (args.includes('--help')) {
    process.stdout.write(usage);
    process.exit(0);
  }
  const writesValue = argumentValue(args, '--writes-per-writer') ?? '100';
  const writesPerWriter = Number(writesValue);
  if (
    !Number.isSafeInteger(writesPerWriter) ||
    writesPerWriter < 1 ||
    writesPerWriter > 10_000
  )
    throw new Error('--writes-per-writer must be an integer from 1 to 10000');
  return {
    run: args.includes('--run'),
    writesPerWriter,
    reportPath: argumentValue(args, '--report'),
    approver: argumentValue(args, '--approver'),
    healthReview: parseReview(
      argumentValue(args, '--health-conflicts'),
      ['NONE', 'SUSTAINED'] as const,
      'NOT_REVIEWED',
      '--health-conflicts',
    ),
    latencyReview: parseReview(
      argumentValue(args, '--latency'),
      ['STABLE', 'REGRESSION'] as const,
      'NOT_REVIEWED',
      '--latency',
    ),
  };
};

const runConvexSync = <Result>(
  deployment: string,
  functionName: string,
  args: object,
): Result => {
  const output = execFileSync(
    process.execPath,
    [
      CONVEX_CLI,
      'run',
      functionName,
      JSON.stringify(args),
      '--deployment',
      deployment,
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return JSON.parse(output) as Result;
};

const waitForSeed = async (deployment: string): Promise<SeedStatus> => {
  runConvexSync(deployment, 'seeds:seedLedger', SEED);
  const deadline = Date.now() + SEED_ABSOLUTE_TIMEOUT_MS;
  const readStatus = (): Promise<SeedStatus> =>
    readSeedStatusWithRetry(
      () => runConvexSync<SeedStatus>(deployment, 'seeds:status', {}),
      {
        onRetry: (attempt, maxAttempts) => {
          process.stdout.write(
            `transient seed status timeout; retry ${attempt}/${maxAttempts - 1}\n`,
          );
        },
      },
    );
  let status = await readStatus();
  let lastProcessed = status.processed;
  let stallDeadline = Date.now() + SEED_STALL_TIMEOUT_MS;
  while (
    status.state !== 'DONE' &&
    Date.now() < deadline &&
    Date.now() < stallDeadline
  ) {
    process.stdout.write(
      `seed progress: ${status.processed}/${status.items} synthetic items\n`,
    );
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    status = await readStatus();
    if (status.processed > lastProcessed) {
      lastProcessed = status.processed;
      stallDeadline = Date.now() + SEED_STALL_TIMEOUT_MS;
    }
  }
  if (status.state !== 'DONE') {
    const reason =
      Date.now() >= stallDeadline ? 'stalled' : 'exceeded 50 minutes';
    throw new Error(
      `synthetic seed ${reason} at ${status.processed}/${status.items}`,
    );
  }
  if (
    status.items !== SEED.items ||
    status.years !== SEED.years ||
    status.members !== SEED.members ||
    status.categories !== SEED.categories ||
    status.userIds.length !== WRITERS ||
    status.ledgerIds.length < 1 ||
    !status.categoryKeys.includes('meal')
  )
    throw new Error(
      'isolated seed does not match the frozen SCHEMA load target',
    );
  if (deployment !== 'current' && status.deploymentName !== deployment)
    throw new Error(
      'Convex CLI resolved a different deployment than requested',
    );
  return status;
};

const runWrite = async (
  deployment: string,
  ledgerId: string,
  userId: string,
  writerIndex: number,
  writeIndex: number,
): Promise<LoadSample> => {
  const startedAt = performance.now();
  try {
    await execFileAsync(
      process.execPath,
      [
        CONVEX_CLI,
        'run',
        'items/mutations:create',
        JSON.stringify({
          ledgerId,
          type: 'EXPENSE',
          amountMinor: 100 + ((writerIndex + writeIndex) % 9) * 100,
          currency: 'KRW',
          occurredAt: Date.now(),
          categoryKey: 'meal',
          memo: 'synthetic Tier-3 load write',
          clientRequestId: randomUUID(),
        }),
        '--deployment',
        deployment,
        '--identity',
        JSON.stringify({subject: userId}),
        '--typecheck',
        'disable',
        '--codegen',
        'disable',
      ],
      {cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 1024 * 1024},
    );
    return {durationMs: performance.now() - startedAt};
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      errorKind: classifyLoadError(error),
    };
  }
};

const runWorkload = async (
  deployment: string,
  fixture: SeedStatus,
  writesPerWriter: number,
): Promise<readonly LoadSample[]> => {
  const workers = fixture.userIds.map(async (userId, writerIndex) => {
    const samples: LoadSample[] = [];
    for (let writeIndex = 0; writeIndex < writesPerWriter; writeIndex += 1) {
      samples.push(
        await runWrite(
          deployment,
          fixture.ledgerIds[0],
          userId,
          writerIndex,
          writeIndex,
        ),
      );
    }
    return samples;
  });
  return (await Promise.all(workers)).flat();
};

const reportMarkdown = (input: {
  readonly commit: string;
  readonly appVersion: string;
  readonly convexVersion: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly writesPerWriter: number;
  readonly summary: LoadSummary;
  readonly healthReview: HealthConflictReview;
  readonly latencyReview: LatencyReview;
  readonly approver: string;
}): string => {
  const decision = decideLoadResult(
    input.summary,
    input.healthReview,
    input.latencyReview,
  );
  const budgetRows = Object.entries(TIER_2_QUERY_BUDGETS)
    .map(([name, budget]) => `| \`${name}\` | ${budget} |`)
    .join('\n');
  const errorKinds = Object.entries(input.summary.errorKinds)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(', ');
  return `# Tier-3 load test — ${input.finishedAt.slice(0, 10)}

## Run identity

- Git commit: \`${input.commit}\`
- App version: \`${input.appVersion}\`
- Convex package: \`${input.convexVersion}\`
- Environment: isolated non-production Convex deployment (identifier withheld)
- UTC window: ${input.startedAt} → ${input.finishedAt}
- Approver: ${input.approver}

## Frozen synthetic fixture

- 100,000 items across 10 years
- 8 concurrent writing members
- 120 categories
- 5,000 photos (deterministic 5% seed rate)
- \`ROLLUP_SHARD_COUNT = 1\`
- ${input.writesPerWriter} measured writes per writer

## Aggregate result

| Metric | Result |
| --- | ---: |
| Writes | ${input.summary.writes} |
| Successes | ${input.summary.successes} |
| Errors | ${input.summary.errors} |
| p50 | ${input.summary.p50Ms} ms |
| p95 | ${input.summary.p95Ms} ms |
| p99 | ${input.summary.p99Ms} ms |
| Error classes | ${errorKinds || 'none'} |

Convex Health write-conflict review: **${input.healthReview}**

Functions p95/p99 retry-regression review: **${input.latencyReview}**

SCHEMA §5.4 does not authorize a fabricated retry percentage. The pass threshold
is no sustained \`items.create\` write-conflict insight and no material p95/p99
regression attributable to retry during this exact window.

## Tier-2 document-read budgets

| Query | Maximum documents read |
| --- | ---: |
${budgetRows}

## Decision

**${decision}**
`;
};

const validateReportPath = (value: string, finishedAt: string): string => {
  const expected = `docs/perf/loadtest-${finishedAt.slice(0, 10)}.md`;
  if (value !== expected)
    throw new Error(`--report must be the current UTC path ${expected}`);
  return join(ROOT, value);
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  if (!options.run) {
    process.stdout.write(usage);
    process.stdout.write(
      `\nPlan: ${WRITERS} writers × ${options.writesPerWriter} writes against ` +
        'the frozen 100k/10y/120-category synthetic fixture. No network call made.\n',
    );
    return;
  }
  const deployment = process.env.CONVEX_LOAD_DEPLOYMENT;
  if (deployment === undefined || deployment.trim().length === 0)
    throw new Error(
      'CONVEX_LOAD_DEPLOYMENT must name an isolated non-production deployment',
    );
  if (process.env.CONVEX_LOAD_CONFIRM_SYNTHETIC !== '1')
    throw new Error(
      'CONVEX_LOAD_CONFIRM_SYNTHETIC=1 is required for write mode',
    );
  if (process.env.CONVEX_LOAD_CONFIRM_ISOLATED !== '1')
    throw new Error(
      'CONVEX_LOAD_CONFIRM_ISOLATED=1 is required for write mode',
    );
  if (deployment === 'prod' || deployment.startsWith('prod:'))
    throw new Error('Tier-3 load writes are forbidden on production');
  if (
    deployment === 'current' &&
    process.env.CONVEX_AGENT_MODE !== 'anonymous'
  )
    throw new Error(
      'The current alias is allowed only inside an anonymous local Convex backend',
    );
  if (options.reportPath !== undefined) {
    if (options.approver === undefined || options.approver.trim().length === 0)
      throw new Error('--approver is required with --report');
    if (
      options.healthReview === 'NOT_REVIEWED' ||
      options.latencyReview === 'NOT_REVIEWED'
    )
      throw new Error(
        'dashboard health and latency reviews are required with --report',
      );
  }

  const startedAt = new Date().toISOString();
  const fixture = await waitForSeed(deployment);
  process.stdout.write(
    'seed ready; starting eight concurrent synthetic writers\n',
  );
  const samples = await runWorkload(
    deployment,
    fixture,
    options.writesPerWriter,
  );
  const finishedAt = new Date().toISOString();
  const summary = summarizeLoad(samples);
  const decision = decideLoadResult(
    summary,
    options.healthReview,
    options.latencyReview,
  );
  const evidenceDir = join(ROOT, '.local', 'release-evidence', 'perf');
  mkdirSync(evidenceDir, {recursive: true});
  const evidencePath = join(
    evidenceDir,
    `loadtest-${finishedAt.replaceAll(':', '-').replaceAll('.', '-')}.json`,
  );
  writeFileSync(
    evidencePath,
    `${JSON.stringify(
      {
        startedAt,
        finishedAt,
        fixture: {...SEED, photos: 5_000, rollupShardCount: 1},
        writesPerWriter: options.writesPerWriter,
        summary,
        healthReview: options.healthReview,
        latencyReview: options.latencyReview,
        decision,
      },
      null,
      2,
    )}\n`,
  );

  if (options.reportPath !== undefined && options.approver !== undefined) {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8'),
    ) as {
      version: string;
      dependencies: {convex: string};
    };
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    const reportPath = validateReportPath(options.reportPath, finishedAt);
    mkdirSync(dirname(reportPath), {recursive: true});
    writeFileSync(
      reportPath,
      reportMarkdown({
        commit,
        appVersion: packageJson.version,
        convexVersion: packageJson.dependencies.convex,
        startedAt,
        finishedAt,
        writesPerWriter: options.writesPerWriter,
        summary,
        healthReview: options.healthReview,
        latencyReview: options.latencyReview,
        approver: options.approver.trim(),
      }),
    );
  }

  process.stdout.write(
    `Tier-3 aggregate: ${summary.successes}/${summary.writes} succeeded, ` +
      `p50=${summary.p50Ms}ms p95=${summary.p95Ms}ms p99=${summary.p99Ms}ms, ` +
      `decision=${decision}\n`,
  );
  process.stdout.write(
    'Raw aggregate saved under .local/release-evidence/perf/.\n',
  );
};

void main().catch((error: unknown) => {
  process.stderr.write(
    `Tier-3 load test failed: ${classifyLoadError(error)}. ` +
      'Review the local terminal details without committing identifiers.\n',
  );
  process.exitCode = 1;
});
