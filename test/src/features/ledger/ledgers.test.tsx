import 'react-native';

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerListRow} from '../../../../src/features/ledger/screens/ledgers';
import type {LedgerRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

const ledger: LedgerRow = {
  archivedAt: null,
  baseCurrency: 'KRW',
  colorKey: 'TEAL',
  createdAt: 1,
  currencyIsAssumed: false,
  description: '',
  emoji: null,
  iconKey: null,
  id: 'ledger-test' as LedgerRow['id'],
  invitePolicy: 'MANAGERS_ONLY',
  itemWritePolicy: 'ANY_MEMBER',
  lastOpenedAt: null,
  lastReadAt: null,
  maintenanceLock: 'NONE',
  memberCount: 2,
  muted: false,
  notifyComment: true,
  notifyNewItem: true,
  ownerId: 'user-test' as LedgerRow['ownerId'],
  periodStartDay: 1,
  pinnedAt: null,
  role: 'OWNER',
  rollupVersion: 1,
  sortOrder: 0,
  timeZone: 'Asia/Seoul',
  timeZoneIsAssumed: false,
  title: 'Storyboard Ledger',
  updatedAt: 1,
  weekStartsOn: 0,
};

describe('all ledgers screen', () => {
  beforeEach(() => setActiveLocale('en'));

  it('presents the active ledger as a clean selectable row', () => {
    const onPress = jest.fn();
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 0, left: 0, right: 0, bottom: 0},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <LedgerListRow active item={ledger} onPress={onPress} />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    const row = screen.getByLabelText('Storyboard Ledger, 2 members · KRW');
    expect(row).toHaveProp('accessibilityRole', 'radio');
    expect(row).toHaveProp('accessibilityState', {checked: true});
    expect(row).toHaveStyle({minHeight: 72});
    expect(screen.getByText('2 members · KRW')).toBeTruthy();
    expect(screen.queryByText('OWNER')).toBeNull();

    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('finishes ledger onboarding from the live create-ledger screen', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/ledger/screens/ledgers.tsx'),
      'utf8',
    );
    expect(source).toContain('shouldFinishLedgerOnboarding');
    expect(source).toContain('completeLedgerStep');
    expect(source).not.toContain('LegacyNoLedgerScreen');
    expect(source).not.toContain('legacyLedgerForm');
  });
});
