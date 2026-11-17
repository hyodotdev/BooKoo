import {v, type Infer} from 'convex/values';

import {EMAIL_OTP_PROVIDER_IDS} from '../../shared/authPolicy';

export {
  ITEM_PAGE_MORE,
  ITEM_PAGE_SIZE,
  MAX_LIVE_ITEM_PAGES,
  MAX_ITEM_PHOTOS,
} from '../../shared/ledgerLimits';

export const socialProviderValidator = v.union(
  v.literal('apple'),
  v.literal('google'),
  v.literal('kakao'),
  v.literal('naver'),
);
export type SocialProvider = Infer<typeof socialProviderValidator>;

export const SOCIAL_PROVIDERS = [
  'apple',
  'google',
  'kakao',
  'naver',
] as const satisfies readonly SocialProvider[];

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  kakao: 'Kakao',
  naver: 'Naver',
};

export {EMAIL_OTP_PROVIDER_IDS};

export const APPLE_CALLBACK_PATH = '/auth/apple/callback';

export const LINKED_ACCOUNT_SCAN_LIMIT = 20;
export const USER_EMAIL_LIMIT = 10;
export const HANDLE_SUGGESTION_PROBE_LIMIT = 12;
export const HANDLE_SUGGESTION_RESULT_LIMIT = 5;
export const HANDLE_HISTORY_LIMIT = 50;
export const APPLE_TOKEN_SCAN_LIMIT = 8;
export const LEGACY_CANDIDATE_LIMIT = 5;

export const ROLLUP_SHARD_COUNT = 1;

export const LEDGER_SCAN_LIMIT = 50;
export const LEDGER_PAGE_SIZE = 20;
export const MEMBER_SCAN_LIMIT = 200;
// Members start at 30 and continue at 50, matching the shared list convention.
export const MEMBER_PAGE_SIZE = 50;
export const MAX_CATEGORIES_PER_LEDGER = 120;
export const CATEGORY_SCAN_LIMIT = MAX_CATEGORIES_PER_LEDGER + 1;
/** Restorable trashed entries read before releasing an archived category. */
export const RESTORABLE_TRASH_SCAN_LIMIT = 200;
export const DAY_ROLLUP_RANGE_LIMIT = 126;
export const DAY_ROLLUP_SCAN_LIMIT =
  DAY_ROLLUP_RANGE_LIMIT * ROLLUP_SHARD_COUNT;
export const MONTH_ROLLUP_SCAN_LIMIT = 600;
export const CATEGORY_ROLLUP_SCAN_LIMIT = 200;
export const ROLLUP_MONTH_SCAN_BATCH = 500;
export const SEARCH_TAKE = 30;
export const SEARCH_SCAN_LIMIT = SEARCH_TAKE + 1;
export const UNSEEN_TARGET_LIMIT = 8;

export const PHOTO_GALLERY_PAGE_SIZE = 40;
// Read compatibility for entries saved before the five-photo upload limit.
export const ITEM_PHOTO_READ_LIMIT = 20;
export const PHOTO_ORIGINAL_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_THUMB_MAX_BYTES = 1024 * 1024;
export const COMMENT_PAGE_SIZE = 20;
export const COMMENT_BODY_MAX_LENGTH = 2_000;
export const ACTIVE_INVITES_PER_LEDGER = 20;
export const INVITE_PAGE_SIZE = 20;
export const INVITE_PAGE_SCAN_LIMIT = 100;
export const INVITE_REDEMPTION_SCAN_LIMIT = 200;
export const JOIN_REQUEST_PAGE_SIZE = 30;
export const AUDIT_PAGE_SIZE = 30;
export const NOTIFICATION_PAGE_SIZE = 20;
export const UNREAD_COUNT_LIMIT = 50;
export const APP_CONTENT_PAGE_SIZE = 50;
export const APP_CONTENT_PAGE_SCAN_LIMIT = 200;
export const FEEDBACK_HISTORY_LIMIT = 20;
export const REPORT_PAGE_SIZE = 30;
export const BLOCK_PAGE_SIZE = 30;
export const PUSH_DEVICE_LIMIT_PER_USER = 8;
export const PUSH_RECIPIENT_SCAN_LIMIT = MEMBER_SCAN_LIMIT;
export const PUSH_EXPO_BATCH_SIZE = 100;
export const ITEM_PUSH_COALESCE_MS = 10 * 60 * 1000;
export const PUSH_RECEIPT_DELAY_MS = 15 * 60 * 1000;
export const PUSH_RECEIPT_MAX_ATTEMPTS = 3;
export const DATA_EXPORT_HISTORY_PAGE_SIZE = 20;
export const DATA_EXPORT_FILE_PAGE_SIZE = 30;
export const DATA_EXPORT_CLEANUP_BATCH = 50;
export const DATA_EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DATA_EXPORT_FILE_MAX_BYTES = 18 * 1024 * 1024;

export const PERF_SEED_JOB_KEY = 'CI_BUDGET_SEED_V1';
export const PERF_SEED_LEDGER_PREFIX = '__bookoo_budget_ledger_';
export const PERF_SEED_DEFAULT_ITEMS = 100_000;
export const PERF_SEED_DEFAULT_YEARS = 10;
export const PERF_SEED_DEFAULT_MEMBERS = 8;
export const PERF_SEED_DEFAULT_CATEGORIES = 120;
export const PERF_SEED_LEDGER_COUNT = 20;
export const PERF_SEED_BATCH_SIZE = 100;

export const LAST_READ_THROTTLE_MS = 60_000;
/** Rows a purge transaction deletes (SCHEMA §5 `CASCADE_BATCH`). */
export const CASCADE_BATCH = 200;
/** Live entries carry rollup trigger writes, so the ledger cascade takes fewer. */
export const LEDGER_PURGE_ITEM_BATCH = 100;
/** Due ledgers the nightly ledger purge starts per run. */
export const PURGE_BATCH = 20;
/** Ledgers the nightly trash pass scans per transaction (≤ 25 × 201 item reads). */
export const TRASH_LEDGER_PAGE = 25;
/** A LEDGER_PURGE job not advanced for this long is resumed by the next run. */
export const LEDGER_PURGE_STALL_MS = 60 * 60 * 1000;
export const ITEM_PURGE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const CLIENT_RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LEDGER_PURGE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const AUDIT_FEED_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
/** `authAudit` and superseded `legalEvents` (owner decision, 2026-10-31). */
export const SECURITY_RECORD_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
/** Aged `legalEvents` the retention purge reviews per transaction (≤ 100 × 3 reads). */
export const LEGAL_EVENT_PAGE = 100;
/** A claimed upload still unattached after this is an orphan. */
export const UPLOAD_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
/** Unchecked uploads the orphan sweep reads per transaction (≤ 50 × 103 reads). */
export const UPLOAD_SWEEP_PAGE = 50;
/** Photos of one entry read to find a thumbnail's referrer; past it the upload is kept. */
export const UPLOAD_REFERRER_SCAN_LIMIT = 100;

export const CURRENT_ROLLUP_VERSION = 1;

export const HANDLE_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const HANDLE_RELEASE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
export const DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const RECENT_RENAME_BADGE_MS = 14 * 24 * 60 * 60 * 1000;
export const EMAIL_LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_LINK_MAX_ATTEMPTS = 5;

export const _assertGraceShorterThanRelease: true = (DELETION_GRACE_MS <
  HANDLE_RELEASE_COOLDOWN_MS) as true;

export function isSocialProvider(value: string): value is SocialProvider {
  return SOCIAL_PROVIDERS.some((provider) => provider === value);
}
