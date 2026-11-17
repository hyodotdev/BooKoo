import {join} from 'node:path';

import {LOCAL_ROOT, runImportPass} from './lib/convexClient';

await runImportPass({
  name: 'placeholders',
  table: 'userProfiles',
  file: join(LOCAL_ROOT, 'convex', 'placeholders.jsonl'),
  batchSize: 500,
  functionName: 'migrate/import:importPlaceholders',
});
