export const DEVELOPMENT_FIXED_OTP_CODE = '68686868';
export const FIXED_OTP_COLLISION_LIMIT = 64;

interface FixedOtpEnvironment {
  readonly appReviewCode?: string;
  readonly appReviewEmails?: string;
  readonly environment?: string;
}

function emailList(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function selectFixedOtpCode(
  email: string,
  environment: FixedOtpEnvironment,
): string | undefined {
  const normalized = email.toLowerCase();
  if (emailList(environment.appReviewEmails).has(normalized)) {
    const code = environment.appReviewCode?.trim();
    return code && /^\d{8}$/.test(code) ? code : undefined;
  }
  if (environment.environment === 'development')
    return DEVELOPMENT_FIXED_OTP_CODE;
  return undefined;
}

/**
 * Convex Auth resolves verification codes through a globally unique code-hash
 * lookup. A shared development/reviewer code therefore cannot have two live
 * rows at once. The newest request wins and invalidates older rows that use the
 * same fixed code; unrelated random OTP rows remain untouched.
 */
export function selectFixedOtpCollisionIds<T extends string>(
  rows: readonly {readonly _id: T}[],
  currentRowId: T,
): T[] {
  return rows.filter((row) => row._id !== currentRowId).map((row) => row._id);
}
