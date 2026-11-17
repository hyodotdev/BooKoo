/**
 * BooKooLegacy/STRINGS.js  →  assets/langs/{en,ko,ja,zh,id}.json (+ meta/*.json)
 *
 *   bun scripts/convert-legacy-strings.ts            # write the langs files
 *   bun scripts/convert-legacy-strings.ts --check    # verify, write nothing (CI)
 *   bun scripts/convert-legacy-strings.ts --content-out=.local/migration/content/legacyContent.json
 *
 * WRITES INTO `assets/`. That is deliberate and is the whole point of the
 * script — see `scripts/README.md`. Nothing else is touched.
 *
 * ---------------------------------------------------------------------------
 * Why this is a script and not a one-time hand edit
 * ---------------------------------------------------------------------------
 * The legacy string set is 87 KB / 5 locales / 263 flat SCREAMING_SNAKE keys
 * with no nesting and no interpolation, plus a set of known defects catalogued
 * in `.notes/research/04-legacy-content-i18n.md` §2 (a key present only in
 * `en`, four keys missing from `id`, three stray `id` keys, one key called from
 * code but defined in no locale, nine mistranslations). Hand-transcribing that
 * loses the audit trail. Here the whole transform is data:
 *
 *   KEY_MAP        legacy key → new nested key            (kept verbatim)
 *   DROPPED        legacy key → why it does not ship      (deliberate deletes)
 *   VALUE_OVERRIDE new key → corrected copy per locale    (curation, in code)
 *   NEW_STRINGS    new key → authored copy per locale     (the redesign's keys)
 *   NEW_PLURALS    new key → authored plural forms
 *
 * Re-running is idempotent: the emitted files are a pure function of the
 * legacy source plus these five tables. Curation lives in the tables, never in
 * the emitted JSON, so a re-run can never silently revert a fix.
 *
 * ---------------------------------------------------------------------------
 * Contracts the output has to satisfy
 * ---------------------------------------------------------------------------
 * - `assets/langs/ko.json` is the key SSOT (`.eslintrc.js` →
 *   `i18n-json/identical-keys`). Every locale carries an IDENTICAL key set,
 *   including the sub-keys of plural objects — `ko`/`ja`/`zh`/`id` have no
 *   grammatical plural, so they repeat the same text under `one` and `other`
 *   rather than omitting `one`. Omitting it would need an `ignoreKeys`
 *   exception in `.eslintrc.js`; repeating it needs nothing and is checked by
 *   the same rule that checks everything else.
 * - Keys are sorted with plain `Array.prototype.sort()` — UTF-16 code-unit
 *   order — because that is literally what `i18n-json/sorted-keys` uses
 *   (`node_modules/eslint-plugin-i18n-json/src/util/key-traversals.js`).
 *   `localeCompare` would disagree on e.g. `addOrUpdate` vs `added`.
 * - No key may contain a hyphen (`custom-syntax-validator.ts`). Leaves are
 *   camelCase, namespaces are two levels deep, per
 *   `.notes/design/money-categories-i18n.md` §3.2.
 * - Interpolation is i18n-js's `{{name}}`.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/* -------------------------------------------------------------------------- */
/* Paths + locales                                                            */
/* -------------------------------------------------------------------------- */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_STRINGS = join(ROOT, 'BooKooLegacy', 'STRINGS.js');
const LANGS_DIR = join(ROOT, 'assets', 'langs');
const META_DIR = join(LANGS_DIR, 'meta');

/**
 * Legacy STRINGS.js only defines these five locales. Additional UI locales
 * (`de es fr it nl pt`) live as sibling JSON under `assets/langs/` and are
 * not emitted here — keep their key set in lockstep with `ko.json`.
 */
const LOCALES = ['en', 'ko', 'ja', 'zh', 'id'] as const;

type Locale = (typeof LOCALES)[number];

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type LegacyStrings = Record<Locale, Record<string, string | undefined>>;

interface PluralForms {
  readonly zero?: string;
  readonly one: string;
  readonly other: string;
}

type Localized = Readonly<Record<Locale, string>>;
type LocalizedPlural = Readonly<Record<Locale, PluralForms>>;

type Leaf = string | PluralForms;

interface Tree {
  [key: string]: Leaf | Tree;
}

/* -------------------------------------------------------------------------- */
/* 1. KEY_MAP — legacy flat key → new nested key                              */
/* -------------------------------------------------------------------------- */

/**
 * Verbatim from `.notes/research/04-legacy-content-i18n.md` §9.3, which was
 * derived against all 263 `en` keys with zero unmapped and zero orphans.
 * `assertLegacyCoverage()` re-proves that against the real file on every run.
 */
