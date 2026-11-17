import {readdirSync, readFileSync} from 'fs';
import {join} from 'path';

import * as barrel from '@shared/index';

/**
 * `shared/` is compiled by THREE toolchains — Metro, the Convex esbuild bundler
 * and jest. A `react-native` import breaks the Convex isolate; a `convex/server`
 * import drags the server runtime into the app bundle. Both fail far away from
 * the line that caused them, so the rule is enforced here instead.
 *
 * See `shared/AGENTS.md`.
 */
const SHARED_DIR = join(__dirname, '..', '..', 'shared');

const sharedFiles = readdirSync(SHARED_DIR).filter((name) =>
  name.endsWith('.ts'),
);

const FORBIDDEN = [
  /from\s+'react-native'/,
  /from\s+'react-native\//,
  /from\s+'react'/,
  /from\s+'convex\//,
  /from\s+'expo-/,
  /from\s+'@expo\//,
  /from\s+'cpk-ui/,
  /from\s+'kstyled/,
  /from\s+'node:/,
  /require\(/,
];

describe('shared/ stays isomorphic', () => {
  it('found the modules', () => {
    expect(sharedFiles.sort()).toEqual([
      'ads.ts',
      'appErrors.ts',
      'apple.ts',
      'application.ts',
      'authPolicy.ts',
      'categories.ts',
      'currency.ts',
      'date.ts',
      'email.ts',
      'entitlements.ts',
      'exportFiles.ts',
      'index.ts',
      'inviteCode.ts',
      'ipCountry.ts',
      'ledgerCore.ts',
      'ledgerIcons.ts',
      'ledgerLimits.ts',
      'ledgerRoles.ts',
      'legal.ts',
      'locales.ts',
      'money.ts',
      'onboarding.ts',
      'profile.ts',
      'push.ts',
      'receiptSuggestions.ts',
      'username.ts',
    ]);
  });

  for (const name of sharedFiles) {
    it(`${name} imports nothing platform-specific`, () => {
      const source = readFileSync(join(SHARED_DIR, name), 'utf8');
      const offenders = FORBIDDEN.filter((pattern) => pattern.test(source)).map(
        String,
      );

      expect(offenders).toEqual([]);
    });
  }

  it('imports only audited pure dependencies, and never moment', () => {
    const allowed = new Set([
      '@noble/hashes/sha2.js',
      '@noble/hashes/utils.js',
      'date-fns',
    ]);
    for (const name of sharedFiles) {
      const source = readFileSync(join(SHARED_DIR, name), 'utf8');
      const imports = Array.from(
        source.matchAll(/^import\s[\s\S]*?from\s+'([^']+)';/gm),
      ).map((match) => match[1]);

      for (const specifier of imports) {
        if (specifier.startsWith('.')) continue;

        expect(allowed.has(specifier)).toBe(true);
      }

      // Comments may NAME moment (they explain why it is gone); importing it
      // is what is banned.
      expect(source).not.toMatch(/from\s+'moment/);
      expect(source).not.toMatch(/require\(\s*'moment/);
    }
  });
});

describe('the barrel', () => {
  it('re-exports every module', () => {
    for (const name of [
      'exponentOf',
      'APPLICATION_ID',
      'isAppErrorPayload',
      'formatMoney',
      'parseMoneyInput',
      'SYSTEM_CATEGORIES',
      'toDayKey',
      'toMonthKey',
      'parseAppleWebName',
      'EMAIL_OTP_PROVIDER_IDS',
      'normalizeEmail',
      'normalizeInviteCode',
      'nextOnboardingStep',
      'PUBLIC_URLS',
      'publicLegalUrl',
      'renderInboxPush',
      'toRfc4180Csv',
      'isValidLedgerTitle',
      'hasLedgerRole',
      'validateHandle',
    ]) {
      expect(barrel).toHaveProperty(name);
    }
  });

  it('has no name collision between modules', () => {
    expect(Object.keys(barrel).length).toBeGreaterThan(60);
  });
});
