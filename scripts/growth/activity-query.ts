import {ISO_ALPHA2_COUNTRY_CODES} from '../../shared/ipCountry';

/** Manual, aggregate-only reads of the existing operational presence record. */
export interface InternalAccountPolicy {
  version: 1;
  approvedAt: string;
  emails: string[];
  emailLocalParts: string[];
  handles: string[];
}

export function validateInternalAccountPolicy(
  value: unknown,
): InternalAccountPolicy {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1
  )
    throw new Error('A reviewed version1 internal-account policy is required');
  if (
    !('approvedAt' in value) ||
    typeof value.approvedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.approvedAt))
  )
    throw new Error('Policy approval date is required');
  const list = (key: 'emails' | 'emailLocalParts' | 'handles'): string[] => {
    const entries =
      key === 'emails' && 'emails' in value
        ? value.emails
        : key === 'emailLocalParts' && 'emailLocalParts' in value
          ? value.emailLocalParts
          : key === 'handles' && 'handles' in value
            ? value.handles
            : undefined;
    if (
      !Array.isArray(entries) ||
      entries.length > 100 ||
      entries.some(
        (item: unknown) =>
          typeof item !== 'string' || item.length === 0 || item.length > 320,
      )
    )
      throw new Error(`Invalid policy field: ${key}`);
    return [
      ...new Set(
        entries.map((item: string) =>
          item.trim().normalize('NFKC').toLowerCase(),
        ),
      ),
    ];
  };
  const policy: InternalAccountPolicy = {
    version: 1,
    approvedAt: value.approvedAt,
    emails: list('emails'),
    emailLocalParts: list('emailLocalParts'),
    handles: list('handles'),
  };
  if (
    policy.emails.length +
      policy.emailLocalParts.length +
      policy.handles.length ===
    0
  )
    throw new Error('Refusing an empty internal-account exclusion policy');
  if (
    policy.emails.some((email) => !/^[^\s@]+@[^\s@]+$/.test(email)) ||
    [...policy.emailLocalParts, ...policy.handles].some(
      (item) => !/^[a-z0-9._-]+$/.test(item),
    )
  )
    throw new Error(
      'Use exact emails, email local parts or handles, never wildcard rules',
    );
  return policy;
}