const KEY_MAP: Readonly<Record<string, string>> = {
  /* ---- common (COMPLETE and DONE merge into common.done) ---- */
  LOADING: 'common.loading',
  MORE: 'common.more',
  COMPLETE: 'common.done',
  CANCEL: 'common.cancel',
  OK: 'common.ok',
  YES: 'common.yes',
  NO: 'common.no',
  ADD: 'common.add',
  UPDATE: 'common.update',
  DELETE: 'common.delete',
  DELETE_CONFIRM: 'common.deleteConfirm',
  NEXT: 'common.next',
  SEND: 'common.send',
  ERROR: 'common.error',
  WARNING: 'common.warning',
  SUCCESS: 'common.success',
  FAILED: 'common.failed',
  NONE: 'common.none',
  UNKNOWN: 'common.unknown',
  VERSION: 'common.version',
  SEE_ALL: 'common.seeAll',
  EXIT: 'common.exit',
  SUM: 'common.sum',
  MEMO: 'common.memo',
  AMOUNT: 'common.amount',
  CATEGORY: 'common.category',
  DATE: 'common.date',
  LOCATION: 'common.location',
  PICTURE: 'common.picture',
  COLOR: 'common.color',
  MEMBER: 'common.member',
  INVITE: 'common.invite',
  TYPE_SEARCH: 'common.searchPlaceholder',
  CAMERA: 'common.camera',
  GALLERY: 'common.gallery',
  CALENDAR: 'common.calendar',
  LIST: 'common.list',

  /* ---- auth ---- */
  LOGIN: 'auth.login',
  SIGNUP: 'auth.signUp',
  LOGOUT: 'auth.logout',
  STILL_NO_ACCOUNT: 'auth.noAccountYet',
  NICK: 'auth.nickname',
  NICK_HINT: 'auth.nicknamePlaceholder',
  EMAIL_ADDRESS: 'auth.email',
  EMAIL_HINT: 'auth.emailPlaceholder',
  TEL: 'auth.phone',
  TEL_HINT: 'auth.phonePlaceholder',
  STATUS_MSG: 'auth.statusMessage',
  PASSWORD: 'auth.password',
  PASSWORD_HINT: 'auth.passwordPlaceholder',
  PASSWORD_SIGNUP_HINT: 'auth.passwordSignUpPlaceholder',
  PASSWORD_OK: 'auth.passwordConfirm',
  PASSWORD_OK_HINT: 'auth.passwordConfirmPlaceholder',
  DISPLAY_NAME: 'auth.displayName',
  DISPLAY_NAME_HINT: 'auth.displayNamePlaceholder',
  FORGOT_PW: 'auth.forgotPassword',
  FIND_PW: 'auth.findPassword',
  SEND_LINK: 'auth.sendLink',
  SEND_MAIL_FAILED: 'auth.resetMailFailed',
  SEND_MAIL_FAILED_DETAIL: 'auth.resetMailFailedBody',
  SEND_MAIL_SUCCESSED: 'auth.resetMailSent',
  SEND_MAIL_SUCCESSED_DETAIL: 'auth.resetMailSentBody',
  DO_EMAIL_VERIFICATION: 'auth.verifyEmail',
  TRANSFER_COMPLETE: 'auth.verificationMailSent',
  TRANSFER_COMPLETE_BODY: 'auth.verificationMailSentBody',
  TRANSFER_FAILED: 'auth.verificationMailFailed',
  TRANSFER_FAILED_BODY: 'auth.verificationMailFailedBody',
  EMAIL_VERIFICATION_HEADER: 'auth.emailVerificationTitle',
  EMAIL_VERIFICATION_BODY: 'auth.emailVerificationBody',
  AUTH_WITH_PW: 'auth.authenticateWithPassword',
  NOT_REGISTERED_USER: 'auth.notRegisteredUser',
  NONAME: 'auth.noName',
  NOEMAIL: 'auth.noEmail',

  /* ---- tutorial ---- */
  TUTORIAL_TXT_HEAD1: 'tutorial.slide1.title',
  TUTORIAL_TXT_HEAD2: 'tutorial.slide2.title',
  TUTORIAL_TXT_HEAD3: 'tutorial.slide3.title',
  TUTORIAL_TXT_BODY1: 'tutorial.slide1.body',
  TUTORIAL_TXT_BODY2: 'tutorial.slide2.body',
  TUTORIAL_TXT_BODY3: 'tutorial.slide3.body',

  /* ---- tabs ---- */
  TAB1: 'tabs.monthly',
  TAB2: 'tabs.list',
  TAB3: 'tabs.graph',
  TAB4: 'tabs.extra',

  /* ---- ledger ---- */
  NO_LEDGER_TXT: 'ledger.empty',
  ADD_LEDGER: 'ledger.add',
  WRITE_NAME_OF_LEDGER: 'ledger.titlePlaceholder',
  WRITE_DESCRIPTION_OF_LEDGER: 'ledger.descriptionPlaceholder',
  MISSING_LEDGER_INFO: 'ledger.missingInfo',
  NO_LEDGER_SEARCH_RESULT: 'ledger.noSearchResult',
  REQUEST_JOIN: 'ledger.requestJoin',
  REQUESTED: 'ledger.requested',
  WAITING_LIST: 'ledger.waitingList',
  ACCEPT: 'ledger.accept',
  REJECT: 'ledger.reject',
  EXIT_LEDGER: 'ledger.leave',
  EXIT_ALERT: 'ledger.leaveTitle',
  EXIT_ALERT_CONFIRM: 'ledger.leaveConfirm',
  EXIT_ALERT_OWNER: 'ledger.leaveOwnerBlocked',
  EXIT_ALERT_LAST_USER: 'ledger.leaveLastMember',
  EXIT_ALERT_INVITES: 'ledger.leavePendingInvites',
  CHANGE_OWNER: 'ledger.changeOwner',
  CHANGE_OWNER_CONFIRM: 'ledger.changeOwnerConfirm',

  /* ---- ledgerItem ---- */
  ADD_LEDGER_ITEM: 'ledgerItem.add',
  ADD_LEDGER_ITEM_NOTI: 'ledgerItem.addedNotification',
  UPDATE_LEDGER_ITEM: 'ledgerItem.update',
  UPDATE_LEDGER_ITEM_NOTI: 'ledgerItem.updatedNotification',
  ADD_OR_UPDATE_LEDGER_ITEM: 'ledgerItem.addOrUpdate',
  ALERT_LEDGER_ITEM_ADD_TITLE: 'ledgerItem.missingInfoTitle',
  ALERT_LEDGER_ITEM_ADD_BODY: 'ledgerItem.missingInfoBody',
  NO_LIST_ADDED_YET: 'ledgerItem.empty',
  INCOME: 'ledgerItem.income',
  CONSUME: 'ledgerItem.expense',
  PLZ_WRITE_COMMENT: 'ledgerItem.commentPlaceholder',
  SEE_ALL_REVIEWS: 'ledgerItem.expandComments',
  FOLD_REVIEWS: 'ledgerItem.collapseComments',
  VIDEO_IS_NOT_SUPPORTED: 'ledgerItem.videoNotSupported',

  /* ---- category: the 34-entry taxonomy (values corrected by VALUE_OVERRIDE) */
  CAFE: 'category.cafe',
  DRINK: 'category.drink',
  SNACK: 'category.snack',
  MEAL: 'category.meal',
  DATING: 'category.dating',
  MOVIE: 'category.movie',
  PET: 'category.pet',
  TRANSPORT: 'category.transport',
  EXERCISE: 'category.exercise',
  WEAR: 'category.wear',
  SLEEP: 'category.sleep',
  BABY: 'category.baby',
  GIFT: 'category.gift',
  ELECTRONIC: 'category.electronic',
  FURNITURE: 'category.furniture',
  TRAVEL: 'category.travel',
  MOBILE_FEE: 'category.mobileFee',
  HOSPITAL: 'category.hospital',
  WALLET_MONEY: 'category.walletMoney',
  SALARY: 'category.salary',
  BONUS: 'category.bonus',
  SELL_PRODUCT: 'category.sellProduct',
  AWARD: 'category.award',
  PRESENT: 'category.present',
  EXTRA: 'category.extra',
  CAR: 'category.car',
  CULTURE: 'category.culture',
  EDUCATION: 'category.education',
  ELECTRIC: 'category.electric',
  INSURANCE: 'category.insurance',
  MAINTENANCE: 'category.maintenance',
  MEMBERSHIP: 'category.membership',
  STUFFS: 'category.stuffs',
  TAX: 'category.tax',
  /* ---- category CRUD ---- */
  CATEGORY_ADD: 'category.add',
  CATEGORY_ADD_HINT: 'category.namePlaceholder',
  SELECT_ICON: 'category.selectIcon',
  ERR_TITLE_CATEGORY_ADD: 'category.addErrorTitle',
  ERR_BODY_CATEGORY_ADD: 'category.addErrorBody',

  /* ---- member ---- */
  INVITE_MEMBER_WITH_EMAIL: 'member.inviteByEmail',
  INVITATION_SENT: 'member.invitationSent',
  INVITING: 'member.inviting',
  UNREGISTERED_USER: 'member.unregistered',
  DELETE_MEMBER: 'member.delete',
  DELETE_MEMBER_CONFIRM: 'member.deleteConfirm',
  ERR_NO_VALID_EMAIL: 'member.invalidEmailTitle',
  ERR_NO_VALID_EMAIL_BODY: 'member.invalidEmailBody',
  EMAIL_INVITE_SUBJECT: 'member.inviteMailSubject',
  EMAIL_INVITE_BODY: 'member.inviteMailBody',

  /* ---- settings ---- */
  SETTING_ANNOUNCEMENT: 'settings.announcements',
  SETTING_OPINION: 'settings.feedback',
  SETTING_FAQ: 'settings.faq',
  SETTING_PUSH: 'settings.notifications',
  SETTING_LOCK: 'settings.lock',
  SETTING_LOCK_HINT: 'settings.lockHint',
  CURRENCY_UNIT: 'settings.currency',
  SETTING_LANGUAGE: 'settings.language',
  WRITE_OPINION_HINT: 'settings.feedbackPlaceholder',
  SENDING_OPINION_FAILED: 'settings.feedbackFailed',
  SENDING_OPINION_SUCCESSED: 'settings.feedbackSent',

  /* ---- permission (the three usage descriptions leave the bundle) ---- */
  PERMISSION_LOCATION_NOT_GRANTED: 'permission.locationDenied',
  PERMISSION_NOTIFICATIONS_NOT_GRANTED: 'permission.notificationsDenied',
  PERMISSION_REQUEST: 'permission.requestTitle',

  /* ---- lock ("fingerprint" → "biometric": expo-local-authentication also
         covers Face ID / Touch ID) ---- */
  FINGERPRINT_SET: 'lock.setBiometric',
  FINGERPRINT_IS_NOT_SET: 'lock.biometricNotEnrolled',
  FINGERPRINT_AUTH_TO_USE_APP: 'lock.biometricPrompt',
  LOGIN_WITH_FINGERPRINT: 'lock.biometricTitle',
  LOGIN_WITH_FINGERPRINT_BODY: 'lock.biometricBody',
  PW_NUMBER_NOT_SET: 'lock.pinNotSet',
  ERR_TITLE_LOCK: 'lock.authFailedTitle',
  ERR_BODY_LOCK: 'lock.authFailedBody',
  ERR_TITLE_LOCK_SET: 'lock.setErrorTitle',
  ERR_BODY_LOCK_SET: 'lock.setErrorBody',
};

/* -------------------------------------------------------------------------- */
/* 2. DROPPED — legacy keys that deliberately do not ship                     */
/* -------------------------------------------------------------------------- */

type DropReason =
  | 'convex:announcements'
  | 'convex:faqs'
  | 'meta:infoPlist'
  | 'merged'
  | 'feature-removed'
  | 'never-shipped'
  | 'collapsed'
  | 'date-fns';

const DROP_REASON_TEXT: Readonly<Record<DropReason, string>> = {
  'convex:announcements':
    'release-note content → `announcements` Convex table, not app chrome',
  'convex:faqs': 'help content → `faqs` Convex table, and rewritten there',
  'meta:infoPlist':
    'native usage description → assets/langs/meta/*.json (Expo `locales`)',
  merged: 'byte-identical to another key in all five locales',
  'feature-removed': 'the feature is not in the rewrite',
  'never-shipped': 'placeholder copy for a screen that never existed',
  collapsed: 'folded into one interpolated string',
  'date-fns': 'standard weekday/month name — date-fns locale objects provide it',
};

