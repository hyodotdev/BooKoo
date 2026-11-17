import {defineApp} from 'convex/server';
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import workpool from '@convex-dev/workpool/convex.config.js';

const app = defineApp();

/**
 * Auth writes, invite create/redeem, join requests, membership churn, feedback, and content reports.
 * `09` §4.3: FightingHows has NO rate limiting outside the auth tables. Handle availability remains
 * an unlimited query because queries cannot update a counter; the claim/rename writes are limited.
 */
app.use(rateLimiter);

/**
 * Bounded-concurrency Firebase Storage -> Convex _storage blob copy, for BOTH item photos and
 * profile avatars. A serial self-rescheduling chain at ~500 ms/blob is ~14 h for 100k photos;
 * a workpool at maxParallelism 20 is ~45 min, and it is the documented remedy for the OCC storm a
 * naive fan-out would cause (`13` §8.3).
 */
app.use(workpool, {name: 'blobImport'});

export default app;
