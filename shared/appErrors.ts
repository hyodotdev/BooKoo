/**
 * The one error vocabulary shared by Convex and the Expo client.
 *
 * Expected business states may still use a function-specific discriminated
 * return union. Anything thrown to a client uses this closed code set and an
 * `error.*` localization key; server-generated natural-language messages are
 * never part of the wire contract.
 */
export const APP_ERROR_CODES = [
  // Transport-independent function failures.
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_INPUT',
  'RATE_LIMITED',

  // Account and router gates.
  'ACCOUNT_DELETED',
  'ACCOUNT_SUSPENDED',
  'ONBOARDING_REQUIRED',
  'HANDLE_REQUIRED',
  'PROVIDER_VERIFICATION_FAILED',

  // Handle, provider-link and legacy-claim flows.
  'HANDLE_TAKEN',
  'HANDLE_INVALID',
  'HANDLE_RESERVED',
  'HANDLE_COOLDOWN',
  'LINK_CONFLICT',
  'LINK_AMBIGUOUS',
  'LINK_LAST_METHOD',
  'EMAIL_IN_USE',
  'LEGACY_NOT_FOUND',
  'LEGACY_AMBIGUOUS',
  'LEGACY_ALREADY_CLAIMED',

  // Ledger membership and administration.
  'LEDGER_NOT_FOUND',
  'LEDGER_FORBIDDEN',
  'LEDGER_ARCHIVED',
  'LEDGER_MAINTENANCE',
  'CANNOT_ACT_ON_PEER',
  'CANNOT_GRANT_ROLE',
  'ROLE_NOT_LINKABLE',
  'OWNER_MUST_TRANSFER',
  'MEMBER_LIMIT_REACHED',

  // Ledger contents and storage.
  'ITEM_NOT_FOUND',
  'ITEM_FORBIDDEN',
  'AMOUNT_INVALID',
  'CATEGORY_INVALID',
  'UPLOAD_INVALID',
  'PHOTO_LIMIT_REACHED',

  // Ledger subscription (docs/product/MONETIZATION.md).
  'PREMIUM_REQUIRED',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/**
 * Closed server-to-client message vocabulary. Client renderers map every one
 * of these values to a function containing a static `t('literal.key')` call;
 * they never pass a wire string directly into the i18n function.
 */
export const APP_ERROR_MESSAGE_KEYS = [
  'error.unauthorized',
  'error.forbidden',
  'error.notFound',
  'error.invalidInput',
  'error.rateLimited',
  'error.auth.google.noSub',
  'error.auth.apple.aud',
  'error.auth.apple.nonce',
  'error.auth.apple.noSub',
  'error.auth.apple.state',
  'error.auth.apple.parse',
  'error.auth.apple.notConfigured',
  'error.auth.kakao.aud',
  'error.auth.kakao.nonce',
  'error.auth.kakao.noSub',
  'error.auth.kakao.foreignToken',
  'error.auth.naver.profile',
  'error.auth.otp.delivery',
  'error.auth.otp.email',
  'error.auth.otp.mismatch',
  'error.auth.accountPurged',
  'error.account.deleted',
  'error.account.purged',
  'error.account.suspended',
  'error.onboardingRequired',
  'error.handle.required',
  'error.handle.TOO_SHORT',
  'error.handle.TOO_LONG',
  'error.handle.BAD_CHARSET',
  'error.handle.BAD_EDGE',
  'error.handle.DOUBLE_SEPARATOR',
  'error.handle.reserved',
  'error.handle.taken',
  'error.handle.cooldown',
  'error.handle.renameTooSoon',
  'error.handle.alreadySet',
  'error.handle.notSet',
  'error.link.duplicate',
  'error.link.bothHaveData',
  'error.link.unlinkFirst',
  'error.link.lastMethod',
  'error.email.invalid',
  'error.email.inUse',
  'error.legacy.notFound',
  'error.legacy.ambiguous',
  'error.legacy.alreadyClaimed',
  'error.legacy.notYours',
  'error.legacy.tooMany',
  'error.ledger.notFound',
  'error.ledger.forbidden',
  'error.ledger.archived',
  'error.ledger.maintenance',
  'error.ledger.cannotActOnPeer',
  'error.ledger.cannotGrantRole',
  'error.ledger.ownerMustTransfer',
  'error.ledger.memberLimit',
  'error.invite.roleNotLinkable',
  'error.item.notFound',
  'error.item.forbidden',
  'error.amountNotInteger',
  'error.amountZero',
  'error.amountTooLarge',
  'error.tooManyCategories',
  'error.categoryLabel',
  'error.categoryInvalid',
  'error.upload.invalid',
  'error.upload.tooLarge',
  'error.upload.unsupportedType',
  'error.upload.notOwned',
  'error.photo.limit',
  'error.premium.memberLimit',
  'error.premium.secondLedger',
] as const;

export type AppErrorMessageKey = (typeof APP_ERROR_MESSAGE_KEYS)[number];

/** Compile-time and runtime proof that a code cannot carry an unrelated key. */
export const APP_ERROR_MESSAGE_KEYS_BY_CODE = {
  UNAUTHENTICATED: ['error.unauthorized'],
  FORBIDDEN: [
    'error.forbidden',
    'error.handle.alreadySet',
    'error.handle.notSet',
    'error.legacy.notYours',
  ],
  NOT_FOUND: ['error.notFound'],
  INVALID_INPUT: [
    'error.invalidInput',
    'error.auth.otp.email',
    'error.auth.otp.mismatch',
    'error.email.invalid',
    'error.legacy.tooMany',
  ],
  RATE_LIMITED: ['error.rateLimited'],
  ACCOUNT_DELETED: [
    'error.auth.accountPurged',
    'error.account.deleted',
    'error.account.purged',
  ],
  ACCOUNT_SUSPENDED: ['error.account.suspended'],
  ONBOARDING_REQUIRED: ['error.onboardingRequired'],
  HANDLE_REQUIRED: ['error.handle.required'],
  PROVIDER_VERIFICATION_FAILED: [
    'error.auth.google.noSub',
    'error.auth.apple.aud',
    'error.auth.apple.nonce',
    'error.auth.apple.noSub',
    'error.auth.apple.state',
    'error.auth.apple.parse',
    'error.auth.apple.notConfigured',
    'error.auth.kakao.aud',
    'error.auth.kakao.nonce',
    'error.auth.kakao.noSub',
    'error.auth.kakao.foreignToken',
    'error.auth.naver.profile',
    'error.auth.otp.delivery',
  ],
  HANDLE_TAKEN: ['error.handle.taken'],
  HANDLE_INVALID: [
    'error.handle.TOO_SHORT',
    'error.handle.TOO_LONG',
    'error.handle.BAD_CHARSET',
    'error.handle.BAD_EDGE',
    'error.handle.DOUBLE_SEPARATOR',
  ],
  HANDLE_RESERVED: ['error.handle.reserved'],
  HANDLE_COOLDOWN: ['error.handle.cooldown', 'error.handle.renameTooSoon'],
  LINK_CONFLICT: ['error.link.bothHaveData', 'error.link.unlinkFirst'],
  LINK_AMBIGUOUS: ['error.link.duplicate'],
  LINK_LAST_METHOD: ['error.link.lastMethod'],
  EMAIL_IN_USE: ['error.email.inUse'],
  LEGACY_NOT_FOUND: ['error.legacy.notFound'],
  LEGACY_AMBIGUOUS: ['error.legacy.ambiguous'],
  LEGACY_ALREADY_CLAIMED: ['error.legacy.alreadyClaimed'],
  LEDGER_NOT_FOUND: ['error.ledger.notFound'],
  LEDGER_FORBIDDEN: ['error.ledger.forbidden'],
  LEDGER_ARCHIVED: ['error.ledger.archived'],
  LEDGER_MAINTENANCE: ['error.ledger.maintenance'],
  CANNOT_ACT_ON_PEER: ['error.ledger.cannotActOnPeer'],
  CANNOT_GRANT_ROLE: ['error.ledger.cannotGrantRole'],
  ROLE_NOT_LINKABLE: ['error.invite.roleNotLinkable'],
  OWNER_MUST_TRANSFER: ['error.ledger.ownerMustTransfer'],
  MEMBER_LIMIT_REACHED: ['error.ledger.memberLimit'],
  ITEM_NOT_FOUND: ['error.item.notFound'],
  ITEM_FORBIDDEN: ['error.item.forbidden'],
  AMOUNT_INVALID: [
    'error.amountNotInteger',
    'error.amountZero',
    'error.amountTooLarge',
  ],
  CATEGORY_INVALID: [
    'error.tooManyCategories',
    'error.categoryLabel',
    'error.categoryInvalid',
  ],
  UPLOAD_INVALID: [
    'error.upload.invalid',
    'error.upload.tooLarge',
    'error.upload.unsupportedType',
    'error.upload.notOwned',
  ],
  PHOTO_LIMIT_REACHED: ['error.photo.limit'],
  PREMIUM_REQUIRED: [
    'error.premium.memberLimit',
    'error.premium.secondLedger',
  ],
} as const satisfies Record<AppErrorCode, readonly AppErrorMessageKey[]>;

export type AppErrorParam = string | number;

export interface AppErrorPayload {
  readonly [key: string]:
    | AppErrorCode
    | AppErrorMessageKey
    | Readonly<Record<string, AppErrorParam>>
    | undefined;
  readonly code: AppErrorCode;
  /** Static `error.*` catalog key. The server never formats a sentence. */
  readonly messageKey: AppErrorMessageKey;
  /** Raw, non-sensitive formatting values only. */
  readonly params?: Readonly<Record<string, AppErrorParam>>;
}

const APP_ERROR_CODE_SET: ReadonlySet<string> = new Set(APP_ERROR_CODES);
const APP_ERROR_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(
  APP_ERROR_MESSAGE_KEYS,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isAppErrorCode = (value: unknown): value is AppErrorCode =>
  typeof value === 'string' && APP_ERROR_CODE_SET.has(value);

export const isAppErrorMessageKey = (
  value: unknown,
): value is AppErrorMessageKey =>
  typeof value === 'string' && APP_ERROR_MESSAGE_KEY_SET.has(value);

const isAppErrorParams = (
  value: unknown,
): value is Readonly<Record<string, AppErrorParam>> =>
  isRecord(value) &&
  Object.values(value).every(
    (param) =>
      typeof param === 'string' ||
      (typeof param === 'number' && Number.isFinite(param)),
  );

/** Validate the untrusted `ConvexError.data` wire payload before narrowing. */
export const isAppErrorPayload = (value: unknown): value is AppErrorPayload => {
  if (!isRecord(value)) return false;
  if (!isAppErrorCode(value.code)) return false;
  if (!isAppErrorMessageKey(value.messageKey)) return false;
  const allowedKeys: readonly AppErrorMessageKey[] =
    APP_ERROR_MESSAGE_KEYS_BY_CODE[value.code];
  if (!allowedKeys.includes(value.messageKey)) return false;

  return value.params === undefined || isAppErrorParams(value.params);
};

/**
 * ConvexError exposes its payload on `data`. This helper deliberately accepts
 * `unknown` so render and mutation code never casts an arbitrary exception.
 */
export const appErrorPayloadOf = (error: unknown): AppErrorPayload | null => {
  if (!isRecord(error) || !('data' in error)) return null;
  return isAppErrorPayload(error.data) ? error.data : null;
};