const buildDropped = (): Record<string, DropReason> => {
  const dropped: Record<string, DropReason> = {
    DONE: 'merged',
    FACEBOOK_NO_EMAIL: 'feature-removed',
    SETTING_REPEAT: 'never-shipped',
    PASTE_MESSAGE: 'never-shipped',
    EXPORT_EXCEL: 'never-shipped',
    NEXT_UPDATE: 'never-shipped',
    NEXT_UPDATE_BODY: 'never-shipped',
    PERMISSION_REQUEST_CAMERA: 'meta:infoPlist',
    PERMISSION_REQUEST_CAMERA_ROLL: 'meta:infoPlist',
    PERMISSION_REQUEST_LOCATION: 'meta:infoPlist',
    // `id`-only strays: wrong naming convention, dead. `DIMINTA` was the
    // mistranslated stand-in for the `REQUESTED` key `id` was missing.
    ANNOUNCEMENT1_TITLE: 'convex:announcements',
    ANNOUNCEMENT1_BODY: 'convex:announcements',
    DIMINTA: 'feature-removed',
  };

  for (let n = 1; n <= 5; n += 1) {
    dropped[`INTRO_FOOTER_TXT${n}`] = 'collapsed';
  }

  for (let n = 1; n <= 9; n += 1) {
    dropped[`ANNOUNCEMENT_${n}`] = 'convex:announcements';
    dropped[`ANNOUNCEMENT_TXT_${n}`] = 'convex:announcements';
  }

  for (let n = 1; n <= 11; n += 1) {
    dropped[`FAQ_${n}`] = 'convex:faqs';
    dropped[`FAQ_TXT_${n}`] = 'convex:faqs';
  }

  for (const day of ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']) {
    dropped[day] = 'date-fns';
  }

  for (const month of [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ]) {
    dropped[month] = 'date-fns';
  }

  return dropped;
};

const DROPPED: Readonly<Record<string, DropReason>> = buildDropped();

/* -------------------------------------------------------------------------- */
/* 3. VALUE_OVERRIDE — corrected copy for keys that DO come from the legacy    */
/* -------------------------------------------------------------------------- */

/**
 * The 34 category labels, corrected per
 * `.notes/design/money-categories-i18n.md` §2.7. The legacy values contain
 * nine outright mistranslations plus a `FURNITURE`/`ELECTRONIC` collision in
 * ko/ja/zh (both slots meant "electronics"; nothing meant "furniture"), and
 * the Indonesian set is ALL-CAPS with a trailing space on `EXTRA`.
 * The whole table is restated rather than patched so the shipped copy is
 * readable in one place.
 */
const CATEGORY_LABELS: Readonly<Record<string, Localized>> = {
  'category.meal': {en: 'Meal', ko: '식사', ja: '食事', zh: '餐饮', id: 'Makan'},
  'category.cafe': {en: 'Cafe', ko: '카페', ja: 'カフェ', zh: '咖啡', id: 'Kafe'},
  'category.snack': {
    en: 'Snack',
    ko: '간식',
    ja: 'おやつ',
    zh: '零食',
    id: 'Camilan',
  },
  'category.drink': {
    en: 'Drinks',
    ko: '술',
    ja: 'お酒',
    zh: '酒水',
    id: 'Minuman',
  },
  'category.transport': {
    en: 'Transport',
    ko: '교통비',
    ja: '交通費',
    zh: '交通费',
    id: 'Transportasi',
  },
  'category.car': {
    en: 'Car',
    ko: '자동차',
    ja: '自動車',
    zh: '汽车',
    id: 'Mobil',
  },
  'category.mobileFee': {
    en: 'Phone & internet',
    ko: '통신비',
    ja: '通信費',
    zh: '通讯费',
    id: 'Komunikasi',
  },
  'category.electric': {
    en: 'Electricity',
    ko: '전기요금',
    ja: '電気代',
    zh: '电费',
    id: 'Listrik',
  },
  'category.maintenance': {
    en: 'Maintenance fee',
    ko: '관리비',
    ja: '管理費',
    zh: '物业费',
    id: 'Pemeliharaan',
  },
  'category.wear': {
    en: 'Clothing',
    ko: '의류',
    ja: '衣類',
    zh: '服装',
    id: 'Pakaian',
  },
  'category.stuffs': {
    en: 'Sundries',
    ko: '잡화',
    ja: '雑貨',
    zh: '杂货',
    id: 'Barang',
  },
  'category.electronic': {
    en: 'Electronics',
    ko: '전자제품',
    ja: '電子製品',
    zh: '电子产品',
    id: 'Elektronik',
  },
  'category.furniture': {
    en: 'Furniture',
    ko: '가구',
    ja: '家具',
    zh: '家具',
    id: 'Perabot',
  },
  'category.hospital': {
    en: 'Health',
    ko: '병원',
    ja: '病院',
    zh: '医疗',
    id: 'Kesehatan',
  },
  'category.insurance': {
    en: 'Insurance',
    ko: '보험',
    ja: '保険',
    zh: '保险',
    id: 'Asuransi',
  },
  'category.education': {
    en: 'Education',
    ko: '교육',
    ja: '教育',
    zh: '教育',
    id: 'Pendidikan',
  },
  'category.culture': {
    en: 'Culture',
    ko: '문화',
    ja: '文化',
    zh: '文化',
    id: 'Budaya',
  },
  'category.movie': {
    en: 'Movies',
    ko: '영화',
    ja: '映画',
    zh: '电影',
    id: 'Film',
  },
  'category.exercise': {
    en: 'Fitness',
    ko: '운동',
    ja: '運動',
    zh: '运动',
    id: 'Olahraga',
  },
  'category.membership': {
    en: 'Membership',
    ko: '멤버십',
    ja: '会費',
    zh: '会员费',
    id: 'Keanggotaan',
  },
  'category.travel': {
    en: 'Travel',
    ko: '여행',
    ja: '旅行',
    zh: '旅游',
    id: 'Perjalanan',
  },
  'category.sleep': {
    en: 'Lodging',
    ko: '숙박',
    ja: '宿泊',
    zh: '住宿',
    id: 'Penginapan',
  },
  'category.dating': {
    en: 'Dating',
    ko: '데이트',
    ja: 'デート',
    zh: '约会',
    id: 'Kencan',
  },
  'category.gift': {
    en: 'Gift money',
    ko: '경조사비',
    ja: '慶弔費',
    zh: '礼金支出',
    id: 'Hadiah',
  },
  'category.baby': {
    en: 'Baby',
    ko: '유아용품',
    ja: 'ベビー用品',
    zh: '婴儿用品',
    id: 'Bayi',
  },
  'category.pet': {
    en: 'Pet',
    ko: '반려동물',
    ja: 'ペット',
    zh: '宠物',
    id: 'Hewan peliharaan',
  },
  'category.tax': {en: 'Tax', ko: '세금', ja: '税金', zh: '税金', id: 'Pajak'},
  'category.salary': {
    en: 'Salary',
    ko: '월급',
    ja: '給料',
    zh: '工资',
    id: 'Gaji',
  },
  'category.bonus': {
    en: 'Bonus',
    ko: '보너스',
    ja: 'ボーナス',
    zh: '奖金',
    id: 'Bonus',
  },
  'category.walletMoney': {
    en: 'Allowance',
    ko: '용돈',
    ja: '小遣い',
    zh: '零用钱',
    id: 'Uang saku',
  },
  'category.sellProduct': {
    en: 'Sales',
    ko: '물품판매',
    ja: '物品販売',
    zh: '出售商品',
    id: 'Penjualan barang',
  },
  'category.award': {
    en: 'Prize',
    ko: '상금',
    ja: '賞金',
    zh: '赏金',
    id: 'Hadiah uang',
  },
  'category.present': {
    en: 'Gift received',
    ko: '선물받음',
    ja: '贈り物',
    zh: '礼金收入',
    id: 'Hadiah diterima',
  },
  'category.extra': {
    en: 'Other income',
    ko: '기타 수입',
    ja: 'その他収入',
    zh: '其他收入',
    id: 'Pemasukan lain',
  },
};

