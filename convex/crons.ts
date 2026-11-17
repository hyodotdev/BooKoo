import {cronJobs} from 'convex/server';

import {internal} from './_generated/api';

/**
 * The implemented subset of SCHEMA §6.1. Every purge is inert until the
 * deployment sets its switch: TRASH_PURGE_MODE (`.notes/design/trash-purge.md`),
 * RETENTION_PURGE_MODE and UPLOAD_SWEEP_MODE
 * (`.notes/design/retention-purge.md`).
 */
const crons = cronJobs();

crons.daily(
  'purge soft-deleted',
  {hourUTC: 18, minuteUTC: 0},
  internal.maintenance.purge.purgeSoftDeleted,
  {},
);

crons.daily(
  'purge ledgers',
  {hourUTC: 19, minuteUTC: 0},
  internal.maintenance.purge.purgeDeletedLedgers,
  {},
);

crons.daily(
  'purge retention',
  {hourUTC: 22, minuteUTC: 0},
  internal.maintenance.retention.purgeRetention,
  {},
);

crons.interval(
  'sweep orphan uploads',
  {hours: 6},
  internal.maintenance.retention.sweepOrphanUploads,
  {},
);

export default crons;
