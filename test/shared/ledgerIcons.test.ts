import {iconList} from 'cpk-ui/components/uis/Icon/Icon';

import {
  FALLBACK_LEDGER_ICON,
  LEDGER_ICON_CATALOG,
  LEDGER_ICON_NAMES,
  isLedgerIconName,
  randomLedgerIcon,
} from '../../shared/ledgerIcons';

const ICON_NAMES: ReadonlySet<string> = new Set<string>(iconList);

describe('ledger icon catalog', () => {
  it('resolves every catalog glyph against cpk-ui iconList', () => {
    const missing = LEDGER_ICON_CATALOG.filter(
      (entry) => !ICON_NAMES.has(entry.icon),
    ).map((entry) => `${entry.i18nKey} -> ${entry.icon}`);

    expect(missing).toEqual([]);
    expect(ICON_NAMES.has(FALLBACK_LEDGER_ICON)).toBe(true);
  });

  it('keeps names unique and validates the allowlist', () => {
    expect(new Set(LEDGER_ICON_NAMES).size).toBe(LEDGER_ICON_NAMES.length);
    expect(isLedgerIconName(FALLBACK_LEDGER_ICON)).toBe(true);
    expect(isLedgerIconName('NotAnIcon')).toBe(false);
  });

  it('picks a different icon when rerolling', () => {
    const first = randomLedgerIcon(null, () => 0);
    const next = randomLedgerIcon(first, () => 0);
    expect(first).not.toBe(next);
    expect(isLedgerIconName(first)).toBe(true);
    expect(isLedgerIconName(next)).toBe(true);
  });
});
