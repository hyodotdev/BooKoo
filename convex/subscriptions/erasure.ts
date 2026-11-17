import {v} from 'convex/values';
import {internal} from '../_generated/api';
import {internalAction} from '../_generated/server';
import {IAPKIT_ORIGIN, isObject} from '../lib/iapkit';

/** Only the due account-purge mutation schedules this server-owned user id. */
export const eraseUser = internalAction({
  args: {
    userId: v.id('users'),
    attempt: v.optional(v.number()),
    jobId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const key = process.env.IAPKIT_SECRET_KEY;
    const attempt = args.attempt ?? 0;
    let jobId = args.jobId;
    try {
      if (!key) throw new Error('IAPKit erasure is not configured');
      if (jobId && jobId.length > 256)
        throw new Error('IAPKit erasure job is invalid');
      const response = await fetch(
        `${IAPKIT_ORIGIN}/v2/subscriptions/user-erasure${
          jobId ? `/${encodeURIComponent(jobId)}` : ''
        }`,
        {
          method: jobId ? 'GET' : 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          ...(jobId ? {} : {body: JSON.stringify({userId: args.userId})}),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (response.status !== (jobId ? 200 : 202))
        throw new Error('IAPKit erasure was not accepted');
      const body: unknown = await response.json();
      if (
        !isObject(body) ||
        typeof body.jobId !== 'string' ||
        !body.jobId ||
        body.jobId.length > 256 ||
        (jobId ? body.jobId !== jobId : body.ok !== true) ||
        !['queued', 'running', 'completed'].includes(String(body.status))
      )
        throw new Error('IAPKit erasure status is invalid');
      jobId = body.jobId;
      if (body.status === 'completed') return null;
    } catch {
      // Keep an accepted job id across network failures instead of mistaking
      // HTTP202 for completed erasure or creating another job during a poll.
    }
    if (attempt >= 7)
      throw new Error('IAPKit user erasure requires operational retry');
    await ctx.scheduler.runAfter(
      Math.min(3600000, 60000 * 2 ** attempt),
      internal.subscriptions.erasure.eraseUser,
      {
        userId: args.userId,
        attempt: attempt + 1,
        ...(jobId ? {jobId} : {}),
      },
    );
    return null;
  },
});
