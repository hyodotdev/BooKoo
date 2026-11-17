import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {LedgerHeader} from '../../../../src/features/ledger/ui';
import type {LedgerRow} from '../../../../src/features/ledger/types';
import {theme} from '../../../../src/theme';
import {EXACT_HIT_SLOP} from '../../../../src/theme/layout';
import {t} from '../../../../src/utils/i18n';

jest.mock('@shopify/flash-list', () => ({FlashList: () => null}));

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
  memberCount: 1,
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

describe('ledger header chrome', () => {
  it('keeps the compact menu-title-add header and opens its drawer', () => {
    const add = jest.fn();
    const openDrawer = jest.fn();
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
          <LedgerHeader
            ledger={ledger}
            onOpenDrawer={openDrawer}
            trailing={{
              accessibilityLabel: t('a11y.addEntry'),
              icon: 'Plus',
              onPress: add,
            }}
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('ledger-header')).toHaveStyle({
      minHeight: 56,
    });
    expect(screen.getByTestId('ledger-header-menu')).toHaveStyle({
      borderRadius: 28,
      height: 56,
      overflow: 'hidden',
      width: 56,
    });
    expect(screen.getByTestId('ledger-header-action')).toHaveStyle({
      borderRadius: 28,
      height: 56,
      overflow: 'hidden',
      width: 56,
    });
    expect(screen.getByTestId('ledger-header-menu').props.hitSlop).toEqual(
      EXACT_HIT_SLOP,
    );
    expect(screen.getByTestId('ledger-header-action').props.hitSlop).toEqual(
      EXACT_HIT_SLOP,
    );
    expect(screen.getByText('Storyboard Ledger')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(t('a11y.addEntry')));
    expect(add).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText(t('a11y.openDashboard')));
    expect(openDrawer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t('common.list'))).toBeNull();
  });
});
