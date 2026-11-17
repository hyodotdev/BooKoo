import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import {join, resolve} from 'node:path';

import {SYSTEM_CATEGORIES} from '../../shared/categories';
import {classifyTriple} from './lib/categories';
import {offsetOf, resolveOccurredAt, toDayKey, toMonthKey} from './lib/dates';
import {normalizeEmail} from './lib/email';
import {canonical, sha256} from './lib/hash';
import {decodeLegacyKey, isPushId, pushIdToMillis} from './lib/keys';
import {parseAmountEvidence, toMoney} from './lib/money';
import {
  iterateLedgers,
  objectOf,
  readPictures,
  readReviews,
  type JsonObject,
} from './lib/rtdb';
import {readJsonl, writeJsonl} from './lib/jsonl';

type Row = Record<string, unknown>;
type Rows = Record<string, Row[]>;

interface AuthUser extends JsonObject {
  localId?: unknown;
  email?: unknown;
  emailVerified?: unknown;
  displayName?: unknown;
  photoUrl?: unknown;
  providerUserInfo?: unknown;
  createdAt?: unknown;
  lastSignedInAt?: unknown;
  disabled?: unknown;
}

interface StorageManifestRow extends JsonObject {
  name?: unknown;
  md5Hash?: unknown;
}

export interface NormalizeInput {
  root: JsonObject;
  authUsers: AuthUser[];
  storageManifest: StorageManifestRow[];
  importedAt: number;
  runId: string;
  onlyLedger?: string;
}

export interface NormalizeOutput {
  rows: Rows;
  reports: Record<string, unknown>;
  summary: Record<string, number>;
}

const OUTPUT_FILES: Readonly<Record<string, string>> = {
  legacyUsers: 'convex/legacyUsers.jsonl',
  placeholders: 'convex/placeholders.jsonl',
  ledgers: 'convex/ledgers.jsonl',
  ledgerMembers: 'convex/ledgerMembers.jsonl',
  joinRequests: 'convex/joinRequests.jsonl',
  invites: 'convex/invites.jsonl',
  legacyInvites: 'convex/legacyInvites.jsonl',
  categories: 'convex/categories.jsonl',
  items: 'convex/items.jsonl',
  comments: 'convex/comments.jsonl',
  photos: 'convex/photos.jsonl',
  feedback: 'normalized/feedback.jsonl',
  anomalies: 'reports/anomalies.jsonl',
};

const LEDGER_COLORS = [
  'PINK',
  'ORANGE',
  'YELLOW',
  'TEAL',
  'BLUE',
  'PURPLE',
] as const;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const JOIN_REQUEST_TTL = 14 * DAY;

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const numberValue = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed)
    ? parsed
    : undefined;
};

