import {join} from 'node:path';

import {LOCAL_ROOT, runImportPass} from './lib/convexClient';

const phaseIndex = process.argv.indexOf('--phase');
const phase = phaseIndex < 0 ? undefined : process.argv[phaseIndex + 1];
if (phase !== undefined && !['ledgers', 'members', 'requests'].includes(phase))
  throw new Error('invalid phase');

if (phase === undefined || phase === 'ledgers')
  await runImportPass({
    name: 'ledgers',
    table: 'ledgers',
    file: join(LOCAL_ROOT, 'convex', 'ledgers.jsonl'),
    batchSize: 200,
    functionName: 'migrate/import:importLedgers',
  });
if (phase === undefined || phase === 'members')
  await runImportPass({
    name: 'members',
    table: 'ledgerMembers',
    file: join(LOCAL_ROOT, 'convex', 'ledgerMembers.jsonl'),
    batchSize: 500,
    functionName: 'migrate/import:importMembers',
  });
if (phase === undefined || phase === 'requests')
  await runImportPass({
    name: 'requests',
    table: 'ledgerJoinRequests',
    file: join(LOCAL_ROOT, 'convex', 'joinRequests.jsonl'),
    batchSize: 500,
    functionName: 'migrate/import:importJoinRequests',
  });