const VALUE_OVERRIDE: Readonly<Record<string, Localized>> = {
  ...CATEGORY_LABELS,

  // `TAB4` carries the same copy-paste defect as the `EXTRA` category: zh reads
  // 吉他 ("guitar") and id reads "gitar". The other three tab labels are
  // normalized out of the legacy's lowercase Indonesian / literal Chinese.
  'tabs.monthly': {
    en: 'Monthly',
    ko: '월별',
    ja: '月別',
    zh: '月度',
    id: 'Bulanan',
  },
  'tabs.list': {en: 'List', ko: '리스트', ja: 'リスト', zh: '列表', id: 'Daftar'},
  'tabs.graph': {
    en: 'Stats',
    ko: '통계',
    ja: '統計',
    zh: '统计',
    id: 'Statistik',
  },
  'tabs.extra': {en: 'More', ko: '기타', ja: 'その他', zh: '其他', id: 'Lainnya'},

  // `id` was missing `REQUESTED` entirely and carried `DIMINTA` ("Diminta",
  // which is the correct Indonesian) as an orphan key no call site ever read.
  // Recovered here. ja/zh are also reworded: 要求された / 要求 read as "was
  // demanded", not "join request sent".
  'ledger.requested': {
    en: 'Requested',
    ko: '요청됨',
    ja: '申込済み',
    zh: '已申请',
    id: 'Diminta',
  },

  // Typos in the legacy Korean copy: "아아템" (아이템), "멤머" (멤버).
  'ledgerItem.empty': {
    en: 'No entries yet.',
    ko: '아직 내역이 없습니다.',
    ja: 'まだ記録がありません。',
    zh: '还没有记录。',
    id: 'Belum ada catatan.',
  },
  'ledgerItem.income': {
    en: 'Income',
    ko: '수입',
    ja: '収入',
    zh: '收入',
    id: 'Pendapatan',
  },

  'ledgerItem.add': {
    en: 'Add an entry to this ledger.',
    ko: '가계부에 새 내역을 등록합니다.',
    ja: '家計簿に新しい記録を追加します。',
    zh: '向账本添加一条新记录。',
    id: 'Tambahkan catatan baru ke buku kas.',
  },
  'ledger.leaveLastMember': {
    en: 'You are the last member, so leaving now deletes this ledger and all of its data. Continue?',
    ko: '남아있는 멤버가 없기 때문에 지금 가계부를 떠나면 해당 데이터는 모두 사라집니다. 계속하시겠습니까?',
    ja: '他にメンバーがいないため、いま退出するとこの家計簿のデータはすべて削除されます。続けますか？',
    zh: '你是最后一位成员，现在退出将删除该账本及其全部数据。要继续吗？',
    id: 'Anda anggota terakhir, sehingga keluar sekarang akan menghapus buku kas ini beserta seluruh datanya. Lanjutkan?',
  },

  // The legacy `en` copy shouts in a handful of places.
  'common.loading': {
    en: 'Loading…',
    ko: '불러오는 중…',
    ja: '読み込み中…',
    zh: '加载中…',
    id: 'Memuat…',
  },
  'ledger.waitingList': {
    en: 'Waiting list',
    ko: '대기자 리스트',
    ja: '順番待ちリスト',
    zh: '等候名单',
    id: 'Daftar tunggu',
  },
  'auth.authenticateWithPassword': {
    en: 'Authenticate with password',
    ko: '비밀번호 인증',
    ja: 'パスワード認証',
    zh: '密码认证',
    id: 'Autentikasi dengan kata sandi',
  },

  // "4 digits lock number is not setted" — typo, and the rewrite says PIN.
  'lock.pinNotSet': {
    en: 'No 4-digit PIN has been set yet.',
    ko: '4자리 잠금 번호가 설정되어 있지 않습니다.',
    ja: '4桁のロック番号が設定されていません。',
    zh: '尚未设置 4 位数锁定密码。',
    id: 'PIN 4 digit belum diatur.',
  },

  // The legacy wording is "fingerprint" everywhere; expo-local-authentication
  // also covers Face ID and Touch ID.
  'lock.setBiometric': {
    en: 'Use biometrics',
    ko: '생체 인증 사용',
    ja: '生体認証を使う',
    zh: '使用生物识别',
    id: 'Gunakan biometrik',
  },
  'lock.biometricNotEnrolled': {
    en: 'No biometrics are enrolled on this device.',
    ko: '이 기기에 등록된 생체 정보가 없습니다.',
    ja: 'この端末に生体情報が登録されていません。',
    zh: '此设备尚未录入生物识别信息。',
    id: 'Belum ada biometrik yang terdaftar di perangkat ini.',
  },
  'lock.biometricPrompt': {
    en: 'Authenticate to open BooKoo',
    ko: 'BooKoo를 열려면 인증해 주세요',
    ja: 'BooKoo を開くには認証してください',
    zh: '请验证身份以打开 BooKoo',
    id: 'Autentikasi untuk membuka BooKoo',
  },
  'lock.biometricTitle': {
    en: 'Unlock with biometrics',
    ko: '생체 인증으로 잠금 해제',
    ja: '生体認証でロック解除',
    zh: '使用生物识别解锁',
    id: 'Buka kunci dengan biometrik',
  },
  'lock.biometricBody': {
    en: 'Use Face ID, Touch ID or your fingerprint instead of the PIN.',
    ko: 'PIN 대신 Face ID, Touch ID 또는 지문을 사용합니다.',
    ja: 'PIN の代わりに Face ID・Touch ID・指紋を使用します。',
    zh: '使用面容、指纹代替 PIN 解锁。',
    id: 'Gunakan Face ID, Touch ID atau sidik jari sebagai ganti PIN.',
  },

  // The invite flow is a deep link now, not a two-way `invites` / `requests`
  // index, so the mail copy is rewritten around the link.
  'member.inviteMailSubject': {
    en: 'You have been invited to a BooKoo ledger',
    ko: 'BooKoo 가계부에 초대되었습니다',
    ja: 'BooKoo の家計簿に招待されました',
    zh: '有人邀请你加入 BooKoo 账本',
    id: 'Anda diundang ke buku kas BooKoo',
  },
  'member.inviteMailBody': {
    en: '{{inviter}} invited you to the ledger “{{ledger}}”. Open the link below to join.',
    ko: '{{inviter}}님이 “{{ledger}}” 가계부에 초대했습니다. 아래 링크를 열어 참여하세요.',
    ja: '{{inviter}} さんが家計簿「{{ledger}}」に招待しました。下のリンクを開いて参加してください。',
    zh: '{{inviter}} 邀请你加入账本“{{ledger}}”。打开下方链接即可加入。',
    id: '{{inviter}} mengundang Anda ke buku kas “{{ledger}}”. Buka tautan di bawah untuk bergabung.',
  },
  'member.inviteByEmail': {
    en: 'Invite by email',
    ko: '이메일로 초대하기',
    ja: 'メールで招待',
    zh: '通过邮箱邀请',
    id: 'Undang lewat email',
  },
};

/* -------------------------------------------------------------------------- */
/* 4. NEW_STRINGS — keys the rewrite introduces                               */
/* -------------------------------------------------------------------------- */

