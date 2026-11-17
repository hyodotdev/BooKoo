import {v} from 'convex/values';

import {internalMutation} from '../lib/functions';
import {enforceRateLimit} from '../lib/rateLimits';

export const consumeOtpRequest = internalMutation({
  args: {email: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await enforceRateLimit(ctx, 'otpRequestGlobal');
    await enforceRateLimit(ctx, 'otpRequestPerEmail', args.email);
    return null;
  },
});
