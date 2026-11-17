import 'react-native';

import {fireEvent, render} from '@testing-library/react-native';
import {router} from 'expo-router';
import {CpkProvider} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  canOpenLedgerRoute,
  LedgerAdminBackButton,
} from '../../app/(app)/ledger/[ledgerId]/_layout';
import {theme} from '../../src/theme';
import {setActiveLocale} from '../../src/utils/i18n';

function renderBackButton() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <LedgerAdminBackButton />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('ledger admin back navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
  });

  it('returns through router history when the detail screen has history', () => {
    jest.mocked(router.canGoBack).mockReturnValue(true);

    const screen = renderBackButton();
    fireEvent.press(screen.getByTestId('ledger-admin-back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('returns to the More tab when a deep link has no local history', () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);

    const screen = renderBackButton();
    fireEvent.press(screen.getByTestId('ledger-admin-back'));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/(root)/me');
  });
});

describe('ledger nested route access', () => {
  it('keeps member-readable routes available to every active role', () => {
    expect(canOpenLedgerRoute('/ledger/id/members', 'MEMBER')).toBe(true);
    expect(canOpenLedgerRoute('/ledger/id/photos', 'VIEWER')).toBe(true);
    expect(canOpenLedgerRoute('/ledger/id/item/item-id', 'VIEWER')).toBe(true);
  });

  it('blocks admin queries before a member-only route can mount them', () => {
    for (const route of ['audit', 'invites', 'requests', 'timezone']) {
      expect(canOpenLedgerRoute(`/ledger/id/${route}`, 'MEMBER')).toBe(false);
      expect(canOpenLedgerRoute(`/ledger/id/${route}`, 'VIEWER')).toBe(false);
      expect(canOpenLedgerRoute(`/ledger/id/${route}`, 'ADMIN')).toBe(true);
      expect(canOpenLedgerRoute(`/ledger/id/${route}`, 'OWNER')).toBe(true);
    }
  });

  it('reserves owner-only settings for the owner', () => {
    for (const route of ['currency', 'danger']) {
      expect(canOpenLedgerRoute(`/ledger/id/${route}`, 'ADMIN')).toBe(false);
      expect(canOpenLedgerRoute(`/ledger/id/${route}`, 'OWNER')).toBe(true);
    }
  });
});
