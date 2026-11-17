import {ConvexError} from 'convex/values';

import {
  APP_ERROR_MESSAGE_KEYS_BY_CODE,
  type AppErrorCode,
  type AppErrorMessageKey,
  type AppErrorParam,
  type AppErrorPayload,
} from '../../shared/appErrors';

export function appError(
  code: AppErrorCode,
  messageKey: AppErrorMessageKey,
  params?: Readonly<Record<string, AppErrorParam>>,
): ConvexError<AppErrorPayload> {
  const allowed: readonly AppErrorMessageKey[] =
    APP_ERROR_MESSAGE_KEYS_BY_CODE[code];
  if (!allowed.includes(messageKey))
    throw new Error(`Invalid message key ${messageKey} for ${code}`);
  return new ConvexError({
    code,
    messageKey,
    ...(params === undefined ? {} : {params}),
  });
}