const parseTime = (value: unknown): number | undefined => {
  const number = numberValue(value);
  if (number !== undefined && number > 0) return number;
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const rawArchive = (value: unknown): string => {
  const serialized = canonical(value);
  if (Buffer.byteLength(serialized, 'utf8') <= 64 * 1024) return serialized;
  return canonical({_truncated: true, sha256: sha256(serialized)});
};

const sortedEntries = (value: unknown): [string, unknown][] =>
  Object.entries(objectOf(value)).sort(([left], [right]) =>
    left.localeCompare(right),
  );

const rootOf = (root: JsonObject): JsonObject => {
  const nested = objectOf(root.bookoo);
  return Object.keys(nested).length > 0 ? nested : root;
};

const providerIds = (auth: AuthUser | undefined): string[] => {
  if (!Array.isArray(auth?.providerUserInfo)) return [];
  return auth.providerUserInfo
    .flatMap((value) => {
      const provider = stringValue(objectOf(value).providerId);
      return provider === undefined ? [] : [provider];
    })
    .sort();
};

const assertSafeAuth = (users: readonly AuthUser[]): void => {
  for (const user of users) {
    if ('passwordHash' in user || 'salt' in user)
      throw new Error('unsafe Auth export contains password material');
  }
};

const addToSetMap = (
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void => {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
};

const electCurrency = (
  items: readonly JsonObject[],
): {
  baseCurrency: string;
  source: 'AMOUNT_VOTE' | 'DEFAULT';
  lowConfidence: boolean;
} => {
  const votes = new Map<string, number>();
  for (const item of items) {
    const evidence = parseAmountEvidence(item.amount);
    if (evidence === 'UNKNOWN' || evidence === 'OTHER') continue;
    votes.set(evidence, (votes.get(evidence) ?? 0) + 1);
  }
  if (votes.size > 0) {
    const winner = [...votes.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]?.[0];
    if (winner === undefined) throw new Error('currency vote invariant failed');
    return {baseCurrency: winner, source: 'AMOUNT_VOTE', lowConfidence: false};
  }
  const magnitudes = items
    .flatMap((item) => {
      const amount = numberValue(item.realAmount);
      return amount === undefined || amount === 0 ? [] : [Math.abs(amount)];
    })
    .sort((left, right) => left - right);
  const median =
    magnitudes.length === 0
      ? 0
      : (magnitudes[Math.floor(magnitudes.length / 2)] ?? 0);
  return {
    baseCurrency: 'KRW',
    source: 'DEFAULT',
    lowConfidence: magnitudes.length > 0 && median < 1000,
  };
};

const photoPathFromUrl = (url: string | undefined): string | undefined => {
  if (url === undefined) return undefined;
  if (url.startsWith('data:')) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const marker = '/o/';
      const start = parsed.pathname.indexOf(marker);
      return start < 0
        ? undefined
        : decodeURIComponent(parsed.pathname.slice(start + marker.length));
    }
    if (parsed.hostname === 'storage.googleapis.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments.length < 2 ? undefined : segments.slice(1).join('/');
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const legacyCreated = (key: string, importedAt: number): number =>
  pushIdToMillis(key) ?? importedAt;

export function normalizeDataset(input: NormalizeInput): NormalizeOutput {
  assertSafeAuth(input.authUsers);
  const root = rootOf(input.root);
  const usersRoot = objectOf(root.users);
  const opinionsRoot = objectOf(root.opinions);
  const rows: Rows = Object.fromEntries(
    Object.keys(OUTPUT_FILES).map((name) => [name, []]),
  );
  const authoredLedgers = new Map<string, Set<string>>();
  const referencedUids = new Set<string>(['__unknown__']);
  const validLedgers = new Map<string, JsonObject>();
  const storageNames = new Set<string>();
  const storageMd5 = new Map<string, string>();
  for (const manifest of input.storageManifest) {
    const name = stringValue(manifest.name);
    const md5 = stringValue(manifest.md5Hash);
    if (name !== undefined) storageNames.add(name);
    if (name !== undefined && md5 !== undefined) storageMd5.set(name, md5);
  }

  const anomaly = (
    kind: string,
    sourcePath: string,
    legacyKey: string,
    table: string,
    producedRow: boolean,
    detail: Record<string, unknown>,
    raw?: unknown,
  ): void => {
    rows.anomalies?.push({
      document: {
        kind,
        sourcePath,
        legacyKey,
        table,
        producedRow,
        detailJson: canonical(detail),
        rawJson: raw === undefined ? undefined : rawArchive(raw),
        createdAt: input.importedAt,
      },
    });
  };

  for (const {key: ledgerKey, value: ledger} of iterateLedgers(root)) {
    if (input.onlyLedger !== undefined && input.onlyLedger !== ledgerKey)
      continue;
    const info = objectOf(ledger.info);
    const owner = stringValue(ledger.owner);
    const members = objectOf(ledger.members);
    if (Object.keys(info).length === 0 || owner === undefined) {
      for (const [orphanKey, orphanNode] of sortedEntries(ledger)) {
        anomaly(
          'ORPHAN_ITEM_NO_LEDGER',
          `bookoo/ledgers/${ledgerKey}/${orphanKey}`,
          '',
          'ledgerItems',
          false,
          {reason: 'ITEM_OUTSIDE_LEDGER'},
          orphanNode,
        );
        const writer = stringValue(objectOf(orphanNode).writer);
        if (writer !== undefined) referencedUids.add(writer);
        else referencedUids.add('__unknown__');
      }
      continue;
    }
    validLedgers.set(ledgerKey, ledger);
    referencedUids.add(owner);
    for (const uid of Object.keys(members)) referencedUids.add(uid);
    for (const uid of Object.keys(objectOf(ledger.requests)))
      referencedUids.add(uid);
    for (const [itemKey, rawItem] of sortedEntries(ledger.items)) {
      const item = objectOf(rawItem);
      const writer = stringValue(item.writer) ?? '__unknown__';
      referencedUids.add(writer);
      addToSetMap(authoredLedgers, writer, ledgerKey);
      for (const review of readReviews(item)) {
        const reviewWriter = stringValue(review.value.writer) ?? '__unknown__';
        referencedUids.add(reviewWriter);
        addToSetMap(authoredLedgers, reviewWriter, ledgerKey);
      }
      if (itemKey.length === 0) throw new Error('empty item key');
    }
  }
  for (const opinion of Object.values(opinionsRoot)) {
    const uid = stringValue(objectOf(objectOf(opinion).user).uid);
    if (uid !== undefined) referencedUids.add(uid);
  }

  const authByUid = new Map<string, AuthUser>();
  for (const auth of input.authUsers) {
    const uid = stringValue(auth.localId);
    if (uid === undefined) throw new Error('Auth user without localId');
    authByUid.set(uid, auth);
  }
  const allUids = new Set([
    ...Object.keys(usersRoot),
    ...authByUid.keys(),
    ...referencedUids,
  ]);
  const emailGroups = new Map<string, string[]>();
  for (const uid of [...allUids].sort()) {
    const auth = authByUid.get(uid);
    const info = objectOf(objectOf(usersRoot[uid]).info);
    const rawEmail = stringValue(info.email) ?? stringValue(auth?.email);
    const normalized = normalizeEmail(rawEmail);
    if (normalized !== undefined) {
      const group = emailGroups.get(normalized) ?? [];
      group.push(uid);
      emailGroups.set(normalized, group);
    }
  }

  for (const uid of [...allUids].sort()) {
    const auth = authByUid.get(uid);
    const rtdbUser = objectOf(usersRoot[uid]);
    const info = objectOf(rtdbUser.info);
    const providers = providerIds(auth);
    const emailRaw = stringValue(info.email) ?? stringValue(auth?.email);
    const emailNormalized = normalizeEmail(emailRaw);
    const duplicate =
      emailNormalized !== undefined &&
      (emailGroups.get(emailNormalized)?.length ?? 0) > 1;
    const synthesized = auth === undefined && usersRoot[uid] === undefined;
    const createdAt = numberValue(auth?.createdAt) ?? input.importedAt;
    const claimState = duplicate
      ? 'ambiguous'
      : providers.length === 1 &&
          providers[0] === 'facebook.com' &&
          emailNormalized === undefined
        ? 'orphan_no_email'
        : 'unclaimed';
    const legacyLedgerKeys = Object.keys(objectOf(rtdbUser.ledgers)).sort();
    const document = {
      legacyUid: uid,
      emailNormalized,
      emailRaw,
      emailVerifiedAt: auth?.emailVerified === true ? createdAt : undefined,
      displayName:
        stringValue(info.displayName) ?? stringValue(auth?.displayName),
      photoURL:
        stringValue(info.photoURL)?.trim() ||
        stringValue(auth?.photoUrl)?.trim() ||
        undefined,
      statusMsg: stringValue(info.statusMsg),
      tel: stringValue(info.tel),
      providers,
      legacyCreatedAt: createdAt,
      legacyLastSignInAt: numberValue(auth?.lastSignedInAt),
      legacyDisabled: auth?.disabled === true,
      synthesizedFromReference: synthesized,
      legacyLedgerKeys,
      authoredLedgerKeys: [...(authoredLedgers.get(uid) ?? [])].sort(),
      claimState,
    };
    rows.legacyUsers?.push(document);
    const avatarLegacySourcePath =
      emailRaw !== undefined && document.photoURL !== undefined
        ? `users/${emailRaw}`
        : undefined;
    const avatarMigrationState =
      document.photoURL === undefined
        ? 'NATIVE'
        : document.photoURL.startsWith('data:') ||
            (avatarLegacySourcePath !== undefined &&
              storageNames.has(avatarLegacySourcePath))
          ? 'PENDING'
          : 'MISSING';
    rows.placeholders?.push({
      legacyUid: uid,
      user: {
        name: document.displayName,
        email: document.emailRaw,
        image: document.photoURL,
      },
      document: {
        emailNormalized,
        displayName: document.displayName ?? '',
        bio: document.statusMsg ?? '',
        phone: document.tel ?? '',
        locale: 'ko',
        appearance: 'SYSTEM',
        preferredCurrency: 'KRW',
        preferredTimeZone: 'Asia/Seoul',
        preferredWeekStartsOn: 0,
        pushEnabled: true,
        notifyLedgerActivity: true,
        notifyComments: true,
        notifyInvites: true,
        appRole: 'USER',
        onboardingStep: 'handle',
        legacyUid: uid,
        legacyClaimState: 'none',
        isPlaceholder: true,
        avatarLegacyUrl: document.photoURL,
        avatarLegacySourcePath,
        avatarMigrationState,
        avatarAttempts: 0,
        createdAt,
        updatedAt: input.importedAt,
        legacyKey: uid,
        legacyCreatedAt: createdAt,
        legacyRaw: rawArchive(rtdbUser),
      },
    });
    if (avatarMigrationState === 'MISSING')
      anomaly(
        'PHOTO_OBJECT_MISSING',
        `bookoo/users/${uid}/info/photoURL`,
        uid,
        'userProfiles',
        true,
        {reason: 'AVATAR_STORAGE_OBJECT_ABSENT'},
      );
    if (duplicate) {
      anomaly(
        'DUPLICATE_NORMALIZED_EMAIL',
        `bookoo/users/${uid}`,
        uid,
        'legacyUsers',
        true,
        {duplicateCount: emailGroups.get(emailNormalized!)?.length ?? 0},
      );
    }
    if (synthesized && uid !== '__unknown__') {
      anomaly(
        'WRITER_UID_UNKNOWN',
        `bookoo/users/${uid}`,
        uid,
        'legacyUsers',
        true,
        {reason: 'SYNTHESIZED_FROM_REFERENCE'},
      );
    }
  }

  const emailByUid = new Map(
    (rows.legacyUsers ?? []).map((row) => [
      String(row.legacyUid),
      stringValue(row.emailNormalized),
    ]),
  );
  const ledgerCreatedAt = new Map<string, number>();
  const itemRowsByLedger = new Map<string, JsonObject[]>();
  for (const [ledgerKey, ledger] of [...validLedgers.entries()].sort()) {
    const items = sortedEntries(ledger.items).map(([, item]) => objectOf(item));
    itemRowsByLedger.set(ledgerKey, items);
    const election = electCurrency(items);
    const createdAt = legacyCreated(ledgerKey, input.importedAt);
    ledgerCreatedAt.set(ledgerKey, createdAt);
    const info = objectOf(ledger.info);
    const owner = stringValue(ledger.owner);
    if (owner === undefined) throw new Error('valid ledger owner missing');
    const color = numberValue(info.color);
    rows.ledgers?.push({
      legacyKey: ledgerKey,
      legacyOwnerUid: owner,
      document: {
        title: String(info.title ?? ''),
        description: String(info.description ?? ''),
        colorKey: LEDGER_COLORS[color ?? -1] ?? 'TEAL',
        baseCurrency: election.baseCurrency,
        currencyIsAssumed: true,
        legacyCurrencySource: election.source,
        timeZone: 'Asia/Seoul',
        timeZoneIsAssumed: true,
        weekStartsOn: 0,
        periodStartDay: 1,
        itemWritePolicy: 'AUTHOR_ONLY',
        invitePolicy: 'MANAGERS_ONLY',
        memberCount: 0,
        archivedAt: ledger.visible === false ? createdAt : undefined,
        maintenanceLock: 'NONE',
        rollupVersion: 1,
        legacyOwnerUid: owner,
        createdAt,
        updatedAt: input.importedAt,
        legacyKey: ledgerKey,
        legacyCreatedAt: createdAt,
        legacyRaw: rawArchive(ledger),
      },
    });
    if (election.lowConfidence) {
      const magnitudes = items
        .flatMap((item) => {
          const amount = numberValue(item.realAmount);
          return amount === undefined ? [] : [Math.abs(amount)];
        })
        .sort((left, right) => left - right);
      anomaly(
        'CURRENCY_EVIDENCE_MISMATCH',
        `bookoo/ledgers/${ledgerKey}`,
        ledgerKey,
        'ledgers',
        true,
        {
          reason: 'MAGNITUDE_PROFILE',
          medianAbs: magnitudes[Math.floor(magnitudes.length / 2)] ?? 0,
        },
      );
    }
    if (ledger.visible === false)
      anomaly(
        'LEDGER_NOT_VISIBLE',
        `bookoo/ledgers/${ledgerKey}`,
        ledgerKey,
        'ledgers',
        true,
        {resolution: 'ARCHIVED'},
      );
    const memberUids = Object.keys(objectOf(ledger.members)).sort();
    if (!memberUids.includes(owner)) memberUids.push(owner);
    memberUids.sort();
    for (const [sortOrder, uid] of memberUids.entries()) {
      rows.ledgerMembers?.push({
        legacyKey: `${ledgerKey}/${uid}`,
        legacyLedgerKey: ledgerKey,
        legacyUid: uid,
        document: {
          role: uid === owner ? 'OWNER' : 'MEMBER',
          joinedAt: createdAt,
          joinedVia: 'LEGACY_IMPORT',
          legacyUid: uid,
          createdAt,
          updatedAt: input.importedAt,
          legacyKey: `${ledgerKey}/${uid}`,
          legacyCreatedAt: createdAt,
          legacyRaw: rawArchive(objectOf(ledger.members)[uid]),
        },
        state: {
          lastReadAt: 0,
          lastOpenedAt: 0,
          muted: false,
          notifyNewItem: true,
          notifyComment: true,
          sortOrder,
          updatedAt: input.importedAt,
        },
      });
    }
    for (const uid of Object.keys(objectOf(ledger.requests)).sort()) {
      rows.joinRequests?.push({
        legacyKey: `${ledgerKey}/${uid}`,
        legacyLedgerKey: ledgerKey,
        legacyUid: uid,
        document: {
          status: 'PENDING',
          source: 'LEGACY_REQUEST',
          requestedAt: input.importedAt,
          expiresAt: input.importedAt + JOIN_REQUEST_TTL,
          createdAt: input.importedAt,
          updatedAt: input.importedAt,
          legacyKey: `${ledgerKey}/${uid}`,
          legacyCreatedAt: input.importedAt,
          legacyRaw: rawArchive(objectOf(ledger.requests)[uid]),
        },
      });
    }
  }

  for (const [uid, rawUser] of sortedEntries(usersRoot)) {
    const mirrors = Object.keys(objectOf(objectOf(rawUser).ledgers));
    for (const ledgerKey of mirrors.sort()) {
      const ledger = validLedgers.get(ledgerKey);
      if (ledger !== undefined && uid in objectOf(ledger.members)) continue;
      anomaly(
        'DANGLING_MEMBERSHIP_POINTER',
        `bookoo/users/${uid}/ledgers/${ledgerKey}`,
        `${uid}/${ledgerKey}`,
        'ledgerMembers',
        false,
        {reason: 'MIRROR_NOT_AUTHORITATIVE'},
      );
    }
  }

  const customByLedger = new Map<string, Map<string, Row>>();
  const categoryReport: Row[] = [];
  const ledgerCurrencyByKey = new Map(
    (rows.ledgers ?? []).map((row) => [
      String(row.legacyKey),
      String(objectOf(row.document).baseCurrency),
    ]),
  );
  for (const [ledgerKey, ledger] of [...validLedgers.entries()].sort()) {
    const baseCurrency = ledgerCurrencyByKey.get(ledgerKey) ?? 'KRW';
    const createdAt = ledgerCreatedAt.get(ledgerKey) ?? input.importedAt;
    for (const [itemKey, rawItem] of sortedEntries(ledger.items)) {
      const item = objectOf(rawItem);
      if (!('realAmount' in item) && !('amount' in item) && 'reviews' in item) {
        const itemLegacyKey = `${ledgerKey}/${itemKey}`;
        anomaly(
          'GHOST_ITEM_ONLY_REVIEWS',
          `bookoo/ledgers/${ledgerKey}/items/${itemKey}`,
          itemLegacyKey,
          'ledgerItems',
          false,
          {reason: 'ITEM_NODE_HAS_ONLY_REVIEWS'},
          item,
        );
        for (const review of readReviews(item))
          anomaly(
            'GHOST_ITEM_ONLY_REVIEWS',
            `bookoo/ledgers/${ledgerKey}/items/${itemKey}/reviews/${review.key}`,
            `${itemLegacyKey}/${review.key}`,
            'itemComments',
            false,
            {reason: 'PARENT_ITEM_MISSING'},
            review.value,
          );
        continue;
      }
      if (numberValue(item.realAmount) === undefined)
        throw new Error(
          'valid ledger contains an item without finite realAmount',
        );
      const category = objectOf(item.category);
      const categoryKindValue = numberValue(category.category);
      const legacyCategoryKind =
        categoryKindValue === 0 || categoryKindValue === 1
          ? categoryKindValue
          : undefined;
      const money = toMoney(item.realAmount, legacyCategoryKind, baseCurrency);
      const iconValue = numberValue(category.iconId);
      const iconId =
        iconValue !== undefined && Number.isSafeInteger(iconValue)
          ? iconValue
          : undefined;
      const label = stringValue(category.txt);
      const classified = classifyTriple(iconId, label, money.type);
      if (classified.source === 'CUSTOM') {
        const map = customByLedger.get(ledgerKey) ?? new Map<string, Row>();
        map.set(classified.key, {
          legacyLedgerKey: ledgerKey,
          key: classified.key,
          document: {
            key: classified.key,
            source: 'CUSTOM',
            kind: classified.kind,
            iconKey: classified.iconKey,
            colorToken: classified.colorToken,
            label: classified.label,
            sortOrder: classified.sortOrder + map.size,
            legacyIconId: classified.legacyIconId,
            legacyLabel: classified.label,
            createdAt,
            updatedAt: input.importedAt,
          },
        });
        customByLedger.set(ledgerKey, map);
      }
      categoryReport.push({
        ledgerKeyHash: sha256(ledgerKey).slice(0, 12),
        key: classified.key,
        source: classified.source,
        kind: classified.kind,
      });
      const itemLegacyKey = `${ledgerKey}/${itemKey}`;
      const date = resolveOccurredAt(itemKey, item);
      const evidence = parseAmountEvidence(item.amount);
      const knownEvidence = evidence !== 'UNKNOWN' && evidence !== 'OTHER';
      const currencyMismatch = knownEvidence && evidence !== baseCurrency;
      const categoryKindConflict = classified.kind !== money.type;
      const needsReview =
        currencyMismatch || categoryKindConflict || money.anomalies.length > 0;
      for (const kind of money.anomalies)
        anomaly(
          kind,
          `bookoo/ledgers/${ledgerKey}/items/${itemKey}`,
          itemLegacyKey,
          'ledgerItems',
          true,
          {realAmount: item.realAmount},
        );
      for (const kind of date.anomalies)
        anomaly(
          kind,
          `bookoo/ledgers/${ledgerKey}/items/${itemKey}`,
          itemLegacyKey,
          'ledgerItems',
          true,
          {writerOffsetMinutes: date.writerOffsetMinutes},
        );
      if (currencyMismatch)
        anomaly(
          'CURRENCY_EVIDENCE_MISMATCH',
          `bookoo/ledgers/${ledgerKey}/items/${itemKey}`,
          itemLegacyKey,
          'ledgerItems',
          true,
          {reason: 'ITEM_EVIDENCE', evidence, baseCurrency},
        );
      if (categoryKindConflict)
        anomaly(
          'CATEGORY_KIND_CONFLICT',
          `bookoo/ledgers/${ledgerKey}/items/${itemKey}`,
          itemLegacyKey,
          'ledgerItems',
          true,
          {itemType: money.type, categoryKind: classified.kind},
        );
      const itemCreatedAt =
        parseTime(item.created) ??
        parseTime(item.updated) ??
        pushIdToMillis(itemKey) ??
        date.occurredAt;
      const updatedAt = parseTime(item.updated) ?? itemCreatedAt;
      const location = objectOf(item.location);
      const lat = numberValue(location.latitude);
      const lng = numberValue(location.longitude);
      const place =
        lat === undefined || lng === undefined
          ? undefined
          : {
              label: String(location.street ?? location.name ?? 'Unknown'),
              lat,
              lng,
              address:
                location.city === undefined
                  ? undefined
                  : [location.city, location.region].filter(Boolean).join(' '),
              countryCode: stringValue(location.isoCountryCode),
            };
      const writer = stringValue(item.writer) ?? '__unknown__';
      rows.items?.push({
        legacyKey: itemLegacyKey,
        legacyLedgerKey: ledgerKey,
        legacyWriterUid: writer,
        document: {
          type: money.type,
          amountMinor: money.amountMinor,
          currency: baseCurrency,
          baseCurrency,
          baseAmountMinor: money.amountMinor,
          occurredAt: date.occurredAt,
          dayKey: toDayKey(date.occurredAt, 'Asia/Seoul'),
          monthKey: toMonthKey(date.occurredAt, 'Asia/Seoul'),
          occurredOffsetMinutes: offsetOf(date.occurredAt, 'Asia/Seoul'),
          categoryKey: classified.key,
          memo: String(item.memo ?? ''),
          place,
          photoCount: 0,
          commentCount: 0,
          legacyLedgerKey: ledgerKey,
          legacyWriterUid: writer,
          legacyRealAmount: item.realAmount,
          legacyAmountString: stringValue(item.amount),
          legacyCurrencyEvidence: evidence,
          legacyCategoryIconId: iconId,
          legacyCategoryTxt: label,
          legacyCategoryKind,
          legacySelectedDate: date.selectedDate,
          legacyDateSource: date.source,
          legacyUpdatedAt: parseTime(item.updated),
          legacyChecksum: sha256(canonical(item)),
          needsReview: needsReview || undefined,
          createdAt: itemCreatedAt,
          updatedAt,
          legacyKey: itemLegacyKey,
          legacyCreatedAt: parseTime(item.created),
          legacyRaw: rawArchive(item),
        },
      });
      for (const review of readReviews(item)) {
        const created = parseTime(review.value.date) ?? itemCreatedAt;
        const reviewWriter = stringValue(review.value.writer) ?? '__unknown__';
        const legacyKey = `${itemLegacyKey}/${review.key}`;
        rows.comments?.push({
          legacyKey,
          legacyItemKey: itemLegacyKey,
          legacyWriterUid: reviewWriter,
          document: {
            body: String(review.value.text ?? ''),
            legacyWriterUid: reviewWriter,
            createdAt: created,
            updatedAt: created,
            legacyKey,
            legacyCreatedAt: created,
            legacyRaw: rawArchive(review.value),
          },
        });
      }
      for (const picture of readPictures(item)) {
        const order = Number(picture.key);
        const path = stringValue(picture.value.path);
        const url = stringValue(picture.value.url);
        const inferredPath = path ?? photoPathFromUrl(url);
        const isBase64 =
          picture.value.base64 === true || picture.value.isBase64 === true;
        const dataSource = url?.startsWith('data:') === true;
        const validSource =
          dataSource ||
          (inferredPath !== undefined && storageNames.has(inferredPath));
        const legacyKey = `${itemLegacyKey}/${order}`;
        rows.photos?.push({
          legacyKey,
          legacyItemKey: itemLegacyKey,
          document: {
            order,
            migrationState: validSource ? 'PENDING' : 'MISSING',
            attempts: 0,
            legacyPath: inferredPath,
            legacyUrl: url,
            legacyIsBase64: isBase64,
            legacySourceMd5:
              inferredPath === undefined
                ? undefined
                : storageMd5.get(inferredPath),
            createdAt: itemCreatedAt,
            updatedAt: itemCreatedAt,
            legacyKey,
            legacyCreatedAt: itemCreatedAt,
            legacyRaw: rawArchive(picture.value),
          },
        });
        if (inferredPath === undefined && !dataSource)
          anomaly(
            'PHOTO_URL_UNPARSEABLE',
            `bookoo/ledgers/${ledgerKey}/items/${itemKey}/picture/${order}`,
            legacyKey,
            'itemPhotos',
            true,
            {reason: 'NO_PATH_OR_PARSEABLE_URL'},
            picture.value,
          );
        else if (!validSource)
          anomaly(
            'PHOTO_OBJECT_MISSING',
            `bookoo/ledgers/${ledgerKey}/items/${itemKey}/picture/${order}`,
            legacyKey,
            'itemPhotos',
            true,
            {reason: 'STORAGE_OBJECT_ABSENT'},
            picture.value,
          );
      }
    }
  }

  for (const [ledgerKey, customs] of [...customByLedger.entries()].sort()) {
    const createdAt = ledgerCreatedAt.get(ledgerKey) ?? input.importedAt;
    for (const preset of SYSTEM_CATEGORIES) {
      rows.categories?.push({
        legacyLedgerKey: ledgerKey,
        key: preset.key,
        document: {
          key: preset.key,
          source: 'PRESET',
          kind: preset.kind,
          iconKey: preset.icon,
          colorToken: preset.colorToken,
          sortOrder: preset.sortOrder,
          legacyIconId: preset.legacyIconId,
          createdAt,
          updatedAt: input.importedAt,
        },
      });
    }
    rows.categories?.push(
      ...[...customs.values()].sort((left, right) =>
        String(left.key).localeCompare(String(right.key)),
      ),
    );
    if (SYSTEM_CATEGORIES.length + customs.size > 120)
      throw new Error('category limit exceeded');
  }

  const invitePairs = new Map<
    string,
    {ledgerKey: string; encodedEmail: string; emailNormalized?: string}
  >();
  const inviteArchive: {
    direction: 'A_BY_LEDGER' | 'B_BY_EMAIL' | 'UNCLASSIFIED';
    rawParentKey: string;
    rawChildKey: string;
    rawValue: string;
    pairKey?: string;
  }[] = [];
  for (const [parent, rawChild] of sortedEntries(root.invites)) {
    const child = objectOf(rawChild);
    if (Object.keys(child).length === 0) {
      inviteArchive.push({
        direction: 'UNCLASSIFIED',
        rawParentKey: parent,
        rawChildKey: '',
        rawValue: String(rawChild),
      });
      continue;
    }
    const direction = isPushId(parent)
      ? 'A_BY_LEDGER'
      : parent.includes('%40')
        ? 'B_BY_EMAIL'
        : 'UNCLASSIFIED';
    for (const [key, value] of sortedEntries(child)) {
      const ledgerKey = direction === 'A_BY_LEDGER' ? parent : key;
      const encodedEmail = direction === 'A_BY_LEDGER' ? key : parent;
      const pairKey = `${ledgerKey}/${encodedEmail}`;
      inviteArchive.push({
        direction,
        rawParentKey: parent,
        rawChildKey: key,
        rawValue: String(value),
        pairKey: direction === 'UNCLASSIFIED' ? undefined : pairKey,
      });
      if (direction !== 'UNCLASSIFIED')
        invitePairs.set(pairKey, {
          ledgerKey,
          encodedEmail,
          emailNormalized: normalizeEmail(decodeLegacyKey(encodedEmail)),
        });
    }
  }
  const pairOutcome = new Map<
    string,
    'CONVERTED' | 'ALREADY_MEMBER' | 'LEDGER_MISSING' | 'UNCLASSIFIABLE'
  >();
  for (const [pairKey, pair] of [...invitePairs.entries()].sort()) {
    const ledger = validLedgers.get(pair.ledgerKey);
    const memberUids = Object.keys(objectOf(ledger?.members));
    const alreadyMember = memberUids.some(
      (uid) =>
        pair.emailNormalized !== undefined &&
        emailByUid.get(uid) === pair.emailNormalized,
    );
    const outcome =
      ledger === undefined
        ? 'LEDGER_MISSING'
        : alreadyMember
          ? 'ALREADY_MEMBER'
          : pair.emailNormalized === undefined
            ? 'UNCLASSIFIABLE'
            : 'CONVERTED';
    pairOutcome.set(pairKey, outcome);
    if (outcome !== 'CONVERTED') continue;
    const owner = stringValue(ledger?.owner);
    if (owner === undefined) throw new Error('invite ledger owner missing');
    const createdAt = ledgerCreatedAt.get(pair.ledgerKey) ?? input.importedAt;
    rows.invites?.push({
      legacyKey: pairKey,
      legacyLedgerKey: pair.ledgerKey,
      legacyCreatedByUid: owner,
      document: {
        codeHash: sha256(`legacy-invite:${input.runId}:${pairKey}`),
        role: 'MEMBER',
        source: 'LEGACY_EMAIL',
        maxUses: 1,
        useCount: 0,
        requiresApproval: false,
        inviteeEmailNormalized: pair.emailNormalized,
        legacyEncodedEmail: pair.encodedEmail,
        legacyLedgerKey: pair.ledgerKey,
        createdAt,
        updatedAt: input.importedAt,
        legacyKey: pairKey,
        legacyCreatedAt: createdAt,
        legacyRaw: canonical({pair: sha256(pairKey)}),
      },
    });
  }
  for (const archived of inviteArchive) {
    const pair =
      archived.pairKey === undefined
        ? undefined
        : invitePairs.get(archived.pairKey);
    const outcome =
      archived.pairKey === undefined
        ? 'UNCLASSIFIABLE'
        : (pairOutcome.get(archived.pairKey) ?? 'UNCLASSIFIABLE');
    rows.legacyInvites?.push({
      document: {
        direction: archived.direction,
        rawParentKey: archived.rawParentKey,
        rawChildKey: archived.rawChildKey,
        rawValue: archived.rawValue,
        legacyLedgerKey: pair?.ledgerKey,
        emailNormalized: pair?.emailNormalized,
        reconciledAs: outcome,
        importedAt: input.importedAt,
      },
    });
    if (outcome === 'UNCLASSIFIABLE')
      anomaly(
        'INVITE_UNCLASSIFIABLE',
        `bookoo/invites/${archived.rawParentKey}/${archived.rawChildKey}`,
        archived.pairKey ?? '',
        'legacyInvites',
        true,
        {reason: 'KEY_SHAPE'},
      );
  }

  for (const [opinionKey, rawOpinion] of sortedEntries(opinionsRoot)) {
    const opinion = objectOf(rawOpinion);
    const user = objectOf(opinion.user);
    const uid = stringValue(user.uid);
    const date = stringValue(opinion.createdAt);
    const datedAt =
      date === undefined ? undefined : Date.parse(`${date}T00:00:00+09:00`);
    const createdAt =
      datedAt !== undefined && Number.isFinite(datedAt)
        ? datedAt
        : (pushIdToMillis(opinionKey) ?? input.importedAt);
    rows.feedback?.push({
      legacyKey: opinionKey,
      legacyUid: uid,
      document: {
        category: 'OTHER',
        body: String(opinion.opinion ?? ''),
        contactEmail: normalizeEmail(stringValue(user.email)),
        status: 'NEW',
        createdAt,
        legacyUid: uid,
        legacyUserJson: rawArchive(user),
        legacyCreatedAtDate: date,
        legacyKey: opinionKey,
        legacyCreatedAt: pushIdToMillis(opinionKey),
        legacyRaw: rawArchive(opinion),
      },
    });
  }

  for (const list of Object.values(rows))
    list.sort((left, right) => canonical(left).localeCompare(canonical(right)));
  const summary = Object.fromEntries(
    Object.entries(rows).map(([name, list]) => [name, list.length]),
  );
  const customCounts = [...customByLedger.values()].map((map) => map.size);
  return {
    rows,
    summary,
    reports: {
      baseline: {
        runId: input.runId,
        importedAt: input.importedAt,
        counts: summary,
      },
      categories: {
        classified: categoryReport,
        ledgersWithOverlay: customByLedger.size,
        maxCustoms: Math.max(0, ...customCounts),
      },
      currencyVotes: Object.fromEntries(
        (rows.ledgers ?? []).map((row) => [
          sha256(String(row.legacyKey)).slice(0, 12),
          {
            currency: objectOf(row.document).baseCurrency,
            source: objectOf(row.document).legacyCurrencySource,
          },
        ]),
      ),
    },
  };
}

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const loadRoot = (path: string): JsonObject =>
  JSON.parse(readFileSync(path, 'utf8')) as JsonObject;

const loadAuth = (path: string): AuthUser[] => {
  const value = loadRoot(path);
  return Array.isArray(value.users) ? (value.users as AuthUser[]) : [];
};

const loadShardedRoot = (directory: string): JsonObject => {
  const root: JsonObject = {};
  for (const name of ['users', 'invites', 'opinions']) {
    const path = join(directory, `${name}.json`);
    if (existsSync(path)) root[name] = loadRoot(path);
  }
  const ledgersDirectory = join(directory, 'ledgers');
  if (existsSync(ledgersDirectory)) {
    root.ledgers = Object.fromEntries(
      readdirSync(ledgersDirectory)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => [
          name.slice(0, -5),
          loadRoot(join(ledgersDirectory, name)),
        ]),
    );
  }
  return root;
};

async function main(): Promise<void> {
  const localRoot = resolve(
    argument('--out') ?? join(process.cwd(), '.local', 'migration'),
  );
  const rtdbPath = resolve(
    argument('--rtdb') ?? join(localRoot, 'rtdb', 'bookoo-full.json'),
  );
  const authPath = resolve(
    argument('--auth') ?? join(localRoot, 'auth', 'auth-users.safe.json'),
  );
  const manifestPath = resolve(
    argument('--manifest') ?? join(localRoot, 'MANIFEST.json'),
  );
  const storagePath = resolve(
    argument('--storage-manifest') ??
      join(localRoot, 'storage', 'manifest.jsonl'),
  );
  const manifest = loadRoot(manifestPath);
  const importedAt = Date.parse(String(manifest.frozenAt ?? ''));
  if (!Number.isFinite(importedAt))
    throw new Error('MANIFEST frozenAt is invalid');
  const runId = String(process.env.RUN_ID ?? manifest.runId ?? '').trim();
  if (runId === '') throw new Error('RUN_ID is required');
  const root = existsSync(rtdbPath)
    ? loadRoot(rtdbPath)
    : loadShardedRoot(join(localRoot, 'rtdb'));
  const output = normalizeDataset({
    root,
    authUsers: loadAuth(authPath),
    storageManifest: existsSync(storagePath)
      ? await readJsonl<StorageManifestRow>(storagePath)
      : [],
    importedAt,
    runId,
    onlyLedger: argument('--ledger'),
  });
  for (const [name, relative] of Object.entries(OUTPUT_FILES))
    await writeJsonl(join(localRoot, relative), output.rows[name] ?? []);
  const reportsDirectory = join(localRoot, 'reports');
  mkdirSync(reportsDirectory, {recursive: true, mode: 0o700});
  writeFileSync(
    join(reportsDirectory, 'BASELINE.json'),
    `${JSON.stringify(output.reports.baseline, null, 2)}\n`,
    {mode: 0o600},
  );
  writeFileSync(
    join(reportsDirectory, 'categories.json'),
    `${JSON.stringify(output.reports.categories, null, 2)}\n`,
    {mode: 0o600},
  );
  writeFileSync(
    join(reportsDirectory, 'currency-votes.json'),
    `${JSON.stringify(output.reports.currencyVotes, null, 2)}\n`,
    {mode: 0o600},
  );
  const checksums = Object.fromEntries(
    Object.values(OUTPUT_FILES).map((relative) => {
      const path = join(localRoot, relative);
      return [relative, sha256(readFileSync(path))];
    }),
  );
  writeFileSync(
    join(reportsDirectory, 'checksums.json'),
    `${JSON.stringify(checksums, null, 2)}\n`,
    {mode: 0o600},
  );
  process.stdout.write(
    `normalized ${output.summary.items ?? 0} items, ${output.summary.anomalies ?? 0} anomalies\n`,
  );
}

if (import.meta.main)
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'normalization failed'}\n`,
    );
    process.exitCode = 1;
  });