/** No new collection/deployment; a hard sentinel prevents a partial report. */
export function buildActivityQuery(
  policy: InternalAccountPolicy,
  asOf: number,
  includeSharing = false,
): string {
  const validated = validateInternalAccountPolicy(policy);
  if (!Number.isSafeInteger(asOf) || asOf <= 0)
    throw new Error('Invalid report timestamp');
  return `
const policy = ${JSON.stringify(validated)};
const countryCodes = ${JSON.stringify(ISO_ALPHA2_COUNTRY_CODES.split(' '))};
const asOf = ${asOf};
const LIMIT = 500;
const rows = await ctx.db.query('userPresence').withIndex('by_userId').take(LIMIT + 1);
if (rows.length > LIMIT) throw new Error('PRESENCE_SCAN_LIMIT: report unavailable; add indexed pagination before increasing scale');
// CLI authentication/network time may allow another legitimate heartbeat after
// the request timestamp. Anchor all windows consistently to that newer record.
let snapshotAt = asOf;
for (const row of rows) {
  if (!Number.isFinite(row.lastSeenAt) || row.lastSeenAt > asOf + 300000) throw new Error('INVALID_PRESENCE_TIMESTAMP');
  snapshotAt = Math.max(snapshotAt, row.lastSeenAt);
}
const windows = [86400000, 7 * 86400000, 28 * 86400000];
const external = [0, 0, 0], internal = [0, 0, 0], ineligible = [0, 0, 0];
const normalize = (value) => typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : '';
const matchesEmail = (value) => {
  const email = normalize(value);
  return policy.emails.includes(email) || (email.includes('@') && policy.emailLocalParts.includes(email.split('@')[0]));
};
const activeExternal = new Map();
const classifications = new Map();
const countryConsenting = new Set();
let readCount = rows.length;
const charge = (count) => { readCount += count; if (readCount > 3500) throw new Error('READ_BUDGET: shared usage unavailable'); };
async function classify(userId) {
  if (classifications.has(userId)) return classifications.get(userId);
  charge(1);
  const profile = await ctx.db.query('userProfiles').withIndex('by_userId', q => q.eq('userId', userId)).unique();
  let result = 'ineligible';
  if (profile && !profile.isPlaceholder && profile.deletedAt === undefined && profile.purgedAt === undefined && profile.onboardingStep === 'done' && profile.appRole !== 'SUSPENDED') {
    if (profile.countryAnalyticsEnabled === true) countryConsenting.add(userId);
    const emails = await ctx.db.query('userEmails').withIndex('by_userId_deletedAt', q => q.eq('userId', userId).eq('deletedAt', undefined)).take(11);
    charge(emails.length);
    if (emails.length > 10) throw new Error('LINKED_EMAIL_LIMIT: report unavailable');
    const excluded = profile.appRole === 'ADMIN' || profile.appRole === 'SUPPORT' ||
      policy.handles.includes(normalize(profile.handleKey)) ||
      matchesEmail(profile.emailNormalized) || emails.some(email => matchesEmail(email.emailNormalized));
    result = excluded ? 'internal' : 'external';
  }
  classifications.set(userId, result);
  return result;
}
for (const row of rows) {
  if (row.lastSeenAt < snapshotAt - windows[2]) continue;
  const kind = await classify(row.userId);
  const bucket = kind === 'external' ? external : kind === 'internal' ? internal : ineligible;
  if (kind === 'external') activeExternal.set(row.userId, row.lastSeenAt);
  windows.forEach((window, index) => { if (row.lastSeenAt >= snapshotAt - window) bucket[index]++; });
}
let sharing = null;
if (${JSON.stringify(includeSharing)}) {
  const ledgerIds = new Set();
  for (const userId of activeExternal.keys()) {
    const memberships = await ctx.db.query('ledgerMembers').withIndex('by_userId_deletedAt', q => q.eq('userId', userId).eq('deletedAt', undefined)).take(51);
    charge(memberships.length);
    if (memberships.length > 50) throw new Error('MEMBERSHIP_LIMIT: shared usage unavailable');
    memberships.forEach(member => ledgerIds.add(member.ledgerId));
    if (ledgerIds.size > 200) throw new Error('LEDGER_LIMIT: shared usage unavailable');
  }
  const shared = windows.map(() => new Set());
  const invited = windows.map(() => new Set());
  const openedTogether = windows.map(() => new Set());
  let sharedLedgers = 0, invitationBackedLedgers = 0;
  for (const ledgerId of ledgerIds) {
    charge(1);
    const ledger = await ctx.db.get('ledgers', ledgerId);
    if (!ledger || ledger.deletedAt !== undefined) continue;
    const roster = await ctx.db.query('ledgerMembers').withIndex('by_ledgerId_deletedAt_role', q => q.eq('ledgerId', ledgerId).eq('deletedAt', undefined)).take(201);
    charge(roster.length);
    if (roster.length > 200) throw new Error('ROSTER_LIMIT: shared usage unavailable');
    const members = [];
    for (const member of roster) if (await classify(member.userId) === 'external') members.push(member);
    if (members.length < 2) continue;
    sharedLedgers++;
    const invitationBacked = members.some(member => ['INVITE_LINK','INVITE_EMAIL','INVITE_HANDLE'].includes(member.joinedVia));
    if (invitationBacked) invitationBackedLedgers++;
    windows.forEach((window,index) => {
      const recentMembers = members.filter(member => (activeExternal.get(member.userId) ?? 0) >= snapshotAt - window);
      for (const member of members) {
        if ((activeExternal.get(member.userId) ?? 0) < snapshotAt - window) continue;
        shared[index].add(member.userId);
        if (invitationBacked) invited[index].add(member.userId);
        if (recentMembers.length >= 2) openedTogether[index].add(member.userId);
      }
    });
  }
  const summarize = sets => sets.map((set,index) => ({accounts:set.size, denominator:external[index], percent:external[index] === 0 ? null : Math.round(10000 * set.size / external[index]) / 100}));
  sharing = {
    sharedMembership:summarize(shared), invitationBackedSharedMembership:summarize(invited),
    coActiveSharedMembership:summarize(openedTogether), sharedLedgerActivity:null, sharedLedgers, invitationBackedLedgers,
    definition:'Current live ledgers with at least two eligible non-internal accounts; co-active means both used the app, not proof of opening/contributing to the same ledger',
    sharedLedgerActivityUnavailableReason:'lastOpenedAt is seeded on create/join; the current app does not call memberState.markRead. No reliable same-ledger activity denominator is available',
  };
}
return {
  schemaVersion: 1, asOf: snapshotAt, complete: true,
  metric: 'authenticated_accounts_by_latest_operational_presence',
  windows: ['last24Hours', 'last7Days', 'last28Days'],
  externalActiveAccounts: external, excludedInternalAccounts: internal,
  excludedIneligibleAccounts: ineligible,
  policyApprovedAt: policy.approvedAt,
  sharing,
  countries: windows.map((window, index) => {
    const counts = new Map();
    let unknownAccounts = 0;
    for (const row of rows) {
      if (!activeExternal.has(row.userId) || row.lastSeenAt < snapshotAt - window) continue;
      // Stored codes are already canonicalized by touchPresence. Validate the
      // shared data vocabulary without serializing instrumented function source.
      const storedCode = row.ipCountryCodeAtLastSeen;
      const code = countryConsenting.has(row.userId) && typeof storedCode === 'string' && countryCodes.includes(storedCode) ? storedCode : undefined;
      if (code === undefined) unknownAccounts++;
      else counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const denominator = external[index];
    return {
      denominator, unknownAccounts, knownAccounts: denominator - unknownAccounts,
      coveragePercent: denominator === 0 ? null : Math.round(10000 * (denominator - unknownAccounts) / denominator) / 100,
      byCountry: [...counts.entries()].map(([countryCode, accounts]) => ({countryCode, accounts, percentOfAllActive: Math.round(10000 * accounts / denominator) / 100})).sort((a,b) => b.accounts - a.accounts || a.countryCode.localeCompare(b.countryCode)),
    };
  }),
  countryDefinition: 'Latest consenting connection country estimated from IP; not nationality, residence, language or GPS. Unknown includes old versions, no consent and failed lookups. VPN/proxy may change estimates; no historical backfill',
  limitations: ['Not store installs or anonymous users', 'Not historical calendar-day DAU or retention', 'Latest presence can lag foreground use; no continuous session timer', 'External means not matched by the reviewed internal-account policy, not a verified human'],
};`;
}
