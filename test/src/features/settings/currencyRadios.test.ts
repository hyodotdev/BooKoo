import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('single-choice radios', () => {
  it('uses SelectionRadio on default and ledger currency screens', () => {
    const defaults = readFileSync(
      resolve(process.cwd(), 'src/features/release/screens.tsx'),
      'utf8',
    );
    const ledger = readFileSync(
      resolve(process.cwd(), 'src/features/ledger/screens/ledgerAdmin.tsx'),
      'utf8',
    );
    const currencyScreen = defaults.slice(
      defaults.indexOf('export function DefaultCurrencyScreen'),
      defaults.indexOf('export function ProfileEditScreen'),
    );
    expect(currencyScreen).toContain('SelectionRadio');
    expect(currencyScreen).toContain('accessibilityRole="radio"');
    expect(currencyScreen).not.toContain('name="Check"');
    // One line, formatted like the ledger preview: the hand-built
    // "$12,345" split into "$12,34" / "5" at the largest text size.
    expect(currencyScreen).toContain('testID="default-currency-preview"');
    expect(currencyScreen).toContain(
      'formatAmount({amountMinor: 12345, currency})',
    );
    expect(currencyScreen).not.toContain('12,345');
    expect(ledger).toContain('<SelectionRadio selected={checked} />');
    expect(ledger).toContain('testID="ledger-currency-preview"');
    expect(ledger).toContain('formatAmount({');
    expect(ledger).not.toContain("t('money.baseAmountHint')");
  });

  it('does not swap a settings caret into a check', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/settings/ui.tsx'),
      'utf8',
    );
    const row = source.slice(source.indexOf('export function SettingsRow'));
    const next = row.slice(0, row.indexOf('export function SettingsToggleRow'));
    expect(next).toContain('SelectionRadio');
    expect(next).not.toContain('name="Check"');
    expect(next).toContain('name="CaretRight"');
  });
});
