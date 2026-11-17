import {join} from 'node:path';

import {LOCAL_ROOT, runImportPass} from './lib/convexClient';

await runImportPass({
  name: 'feedback',
  table: 'feedback',
  file: join(LOCAL_ROOT, 'normalized', 'feedback.jsonl'),
  batchSize: 300,
  functionName: 'migrate/import:importFeedback',
});
await runImportPass({
  name: 'anomalies',
  table: 'migrationAnomalies',
  file: join(LOCAL_ROOT, 'reports', 'anomalies.jsonl'),
  batchSize: 300,
  functionName: 'migrate/import:importAnomalies',
});
