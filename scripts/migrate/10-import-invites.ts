import {join} from 'node:path';

import {LOCAL_ROOT, runImportPass} from './lib/convexClient';

await runImportPass({
  name: 'legacy-invites',
  table: 'legacyInvites',
  file: join(LOCAL_ROOT, 'convex', 'legacyInvites.jsonl'),
  batchSize: 500,
  functionName: 'migrate/import:importLegacyInvites',
});
await runImportPass({
  name: 'invites',
  table: 'ledgerInvites',
  file: join(LOCAL_ROOT, 'convex', 'invites.jsonl'),
  batchSize: 300,
  functionName: 'migrate/import:importInvites',
});