const NEW_STRINGS: Readonly<Record<string, Localized>> = {
  /* ---- a11y (new namespace) ---- */
  'a11y.addEntry': {
    en: 'Add entry',
    ko: '내역 추가',
    ja: '記録を追加',
    zh: '添加记录',
    id: 'Tambah catatan',
  },
  'a11y.back': {en: 'Back', ko: '뒤로', ja: '戻る', zh: '返回', id: 'Kembali'},
  'a11y.close': {en: 'Close', ko: '닫기', ja: '閉じる', zh: '关闭', id: 'Tutup'},
  'a11y.expenseAmount': {
    en: 'expense, {{amount}}, {{category}}',
    ko: '지출, {{amount}}, {{category}}',
    ja: '支出、{{amount}}、{{category}}',
    zh: '支出，{{amount}}，{{category}}',
    id: 'pengeluaran, {{amount}}, {{category}}',
  },
  'a11y.incomeAmount': {
    en: 'income, {{amount}}, {{category}}',
    ko: '수입, {{amount}}, {{category}}',
    ja: '収入、{{amount}}、{{category}}',
    zh: '收入，{{amount}}，{{category}}',
    id: 'pemasukan, {{amount}}, {{category}}',
  },
  'a11y.toggleTheme': {
    en: 'Switch theme',
    ko: '테마 전환',
    ja: 'テーマを切り替える',
    zh: '切换主题',
    id: 'Ganti tema',
  },

  /* ---- auth: the new provider set (Kakao / Naver / Google / Apple / OTP) -- */
  'auth.continueWithKakao': {
    en: 'Continue with Kakao',
    ko: '카카오로 계속하기',
    ja: 'Kakao で続ける',
    zh: '使用 Kakao 继续',
    id: 'Lanjutkan dengan Kakao',
  },
  'auth.continueWithNaver': {
    en: 'Continue with Naver',
    ko: '네이버로 계속하기',
    ja: 'Naver で続ける',
    zh: '使用 Naver 继续',
    id: 'Lanjutkan dengan Naver',
  },
  'auth.continueWithGoogle': {
    en: 'Continue with Google',
    ko: '구글로 계속하기',
    ja: 'Google で続ける',
    zh: '使用 Google 继续',
    id: 'Lanjutkan dengan Google',
  },
  'auth.continueWithApple': {
    en: 'Continue with Apple',
    ko: '애플로 계속하기',
    ja: 'Apple で続ける',
    zh: '使用 Apple 继续',
    id: 'Lanjutkan dengan Apple',
  },
  'auth.continueWithEmail': {
    en: 'Continue with email',
    ko: '이메일로 계속하기',
    ja: 'メールで続ける',
    zh: '使用邮箱继续',
    id: 'Lanjutkan dengan email',
  },
  'auth.sendOtp': {
    en: 'Send code',
    ko: '인증코드 받기',
    ja: '認証コードを送信',
    zh: '发送验证码',
    id: 'Kirim kode',
  },
  'auth.otpPlaceholder': {
    en: '6-digit code',
    ko: '6자리 인증코드',
    ja: '6桁の認証コード',
    zh: '6 位验证码',
    id: 'Kode 6 digit',
  },
  'auth.otpSent': {
    en: 'We sent a code to {{email}}.',
    ko: '{{email}}(으)로 인증코드를 보냈습니다.',
    ja: '{{email}} に認証コードを送信しました。',
    zh: '验证码已发送至 {{email}}。',
    id: 'Kode telah dikirim ke {{email}}.',
  },
  'auth.otpInvalid': {
    en: 'That code is not correct.',
    ko: '인증코드가 올바르지 않습니다.',
    ja: '認証コードが正しくありません。',
    zh: '验证码不正确。',
    id: 'Kode tidak benar.',
  },
  'auth.otpResend': {
    en: 'Resend code',
    ko: '인증코드 다시 보내기',
    ja: '認証コードを再送する',
    zh: '重新发送验证码',
    id: 'Kirim ulang kode',
  },

  /* ---- auth: the mandatory username claim on first sign-in ---- */
  'auth.usernameTitle': {
    en: 'Choose a username',
    ko: '사용자 이름 정하기',
    ja: 'ユーザー名を決める',
    zh: '设置用户名',
    id: 'Pilih nama pengguna',
  },
  'auth.usernameDescription': {
    en: 'This is how other members find you. You can change it later.',
    ko: '다른 멤버가 회원님을 찾는 이름입니다. 나중에 바꿀 수 있습니다.',
    ja: '他のメンバーがあなたを見つけるための名前です。あとで変更できます。',
    zh: '其他成员会通过它找到你，之后可以修改。',
    id: 'Ini cara anggota lain menemukan Anda. Bisa diubah nanti.',
  },
  'auth.usernamePlaceholder': {
    en: 'username',
    ko: '사용자 이름',
    ja: 'ユーザー名',
    zh: '用户名',
    id: 'nama pengguna',
  },
  'auth.usernameAvailable': {
    en: 'This ID is available.',
    ko: '사용할 수 있는 아이디입니다.',
    ja: 'このIDは使用できます。',
    zh: '这个 ID 可以使用。',
    id: 'ID ini dapat digunakan.',
  },
  'auth.usernameTaken': {
    en: 'This ID is not available.',
    ko: '사용할 수 없는 아이디입니다.',
    ja: 'このIDは使用できません。',
    zh: '这个 ID 无法使用。',
    id: 'ID ini tidak dapat digunakan.',
  },
  'auth.usernameInvalid': {
    en: 'Use 3–20 letters, numbers or underscores.',
    ko: '3~20자의 영문, 숫자, 밑줄만 사용할 수 있습니다.',
    ja: '3〜20文字の英数字とアンダースコアが使えます。',
    zh: '请使用 3–20 位字母、数字或下划线。',
    id: 'Gunakan 3–20 huruf, angka, atau garis bawah.',
  },
  'auth.claimUsername': {
    en: 'Use this username',
    ko: '이 이름으로 시작하기',
    ja: 'この名前ではじめる',
    zh: '使用该用户名',
    id: 'Gunakan nama ini',
  },

  /* ---- calendar (the 19 legacy weekday/month names are gone; these are the
         chrome around the grid, which date-fns cannot supply) ---- */
  'calendar.today': {
    en: 'Today',
    ko: '오늘',
    ja: '今日',
    zh: '今天',
    id: 'Hari ini',
  },
  'calendar.thisMonth': {
    en: 'This month',
    ko: '이번 달',
    ja: '今月',
    zh: '本月',
    id: 'Bulan ini',
  },
  'calendar.previousMonth': {
    en: 'Previous month',
    ko: '이전 달',
    ja: '前の月',
    zh: '上个月',
    id: 'Bulan sebelumnya',
  },
  'calendar.nextMonth': {
    en: 'Next month',
    ko: '다음 달',
    ja: '次の月',
    zh: '下个月',
    id: 'Bulan berikutnya',
  },
  'calendar.selectDate': {
    en: 'Select date',
    ko: '날짜 선택',
    ja: '日付を選択',
    zh: '选择日期',
    id: 'Pilih tanggal',
  },
  'calendar.noEntries': {
    en: 'No entries on this day',
    ko: '이 날의 내역이 없습니다',
    ja: 'この日の記録はありません',
    zh: '这一天没有记录',
    id: 'Tidak ada catatan pada hari ini',
  },

  /* ---- category: the terminal fallback bucket ---- */
  'category.uncategorized': {
    en: 'Uncategorized',
    ko: '미분류',
    ja: '未分類',
    zh: '未分类',
    id: 'Tanpa kategori',
  },

  /* ---- error: mirrors the shared error-code union ---- */
  'error.generic': {
    en: 'Something went wrong.',
    ko: '문제가 발생했습니다.',
    ja: '問題が発生しました。',
    zh: '出了点问题。',
    id: 'Terjadi kesalahan.',
  },
  'error.network': {
    en: 'Check your connection and try again.',
    ko: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    ja: 'ネットワーク接続を確認して、もう一度お試しください。',
    zh: '请检查网络连接后重试。',
    id: 'Periksa koneksi Anda lalu coba lagi.',
  },
  'error.offline': {
    en: 'You are offline.',
    ko: '오프라인 상태입니다.',
    ja: 'オフラインです。',
    zh: '当前处于离线状态。',
    id: 'Anda sedang offline.',
  },
  'error.serverError': {
    en: 'The server is having trouble. Try again in a moment.',
    ko: '서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.',
    ja: 'サーバーに問題が発生しています。しばらくしてからお試しください。',
    zh: '服务器出现问题，请稍后再试。',
    id: 'Server sedang bermasalah. Coba lagi sebentar.',
  },
  'error.unauthorized': {
    en: 'Please sign in again.',
    ko: '다시 로그인해 주세요.',
    ja: 'もう一度ログインしてください。',
    zh: '请重新登录。',
    id: 'Silakan masuk lagi.',
  },
  'error.forbidden': {
    en: 'You do not have permission to do that.',
    ko: '이 작업을 수행할 권한이 없습니다.',
    ja: 'この操作を行う権限がありません。',
    zh: '你没有执行该操作的权限。',
    id: 'Anda tidak memiliki izin untuk melakukannya.',
  },
  'error.notFound': {
    en: 'Not found.',
    ko: '찾을 수 없습니다.',
    ja: '見つかりませんでした。',
    zh: '未找到。',
    id: 'Tidak ditemukan.',
  },
  'error.invalidInput': {
    en: 'Check the values you entered.',
    ko: '입력한 내용을 확인해 주세요.',
    ja: '入力内容を確認してください。',
    zh: '请检查输入的内容。',
    id: 'Periksa data yang Anda masukkan.',
  },
  'error.rateLimited': {
    en: 'Too many attempts. Try again later.',
    ko: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    ja: '試行回数が多すぎます。しばらくしてからお試しください。',
    zh: '尝试次数过多，请稍后再试。',
    id: 'Terlalu banyak percobaan. Coba lagi nanti.',
  },
  'error.ledgerNotFound': {
    en: 'This ledger no longer exists.',
    ko: '존재하지 않는 가계부입니다.',
    ja: 'この家計簿は存在しません。',
    zh: '该账本已不存在。',
    id: 'Buku kas ini sudah tidak ada.',
  },
  'error.ledgerCurrencyMigrating': {
    en: 'The base currency is being changed. Try again in a moment.',
    ko: '기준 통화를 변경하는 중입니다. 잠시 후 다시 시도해 주세요.',
    ja: '基準通貨を変更中です。しばらくしてからお試しください。',
    zh: '正在更改记账货币，请稍后再试。',
    id: 'Mata uang dasar sedang diubah. Coba lagi sebentar.',
  },
  'error.memberLimitReached': {
    en: 'This ledger has reached its member limit.',
    ko: '이 가계부의 멤버 수가 가득 찼습니다.',
    ja: 'この家計簿はメンバー数の上限に達しています。',
    zh: '该账本的成员数已达上限。',
    id: 'Buku kas ini sudah mencapai batas anggota.',
  },
  'error.inviteExpired': {
    en: 'This invite link has expired.',
    ko: '만료된 초대 링크입니다.',
    ja: 'この招待リンクは期限切れです。',
    zh: '该邀请链接已过期。',
    id: 'Tautan undangan ini sudah kedaluwarsa.',
  },
  'error.usernameTaken': {
    en: 'That username is already taken.',
    ko: '이미 사용 중인 사용자 이름입니다.',
    ja: 'そのユーザー名はすでに使われています。',
    zh: '该用户名已被使用。',
    id: 'Nama pengguna itu sudah dipakai.',
  },

  /* ---- intro: five concatenated fragments → one interpolated sentence ---- */
  'intro.agreementNotice': {
    en: 'By continuing you agree to the {{terms}} and the {{privacy}}.',
    ko: '계속하면 {{terms}} 및 {{privacy}}에 동의하는 것으로 간주합니다.',
    ja: '続行すると、{{terms}}および{{privacy}}に同意したものとみなされます。',
    zh: '继续即表示你同意{{terms}}和{{privacy}}。',
    id: 'Dengan melanjutkan, Anda menyetujui {{terms}} dan {{privacy}}.',
  },
  'intro.terms': {
    en: 'Terms of Service',
    ko: '이용약관',
    ja: '利用規約',
    zh: '服务条款',
    id: 'Syarat Penggunaan',
  },
  'intro.privacy': {
    en: 'Privacy Policy',
    ko: '개인정보처리방침',
    ja: 'プライバシーポリシー',
    zh: '隐私政策',
    id: 'Kebijakan Privasi',
  },
  'intro.getStarted': {
    en: 'Get started',
    ko: '시작하기',
    ja: 'はじめる',
    zh: '开始使用',
    id: 'Mulai',
  },
  'intro.tagline': {
    en: 'A ledger you keep together.',
    ko: '함께 쓰는 가계부',
    ja: 'みんなで使う家計簿',
    zh: '一起记的账本',
    id: 'Buku kas yang dicatat bersama',
  },

  /* ---- member: the invite link replaces the invites/requests handshake ---- */
  'member.createInviteLink': {
    en: 'Create invite link',
    ko: '초대 링크 만들기',
    ja: '招待リンクを作成',
    zh: '创建邀请链接',
    id: 'Buat tautan undangan',
  },
  'member.inviteLink': {
    en: 'Invite link',
    ko: '초대 링크',
    ja: '招待リンク',
    zh: '邀请链接',
    id: 'Tautan undangan',
  },
  'member.inviteLinkCopied': {
    en: 'Invite link copied.',
    ko: '초대 링크를 복사했습니다.',
    ja: '招待リンクをコピーしました。',
    zh: '已复制邀请链接。',
    id: 'Tautan undangan disalin.',
  },
  'member.inviteLinkInvalid': {
    en: 'This invite link is not valid.',
    ko: '유효하지 않은 초대 링크입니다.',
    ja: 'この招待リンクは無効です。',
    zh: '该邀请链接无效。',
    id: 'Tautan undangan ini tidak valid.',
  },
  'member.shareInviteLink': {
    en: 'Share invite link',
    ko: '초대 링크 공유',
    ja: '招待リンクを共有',
    zh: '分享邀请链接',
    id: 'Bagikan tautan undangan',
  },
  'member.revokeInviteLink': {
    en: 'Revoke invite link',
    ko: '초대 링크 해제',
    ja: '招待リンクを無効にする',
    zh: '撤销邀请链接',
    id: 'Cabut tautan undangan',
  },
  'member.joinedLedger': {
    en: 'You joined {{ledger}}.',
    ko: '{{ledger}}에 참여했습니다.',
    ja: '{{ledger}} に参加しました。',
    zh: '你已加入 {{ledger}}。',
    id: 'Anda bergabung dengan {{ledger}}.',
  },
  'member.owner': {
    en: 'Owner',
    ko: '소유자',
    ja: 'オーナー',
    zh: '所有者',
    id: 'Pemilik',
  },

  /* ---- money (new namespace) ---- */
  'money.balance': {
    en: 'Balance',
    ko: '잔액',
    ja: '残高',
    zh: '结余',
    id: 'Saldo',
  },
  'money.total': {en: 'Total', ko: '합계', ja: '合計', zh: '合计', id: 'Total'},
  'money.baseCurrency': {
    en: 'Base currency',
    ko: '기준 통화',
    ja: '基準通貨',
    zh: '记账货币',
    id: 'Mata uang dasar',
  },
  'money.baseAmountHint': {
    en: '≈ {{amount}} in {{currency}}',
    ko: '{{currency}} 기준 약 {{amount}}',
    ja: '{{currency}} 換算で約 {{amount}}',
    zh: '约合 {{amount}}（{{currency}}）',
    id: '≈ {{amount}} dalam {{currency}}',
  },
  'money.convertedFrom': {
    en: 'Converted from {{currency}}',
    ko: '{{currency}}에서 환산',
    ja: '{{currency}} から換算',
    zh: '由 {{currency}} 换算',
    id: 'Dikonversi dari {{currency}}',
  },
  'money.fxRate': {
    en: 'Exchange rate',
    ko: '환율',
    ja: '為替レート',
    zh: '汇率',
    id: 'Kurs',
  },
  'money.fxManual': {
    en: 'Enter the rate manually',
    ko: '환율 직접 입력',
    ja: 'レートを手入力する',
    zh: '手动输入汇率',
    id: 'Masukkan kurs secara manual',
  },
  'money.refund': {
    en: 'Refund',
    ko: '환불',
    ja: '返金',
    zh: '退款',
    id: 'Pengembalian dana',
  },

  /* ---- permission: the key the legacy called but never defined ---- */
  'permission.cameraDenied': {
    en: 'Camera permission has not been granted.',
    ko: '카메라 권한이 허용되어 있지 않습니다.',
    ja: 'カメラの権限が許可されていません。',
    zh: '尚未获得相机权限。',
    id: 'Izin kamera belum diberikan.',
  },
  'permission.photosDenied': {
    en: 'Photo library permission has not been granted.',
    ko: '사진 접근 권한이 허용되어 있지 않습니다.',
    ja: '写真へのアクセス権限が許可されていません。',
    zh: '尚未获得相册权限。',
    id: 'Izin galeri belum diberikan.',
  },
  'permission.openSettings': {
    en: 'Open settings',
    ko: '설정 열기',
    ja: '設定を開く',
    zh: '打开设置',
    id: 'Buka pengaturan',
  },

  /* ---- settings: theme, and the ledger-level date preferences ---- */
  'settings.theme': {en: 'Theme', ko: '테마', ja: 'テーマ', zh: '主题', id: 'Tema'},
  'settings.themeSystem': {
    en: 'System',
    ko: '시스템 설정',
    ja: 'システム',
    zh: '跟随系统',
    id: 'Sistem',
  },
  'settings.themeLight': {
    en: 'Light',
    ko: '라이트',
    ja: 'ライト',
    zh: '浅色',
    id: 'Terang',
  },
  'settings.themeDark': {
    en: 'Dark',
    ko: '다크',
    ja: 'ダーク',
    zh: '深色',
    id: 'Gelap',
  },
  'settings.weekStart': {
    en: 'Start of week',
    ko: '주 시작 요일',
    ja: '週の開始日',
    zh: '每周开始日',
    id: 'Awal minggu',
  },
  'settings.timezone': {
    en: 'Time zone',
    ko: '시간대',
    ja: 'タイムゾーン',
    zh: '时区',
    id: 'Zona waktu',
  },
  'settings.deleteAccount': {
    en: 'Delete account',
    ko: '계정 삭제',
    ja: 'アカウントを削除',
    zh: '删除账号',
    id: 'Hapus akun',
  },
  'settings.deleteAccountConfirm': {
    en: 'Delete your account and everything you own? This cannot be undone.',
    ko: '계정과 소유한 모든 데이터를 삭제할까요? 되돌릴 수 없습니다.',
    ja: 'アカウントと所有するデータをすべて削除しますか？元に戻せません。',
    zh: '确定删除账号及其全部数据？此操作无法撤销。',
    id: 'Hapus akun dan semua data Anda? Tindakan ini tidak bisa dibatalkan.',
  },
};

