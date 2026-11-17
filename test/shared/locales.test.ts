import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {LOCALE_DEFAULTS, SUPPORTED_LOCALES} from '@shared/locales';

describe('supported locales', () => {
  it('matches the Convex localeValidator literals', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'convex/schema/userProfiles.ts'),
      'utf8',
    );
    const start = source.indexOf('export const localeValidator');
    const next = source.indexOf('export type AppLocale', start);
    const block = source.slice(start, next);
    for (const locale of SUPPORTED_LOCALES) {
      expect(block).toContain(`v.literal('${locale}')`);
    }
    expect(
      [...block.matchAll(/v\.literal\('([a-z]+)'\)/g)]
        .map((match) => match[1])
        .sort(),
    ).toEqual([...SUPPORTED_LOCALES].sort());
  });
});

describe('region defaults without device settings', () => {
  it('uses VND and Vietnam’s Monday-first calendar', () => {
    expect(LOCALE_DEFAULTS.vi).toEqual({
      currency: 'VND',
      timeZone: 'Asia/Ho_Chi_Minh',
      weekStartsOn: 1,
    });
  });
  it('keeps client and server region fallbacks in one registry', () => {
    expect(Object.keys(LOCALE_DEFAULTS).sort()).toEqual(
      [...SUPPORTED_LOCALES].sort(),
    );
    expect(LOCALE_DEFAULTS.zh.weekStartsOn).toBe(1);
    expect(LOCALE_DEFAULTS.id.weekStartsOn).toBe(0);
    expect(LOCALE_DEFAULTS.pt.weekStartsOn).toBe(0);
  });
});
