import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import type {Doc, Id} from '@convex/_generated/dataModel';
import {newUserProfileDefaults} from '../../convex/lib/userProfiles';
import {generatedDisplayName} from '@shared/profile';

describe('user identity queries', () => {
  it('lets a signed-in account read linked providers before ledger onboarding', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'convex/user/queries.ts'),
      'utf8',
    );
    const linked = source.slice(source.indexOf('export const linkedAccounts'));
    expect(linked).toContain('requireActiveProfile');
    expect(linked).not.toContain('requireOnboarded');
  });

  it('keeps generated identity support for deployed legacy clients', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'convex/user/mutations.ts'),
      'utf8',
    );
    expect(source).toContain('export const claimGeneratedIdentity');
    expect(source).toContain('generatedDisplayName');
  });

  it('starts a nameless account with a stable generated name and no handle', () => {
    const userId = 'user-defaults' as Id<'users'>;
    const profile = newUserProfileDefaults(
      userId,
      {
        _creationTime: 1,
        _id: userId,
      } as Doc<'users'>,
      1,
    );

    expect(profile.displayName).toBe(generatedDisplayName(userId));
    expect(profile.handle).toBeUndefined();
    expect(profile.onboardingStep).toBe('handle');
  });

  it('lets a signed-in account update display name before ledger onboarding', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'convex/user/mutations.ts'),
      'utf8',
    );
    const update = source.slice(source.indexOf('export const updateProfile'));
    const next = update.slice(
      0,
      update.indexOf('export const updateNotificationPreferences'),
    );
    expect(next).toContain('requireActiveProfile');
    expect(next).not.toContain('requireOnboarded');
    expect(next).not.toContain("query('userHandles')");
    expect(next).not.toContain("withIndex('by_handleKey'");
  });

  it('lets a signed-in account change language before ledger onboarding', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'convex/user/mutations.ts'),
      'utf8',
    );
    const update = source.slice(source.indexOf('export const setLocale'));
    const next = update.slice(0, update.indexOf('export const setAppearance'));
    expect(next).toContain('requireActiveProfile');
    expect(next).not.toContain('requireOnboarded');
  });
});
