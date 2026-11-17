import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const convexCli = resolve('node_modules/convex/bin/main.js');
const successFile = process.env.CONVEX_BUDGET_SUCCESS_FILE;

if (successFile === undefined || successFile.length === 0)
  throw new Error('CONVEX_BUDGET_SUCCESS_FILE is required');

execFileSync(
  process.execPath,
  [convexCli, 'run', 'seeds:beginBudgetSeed', '{}'],
  {cwd: process.cwd(), env: process.env, stdio: 'inherit'},
);

execFileSync(
  'bun',
  ['run', 'test', '--runTestsByPath', 'test/perf/transactionBudgets.test.ts'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONVEX_BUDGET_DEPLOYMENT: 'current',
      CONVEX_BUDGET_REQUIRED: '1',
    },
    stdio: 'inherit',
  },
);

writeFileSync(successFile, 'passed\n', {encoding: 'utf8', mode: 0o600});
