import {join} from 'node:path';

import {LOCAL_ROOT, runImportPass} from './lib/convexClient';

await runImportPass({
  name: 'categories',
  table: 'ledgerCategories',
  file: join(LOCAL_ROOT, 'convex', 'categories.jsonl'),
  batchSize: 300,
  functionName: 'migrate/import:importCategories',
});
