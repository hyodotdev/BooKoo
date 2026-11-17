import {join} from 'node:path';

import {LOCAL_ROOT, runImportPass} from './lib/convexClient';

await runImportPass({
  name: 'comments',
  table: 'itemComments',
  file: join(LOCAL_ROOT, 'convex', 'comments.jsonl'),
  batchSize: 500,
  functionName: 'migrate/import:importComments',
});
await runImportPass({
  name: 'photos',
  table: 'itemPhotos',
  file: join(LOCAL_ROOT, 'convex', 'photos.jsonl'),
  batchSize: 500,
  functionName: 'migrate/import:importPhotos',
});
