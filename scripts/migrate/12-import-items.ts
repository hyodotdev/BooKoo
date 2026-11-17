import {join} from 'node:path';

import {LOCAL_ROOT, runImportPass} from './lib/convexClient';

await runImportPass({
  name: 'items',
  table: 'ledgerItems',
  file: join(LOCAL_ROOT, 'convex', 'items.jsonl'),
  batchSize: 300,
  functionName: 'migrate/import:importItems',
});