/* -------------------------------------------------------------------------- */
/* 5. NEW_PLURALS                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `ko` / `ja` / `zh` / `id` have no grammatical plural. They still carry every
 * sub-key so `i18n-json/identical-keys` passes against `ko.json` without an
 * `ignoreKeys` exception; the registered pluralizer only ever asks for `zero`
 * and `other` in those locales, so the duplicated `one` is never read.
 */
const NEW_PLURALS: Readonly<Record<string, LocalizedPlural>> = {
  'ledger.memberCount': {
    en: {one: '{{count}} member', other: '{{count}} members'},
    ko: {one: '멤버 {{count}}명', other: '멤버 {{count}}명'},
    ja: {one: 'メンバー{{count}}人', other: 'メンバー{{count}}人'},
    zh: {one: '{{count}} 位成员', other: '{{count}} 位成员'},
    id: {one: '{{count}} anggota', other: '{{count}} anggota'},
  },
  'ledger.itemCount': {
    en: {zero: 'No entries', one: '{{count}} entry', other: '{{count}} entries'},
    ko: {zero: '내역 없음', one: '내역 {{count}}건', other: '내역 {{count}}건'},
    ja: {zero: '記録なし', one: '{{count}}件', other: '{{count}}件'},
    zh: {zero: '暂无记录', one: '{{count}} 条记录', other: '{{count}} 条记录'},
    id: {
      zero: 'Belum ada catatan',
      one: '{{count}} catatan',
      other: '{{count}} catatan',
    },
  },
  'ledgerItem.commentCount': {
    en: {
      zero: 'No comments',
      one: '{{count}} comment',
      other: '{{count}} comments',
    },
    ko: {zero: '댓글 없음', one: '댓글 {{count}}개', other: '댓글 {{count}}개'},
    ja: {zero: 'コメントなし', one: 'コメント{{count}}件', other: 'コメント{{count}}件'},
    zh: {zero: '暂无评论', one: '{{count}} 条评论', other: '{{count}} 条评论'},
    id: {
      zero: 'Belum ada komentar',
      one: '{{count}} komentar',
      other: '{{count}} komentar',
    },
  },
};

