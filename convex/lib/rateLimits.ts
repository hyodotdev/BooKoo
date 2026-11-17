import {
  DAY,
  HOUR,
  RateLimiter,
  type RunMutationCtx,
} from '@convex-dev/rate-limiter';

import {components} from '../_generated/api';
import {appError} from './errors';

const RATE_LIMITS = {
  subscriptionVerify: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 10,
  },
  subscriptionRefresh: {
    kind: 'token bucket',
    rate: 60,
    period: HOUR,
    capacity: 20,
  },
  otpRequestPerEmail: {
    kind: 'token bucket',
    rate: 5,
    period: HOUR,
    capacity: 5,
  },
  otpRequestGlobal: {
    kind: 'token bucket',
    rate: 500,
    period: HOUR,
    capacity: 500,
  },
  handleClaim: {kind: 'token bucket', rate: 5, period: DAY, capacity: 5},
  countryAnalyticsGrant: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 3,
  },
  handleRename: {kind: 'token bucket', rate: 3, period: DAY, capacity: 3},
  emailLinkRequest: {
    kind: 'token bucket',
    rate: 3,
    period: HOUR,
    capacity: 3,
  },
  emailLinkConfirm: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  accountLink: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  legacyClaim: {kind: 'token bucket', rate: 5, period: DAY, capacity: 5},
  deletionRequest: {
    kind: 'token bucket',
    rate: 3,
    period: DAY,
    capacity: 3,
  },
  inviteCreate: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  inviteCreateDaily: {kind: 'fixed window', rate: 40, period: DAY},
  inviteRedeem: {
    kind: 'token bucket',
    rate: 20,
    period: HOUR,
    capacity: 20,
  },
  joinRequestCreate: {
    kind: 'token bucket',
    rate: 5,
    period: HOUR,
    capacity: 5,
  },
  ledgerMemberChurn: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 30,
  },
  feedbackSend: {kind: 'fixed window', rate: 5, period: DAY},
  reportCreate: {kind: 'fixed window', rate: 10, period: DAY},
  dataExportRequest: {kind: 'fixed window', rate: 3, period: DAY},
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMITS);

export async function enforceRateLimit(
  ctx: RunMutationCtx,
  name: RateLimitName,
  key?: string,
): Promise<void> {
  const result = await rateLimiter.limit(ctx, name, {key});
  if (!result.ok)
    throw appError('RATE_LIMITED', 'error.rateLimited', {
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((result.retryAfter ?? 1000) / 1000),
      ),
    });
}
