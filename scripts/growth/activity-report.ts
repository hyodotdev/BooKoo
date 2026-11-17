import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';

import {
  buildActivityQuery,
  validateInternalAccountPolicy,
} from './activity-query';

const args = process.argv.slice(2);
const allowed = new Set(['--run', '--prod', '--policy', '--out', '--sharing']);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`Missing ${name} value`);
  return value;
}
function main(): void {
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error('Unknown report option');
    if (flag === '--policy' || flag === '--out') index++;
  }
  // One private policy survives worktree changes/removal and never enters Git
  // objects or an EAS archive. All worktrees resolve this same common Git dir.
  const git = spawnSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    {encoding: 'utf8', timeout: 5000},
  );
  if (git.status !== 0) throw new Error('Missing repository configuration');
  const privateRoot = join(git.stdout.trim(), 'bookoo-growth');
  const policy = validateInternalAccountPolicy(
    JSON.parse(
      readFileSync(
        resolve(
          option('--policy') ?? join(privateRoot, 'internal-accounts.json'),
        ),
        'utf8',
      ),
    ),
  );
  const query = buildActivityQuery(
    policy,
    Date.now(),
    args.includes('--sharing'),
  );
  if (!args.includes('--run')) {
    process.stdout.write(
      'DRY RUN: read-only presence/profile aggregate; internal accounts excluded; no rows, identities, tracking, deployment or writes. Use --run --prod --out <report.json>.\n',
    );
    return;
  }
  if (!args.includes('--prod'))
    throw new Error(
      'Select the approved production project explicitly with --prod',
    );
  const output = option('--out');
  if (!output) throw new Error('--out is required for the aggregate report');
  // Worktrees need not carry .env.local. Keep only this project's selector in
  // the private run configuration, never copied credentials or backend rows.
  const deployment = parse(
    readFileSync(join(privateRoot, 'deployment.env')),
  ).CONVEX_DEPLOYMENT;
  if (
    !deployment ||
    !/^(dev|prod):[a-z0-9-]+$/.test(deployment) ||
    (process.env.CONVEX_DEPLOYMENT !== undefined &&
      process.env.CONVEX_DEPLOYMENT !== deployment)
  )
    throw new Error(
      'Select the approved project in private bookoo-growth/deployment.env',
    );
  const result = spawnSync(
    process.execPath,
    [
      resolve('node_modules/convex/bin/main.js'),
      'run',
      '--prod',
      '--inline-query',
      query,
      '--codegen',
      'disable',
      '--typecheck',
      'disable',
    ],
    {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 512 * 1024,
      env: {
        ...process.env,
        CONVEX_DEPLOYMENT: deployment,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    },
  );
  // Never forward CLI errors: source excerpts can contain the private policy.
  if (result.status !== 0)
    throw new Error(
      'Read-only aggregate query failed; no complete report was produced',
    );
  const report: unknown = JSON.parse(result.stdout);
  if (
    typeof report !== 'object' ||
    report === null ||
    !('complete' in report) ||
    report.complete !== true ||
    !('externalActiveAccounts' in report)
  )
    throw new Error('Incomplete aggregate report rejected');
  const serialized = JSON.stringify(report, null, 2) + '\n';
  writeFileSync(resolve(output), serialized, {mode: 0o600});
  process.stdout.write(serialized);
}
try {
  main();
} catch (error) {
  // File/JSON errors can contain private paths or malformed policy contents.
  process.stderr.write(
    error instanceof Error &&
      /^(Missing|Invalid policy|Use exact|Refusing|A reviewed|Policy approval|Unknown report|Select the approved|--out|Read-only aggregate|Incomplete aggregate)/.test(
        error.message,
      )
      ? error.message + '\n'
      : 'Activity report failed; verify private policy and CLI authentication\n',
  );
  process.exitCode = 1;
}