/* -------------------------------------------------------------------------- */
/* 6. meta/*.json — native manifest strings, consumed by app.config.ts         */
/* -------------------------------------------------------------------------- */

/**
 * NOT part of the app string set: `.eslintignore` excludes `assets/langs/meta/`
 * from `i18n-json/identical-keys`, because these keys are native manifest
 * fields. Expo's `locales` field feeds them into `Info.plist`, which is what
 * gives the iOS permission dialogs per-locale text — the legacy `app.json` had
 * English-only `infoPlist` copy while the same sentences existed in five
 * languages inside `STRINGS.js` and were never used natively.
 *
 * The camera + location descriptions are the legacy `PERMISSION_REQUEST_*`
 * values, cleaned up (the ja/zh values ended in a stray `。.`). The photo
 * library description existed in `en` only and is authored here for the other
 * four. `NSFaceIDUsageDescription` is new: the app lock uses
 * expo-local-authentication.
 */
const META_CAMERA: Localized = {
  en: 'BooKoo needs access to your camera so you can attach a photo to an entry.',
  ko: 'BooKoo에서 내역에 사진을 첨부하려면 카메라 접근 권한이 필요합니다.',
  ja: 'BooKoo で記録に写真を添付するには、カメラへのアクセス権限が必要です。',
  zh: 'BooKoo 需要访问相机，以便你为记录添加照片。',
  id: 'BooKoo memerlukan akses kamera agar Anda dapat melampirkan foto ke catatan.',
};

const META_PHOTOS: Localized = {
  en: 'BooKoo needs access to your photo library so you can attach a photo to an entry.',
  ko: 'BooKoo에서 내역에 사진을 첨부하려면 사진 접근 권한이 필요합니다.',
  ja: 'BooKoo で記録に写真を添付するには、写真へのアクセス権限が必要です。',
  zh: 'BooKoo 需要访问相册，以便你为记录添加照片。',
  id: 'BooKoo memerlukan akses galeri agar Anda dapat melampirkan foto ke catatan.',
};

const META_LOCATION: Localized = {
  en: 'BooKoo needs your location so you can save where an entry happened.',
  ko: 'BooKoo에서 내역의 위치를 저장하려면 위치 접근 권한이 필요합니다.',
  ja: 'BooKoo で記録の場所を保存するには、位置情報へのアクセス権限が必要です。',
  zh: 'BooKoo 需要获取位置信息，以便保存记录发生的地点。',
  id: 'BooKoo memerlukan lokasi Anda untuk menyimpan tempat terjadinya catatan.',
};

const META_FACE_ID: Localized = {
  en: 'BooKoo uses Face ID to unlock the app.',
  ko: 'BooKoo 잠금을 해제하는 데 Face ID를 사용합니다.',
  ja: 'BooKoo のロック解除に Face ID を使用します。',
  zh: 'BooKoo 使用面容 ID 解锁应用。',
  id: 'BooKoo menggunakan Face ID untuk membuka kunci aplikasi.',
};

const metaFor = (locale: Locale): Tree => ({
  android: {app_name: 'BooKoo'},
  ios: {
    CFBundleDisplayName: 'BooKoo',
    NSCameraUsageDescription: META_CAMERA[locale],
    NSFaceIDUsageDescription: META_FACE_ID[locale],
    NSLocationWhenInUseUsageDescription: META_LOCATION[locale],
    NSPhotoLibraryUsageDescription: META_PHOTOS[locale],
  },
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `STRINGS.js` is a single `const STRINGS = {...}; export default STRINGS;`
 * with no imports, so turning the export into a `return` and evaluating it is
 * enough. Doing it in memory avoids the temp-`.cjs`-file dance and leaves
 * nothing behind if the run dies half-way.
 */
const loadLegacy = (): LegacyStrings => {
  const source = readFileSync(LEGACY_STRINGS, 'utf8').replace(
    /export\s+default\s+STRINGS;?\s*$/,
    'return STRINGS;',
  );

  const load = new Function(source) as () => LegacyStrings;

  return load();
};

/** NFC + trim. Fixes the Indonesian `"TAMBAHAN "` trailing space, among others. */
const normalize = (value: string): string => value.normalize('NFC').trim();

const setDeep = (tree: Tree, dottedKey: string, value: Leaf): void => {
  const parts = dottedKey.split('.');
  let cursor: Tree = tree;

  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];

    if (next === undefined) {
      const created: Tree = {};

      cursor[part] = created;
      cursor = created;

      continue;
    }

    if (typeof next === 'string' || isPluralForms(next)) {
      throw new Error(`Key collision: "${dottedKey}" runs through a leaf.`);
    }

    cursor = next;
  }

  cursor[parts[parts.length - 1]] = value;
};

const isPluralForms = (value: Leaf | Tree): value is PluralForms =>
  typeof value === 'object' && typeof (value as PluralForms).other === 'string';

/**
 * Plain `.sort()` on purpose — that is exactly what `i18n-json/sorted-keys`
 * does (`keyTraversals.asc = obj => Object.keys(obj).sort()`), and
 * `localeCompare` would produce a different order for mixed-case camelCase.
 */
const sortDeep = (tree: Tree): Tree => {
  const out: Tree = {};

  for (const key of Object.keys(tree).sort()) {
    const value = tree[key];

    if (typeof value === 'string') {
      out[key] = value;

      continue;
    }

    // A plural object is a leaf to the app but a nested object to the linter,
    // so `zero` / `one` / `other` get sorted too.
    out[key] = isPluralForms(value)
      ? (sortDeep(value as unknown as Tree) as unknown as PluralForms)
      : sortDeep(value as Tree);
  }

  return out;
};

const writeJson = (path: string, value: Tree, check: boolean): boolean => {
  const next = `${JSON.stringify(value, null, 2)}\n`;

  if (check) {
    let current: string;

    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = '';
    }

    return current === next;
  }

  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, next, 'utf8');

  return true;
};

/* -------------------------------------------------------------------------- */
/* Coverage assertions                                                        */
/* -------------------------------------------------------------------------- */

interface Coverage {
  readonly unmapped: string[];
  readonly orphanMappings: string[];
  readonly strayKeys: {locale: Locale; key: string}[];
  readonly filledFromEn: {locale: Locale; key: string}[];
}

const assertLegacyCoverage = (legacy: LegacyStrings): Coverage => {
  const unmapped: string[] = [];
  const strayKeys: {locale: Locale; key: string}[] = [];
  const filledFromEn: {locale: Locale; key: string}[] = [];

  const enKeys = Object.keys(legacy.en);

  for (const key of enKeys) {
    if (!(key in KEY_MAP) && !(key in DROPPED)) {
      unmapped.push(key);
    }
  }

  for (const locale of LOCALES) {
    for (const key of Object.keys(legacy[locale])) {
      if (!(key in legacy.en) && !(key in DROPPED)) {
        strayKeys.push({locale, key});
      }
    }

    if (locale === 'en') {
      continue;
    }

    for (const [key, newKey] of Object.entries(KEY_MAP)) {
      // An override supplies the value outright, so a gap in the legacy file
      // is already closed and does not belong on the to-do list.
      if (VALUE_OVERRIDE[newKey]?.[locale] !== undefined) {
        continue;
      }

      if (legacy[locale][key] === undefined && legacy.en[key] !== undefined) {
        filledFromEn.push({locale, key});
      }
    }
  }

  const orphanMappings = Object.keys(KEY_MAP).filter(
    (key) => legacy.en[key] === undefined,
  );

  return {unmapped, orphanMappings, strayKeys, filledFromEn};
};

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

const buildLocale = (legacy: LegacyStrings, locale: Locale): Tree => {
  const tree: Tree = {};

  for (const [legacyKey, newKey] of Object.entries(KEY_MAP)) {
    const override = VALUE_OVERRIDE[newKey];
    const raw =
      override?.[locale] ?? legacy[locale][legacyKey] ?? legacy.en[legacyKey];

    if (raw === undefined) {
      throw new Error(`[${locale}] no value at all for "${legacyKey}".`);
    }

    setDeep(tree, newKey, normalize(raw));
  }

  for (const [newKey, values] of Object.entries(NEW_STRINGS)) {
    setDeep(tree, newKey, normalize(values[locale]));
  }

  for (const [newKey, forms] of Object.entries(NEW_PLURALS)) {
    const localized = forms[locale];
    const value: PluralForms = {
      ...(localized.zero === undefined ? {} : {zero: normalize(localized.zero)}),
      one: normalize(localized.one),
      other: normalize(localized.other),
    };

    setDeep(tree, newKey, value);
  }

  return sortDeep(tree);
};

/** `ANNOUNCEMENT_*` / `FAQ_*` — content rows, not UI chrome. */
const buildLegacyContent = (
  legacy: LegacyStrings,
): {
  announcements: {order: number; locale: Locale; title: string; body: string}[];
  faqs: {order: number; locale: Locale; question: string; answer: string}[];
} => {
  const announcements = [];
  const faqs = [];

  for (let order = 1; order <= 9; order += 1) {
    for (const locale of LOCALES) {
      const title = legacy[locale][`ANNOUNCEMENT_${order}`];
      const body = legacy[locale][`ANNOUNCEMENT_TXT_${order}`];

      if (title !== undefined && body !== undefined) {
        announcements.push({
          order,
          locale,
          title: normalize(title),
          body: normalize(body),
        });
      }
    }
  }

  for (let order = 1; order <= 11; order += 1) {
    for (const locale of LOCALES) {
      const question = legacy[locale][`FAQ_${order}`];
      const answer = legacy[locale][`FAQ_TXT_${order}`];

      if (question !== undefined && answer !== undefined) {
        faqs.push({
          order,
          locale,
          question: normalize(question),
          answer: normalize(answer),
        });
      }
    }
  }

  return {announcements, faqs};
};

const countLeaves = (tree: Tree): number =>
  Object.values(tree).reduce<number>(
    (total, value) =>
      typeof value === 'string' || isPluralForms(value)
        ? total + 1
        : total + countLeaves(value as Tree),
    0,
  );

const flatKeys = (tree: Tree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return typeof value === 'string' || isPluralForms(value)
      ? [path]
      : flatKeys(value as Tree, path);
  });

/* -------------------------------------------------------------------------- */
/* main                                                                       */
/* -------------------------------------------------------------------------- */

const main = (): void => {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const contentOutArg = argv.find((arg) => arg.startsWith('--content-out='));
  const contentOut = contentOutArg?.slice('--content-out='.length);

  const legacy = loadLegacy();
  const coverage = assertLegacyCoverage(legacy);

  const log = (line: string): void => {
    // eslint-disable-next-line no-console
    console.log(line);
  };

  log('');
  log('convert-legacy-strings');
  log(`  source     ${relative(ROOT, LEGACY_STRINGS)}`);
  log(`  legacy en  ${Object.keys(legacy.en).length} keys`);
  log(`  mapped     ${Object.keys(KEY_MAP).length}`);
  log(`  dropped    ${Object.keys(DROPPED).length}`);
  log(`  authored   ${Object.keys(NEW_STRINGS).length} strings, ${
    Object.keys(NEW_PLURALS).length
  } plurals`);

  /* -- what was dropped, grouped by reason -------------------------------- */
  log('');
  log('  DROPPED');

  const byReason = new Map<DropReason, string[]>();

  for (const [key, reason] of Object.entries(DROPPED)) {
    const bucket = byReason.get(reason) ?? [];

    bucket.push(key);
    byReason.set(reason, bucket);
  }

  for (const [reason, keys] of [...byReason.entries()].sort()) {
    log(`    ${reason} (${keys.length}) — ${DROP_REASON_TEXT[reason]}`);
    log(`      ${keys.sort().join(' ')}`);
  }

  /* -- what could not be mapped ------------------------------------------- */
  log('');
  log('  UNMAPPED');

  if (coverage.unmapped.length === 0) {
    log('    (none) — every legacy `en` key is mapped or deliberately dropped');
  } else {
    for (const key of coverage.unmapped) {
      log(`    ${key}`);
    }
  }

  if (coverage.orphanMappings.length > 0) {
    log('');
    log('  ORPHAN MAPPINGS (in KEY_MAP but not in the legacy file)');

    for (const key of coverage.orphanMappings) {
      log(`    ${key}`);
    }
  }

  if (coverage.strayKeys.length > 0) {
    log('');
    log('  STRAY LOCALE KEYS (present in one locale only, not in `en`)');

    for (const {locale, key} of coverage.strayKeys) {
      log(`    ${locale}: ${key}`);
    }
  }

  /* -- what had to be back-filled from en --------------------------------- */
  log('');
  log('  FILLED FROM en (needs a real translation)');

  if (coverage.filledFromEn.length === 0) {
    log('    (none)');
  } else {
    for (const {locale, key} of coverage.filledFromEn) {
      log(`    ${locale}: ${key} → ${KEY_MAP[key]}`);
    }
  }

  /* -- emit ---------------------------------------------------------------- */
  const trees = new Map<Locale, Tree>();

  for (const locale of LOCALES) {
    trees.set(locale, buildLocale(legacy, locale));
  }

  const reference = flatKeys(trees.get('ko') as Tree);
  const drift: string[] = [];

  for (const locale of LOCALES) {
    const keys = flatKeys(trees.get(locale) as Tree);

    if (
      keys.length !== reference.length ||
      keys.some((key, index) => key !== reference[index])
    ) {
      drift.push(locale);
    }
  }

  if (drift.length > 0) {
    throw new Error(
      `Key sets diverge from ko.json in: ${drift.join(', ')}. ` +
        'Every table entry must cover all five locales.',
    );
  }

  log('');
  log(`  EMIT (${check ? 'check only' : 'writing'})`);

  let stale = false;

  for (const locale of LOCALES) {
    const tree = trees.get(locale) as Tree;
    const path = join(LANGS_DIR, `${locale}.json`);
    const ok = writeJson(path, tree, check);

    stale ||= !ok;
    log(
      `    ${relative(ROOT, path)}  ${countLeaves(tree)} keys${
        ok ? '' : '  ← STALE'
      }`,
    );
  }

  for (const locale of LOCALES) {
    const path = join(META_DIR, `${locale}.json`);
    const ok = writeJson(path, sortDeep(metaFor(locale)), check);

    stale ||= !ok;
    log(`    ${relative(ROOT, path)}${ok ? '' : '  ← STALE'}`);
  }

  if (contentOut !== undefined) {
    const content = buildLegacyContent(legacy);
    const path = resolve(ROOT, contentOut);

    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
    log(
      `    ${relative(ROOT, path)}  ${content.announcements.length} announcements, ${
        content.faqs.length
      } faqs`,
    );
  } else {
    const content = buildLegacyContent(legacy);

    log('');
    log(
      `  CONVEX CONTENT not written (${content.announcements.length} announcement rows, ${content.faqs.length} faq rows).`,
    );
    log(
      '    Pass --content-out=<path> to emit them; they belong in a Convex seed,',
    );
    log('    not in assets/langs/. See .notes/research/04 §8.4.');
  }

  log('');

  if (check && stale) {
    throw new Error(
      'assets/langs is out of date. Run `bun scripts/convert-legacy-strings.ts`.',
    );
  }
};

main();
