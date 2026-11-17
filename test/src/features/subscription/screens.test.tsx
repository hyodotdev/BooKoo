import 'react-native';

import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import type {SubscriptionPlan} from '../../../../src/features/subscription/plans';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ProScreen} from '../../../../src/features/subscription/screens';
import {
  useSubscription,
  type PurchaseOutcome,
} from '../../../../src/features/subscription/provider';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';
import {bindGrowthTracker} from '../../../../src/features/growth/events';

const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    back: mockBack,
    navigate: mockNavigate,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));
jest.mock('../../../../src/features/subscription/provider', () => ({
  useSubscription: jest.fn(),
}));

const mockUseSubscription = jest.mocked(useSubscription);

const annual = {
  identifier: 'annual',
  product: {identifier: 'dev.hyo.bookoo.pro.annual', priceString: '$29.99'},
} satisfies SubscriptionPlan;
const monthly = {
  identifier: 'monthly',
  product: {identifier: 'dev.hyo.bookoo.pro.monthly', priceString: '$3.99'},
} satisfies SubscriptionPlan;

const renderScreen = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <ProScreen />
      </CpkProvider>
    </SafeAreaProvider>,
  );

const subscription = (
  overrides: Partial<ReturnType<typeof useSubscription>> = {},
): ReturnType<typeof useSubscription> => ({
  canPurchase: true,
  canManage: true,
  expiresAt: undefined,
  hasBillingIssue: false,
  hasStoreSubscription: false,
  isActive: false,
  isEnding: false,
  isLoading: false,
  isStatusAvailable: true,
  manage: jest.fn(() => Promise.resolve({kind: 'CLOSED'})),
  loadPackages: jest.fn(() => Promise.resolve()),
  packages: [],
  purchase: jest.fn(() => Promise.resolve({kind: 'UNAVAILABLE'})),
  restore: jest.fn(() => Promise.resolve({kind: 'NOTHING_TO_RESTORE'})),
  ...overrides,
});

describe('Pro screen', () => {
  afterEach(() => bindGrowthTracker(null));
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    setActiveLocale('en');
  });

  it('loads the native store catalog after billing connects', async () => {
    const loadPackages = jest.fn(async () => undefined);
    mockUseSubscription.mockReturnValue(subscription({loadPackages}));
    const screen = renderScreen();
    await waitFor(() =>
      expect(loadPackages).toHaveBeenCalledWith('SECOND_SHARED_LEDGER'),
    );
    expect(screen.getByText('Plans could not load')).toBeTruthy();
  });
  it('waits for server subscription state', () => {
    mockUseSubscription.mockReturnValue(
      subscription({isLoading: true, canPurchase: false}),
    );
    expect(renderScreen().getByTestId('pro-paywall-loading')).toBeTruthy();
  });

  it('keeps the fallback purchase flow to one compact selection step', async () => {
    const purchase = jest.fn(() =>
      Promise.resolve({kind: 'CANCELLED'} as const),
    );
    mockUseSubscription.mockReturnValue(
      subscription({packages: [monthly, annual], purchase}),
    );

    const screen = renderScreen();

    await waitFor(() =>
      expect(
        screen.getByLabelText('Annual, $29.99').props.accessibilityState,
      ).toMatchObject({checked: true}),
    );
    fireEvent.press(screen.getByLabelText('Monthly, $3.99'));
    fireEvent.press(screen.getByText('Continue monthly'));

    await waitFor(() => expect(purchase).toHaveBeenCalledWith(monthly));
    expect(screen.queryByText('Review your plan')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('opens subscription management for an existing subscriber', async () => {
    const manage = jest.fn(() => Promise.resolve({kind: 'CLOSED'} as const));
    mockUseSubscription.mockReturnValue(subscription({isActive: true, manage}));
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Manage subscription'));
    await waitFor(() => expect(manage).toHaveBeenCalledTimes(1));
  });
  it('lets an active subscriber explicitly restore without launching a sale', async () => {
    const restore = jest.fn(async () => ({kind: 'PURCHASED'}) as const);
    const purchase = jest.fn();
    mockUseSubscription.mockReturnValue(
      subscription({isActive: true, restore, purchase}),
    );
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Restore purchases'));
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
    expect(purchase).not.toHaveBeenCalled();
  });
  it('prompts restore after already-owned instead of closing as a successful purchase', async () => {
    const purchase = jest.fn(
      async () => ({kind: 'ALREADY_SUBSCRIBED'}) as const,
    );
    mockUseSubscription.mockReturnValue(
      subscription({purchase, packages: [monthly]}),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Continue monthly')).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Continue monthly'));
    await waitFor(() =>
      expect(
        screen.getByText(
          'This store account already owns the subscription. Restore purchases to verify it for BooKoo.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Restore purchases')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('keeps management accessible for a non-entitled existing store subscriber', async () => {
    const manage = jest.fn(async () => ({kind: 'CLOSED'}) as const);
    mockUseSubscription.mockReturnValue(
      subscription({
        isActive: false,
        hasStoreSubscription: true,
        hasBillingIssue: true,
        canPurchase: false,
        manage,
      }),
    );
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Manage subscription'));
    await waitFor(() => expect(manage).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('You’re on Pro')).toBeNull();
  });

  it('discloses the selected trial duration and recurring price before purchase', async () => {
    const trial = {
      ...annual,
      introductoryPhases: [
        {priceString: 'Free', duration: {count: 7, unit: 'day' as const}},
      ],
    };
    mockUseSubscription.mockReturnValue(
      subscription({packages: [trial, monthly]}),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(
        screen.getByText('Free for 7 days, then $29.99 per year.'),
      ).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText('Monthly, $3.99'));
    expect(
      screen.queryByText('Free for 7 days, then $29.99 per year.'),
    ).toBeNull();
  });
  it('allows native management when purchase verification is unavailable', async () => {
    const manage = jest.fn(async () => ({kind: 'CLOSED'}) as const);
    mockUseSubscription.mockReturnValue(
      subscription({
        isActive: true,
        canPurchase: false,
        canManage: true,
        manage,
      }),
    );
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Manage subscription'));
    await waitFor(() => expect(manage).toHaveBeenCalled());
  });
  it('discloses each discounted payment rather than a combined introductory total', async () => {
    mockUseSubscription.mockReturnValue(
      subscription({
        packages: [
          {
            ...annual,
            introductoryPhases: [
              {
                priceString: '$5.00',
                duration: {count: 1, unit: 'month'},
                cycles: 3,
              },
            ],
          },
        ],
      }),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(
        screen.getByText('$5.00 / 1 month × 3, then $29.99 per year.'),
      ).toBeTruthy(),
    );
  });
  it('counts one paywall visit through repeated catalog retries', async () => {
    const tracker = jest.fn();
    mockUseSubscription.mockReturnValue(subscription());
    bindGrowthTracker(tracker);
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText('Reload plans')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByText('Reload plans')));
    await waitFor(() => expect(screen.getByText('Reload plans')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByText('Reload plans')));
    expect(tracker).toHaveBeenCalledTimes(1);
    expect(tracker).toHaveBeenCalledWith('paywall_show', {
      placement: 'second_ledger',
    });
  });
  it('returns a cold successful purchase to settings', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockUseSubscription.mockReturnValue(
      subscription({
        packages: [annual],
        purchase: jest.fn(async () => ({kind: 'PURCHASED'}) as const),
      }),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Continue annually')).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Continue annually'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/(root)/me'),
    );
  });
  it('removes purchase buttons while server confirmation is pending', async () => {
    mockUseSubscription.mockReturnValue(
      subscription({
        packages: [annual],
        purchase: jest.fn(async () => ({kind: 'PENDING'}) as const),
      }),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Continue annually')).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Continue annually'));
    await waitFor(() =>
      expect(
        screen.getByText('Your purchase is pending confirmation.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Continue annually')).toBeNull();
  });

  it('keeps native checkout failure visible and retryable', async () => {
    let finishCheckout: ((outcome: PurchaseOutcome) => void) | undefined;
    mockUseSubscription.mockReturnValue(
      subscription({
        packages: [annual],
        purchase: jest.fn(
          () =>
            new Promise((resolve) => {
              finishCheckout = resolve;
            }),
        ),
      }),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Continue annually')).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Continue annually'));
    expect(
      screen.queryByText('Your purchase is pending confirmation.'),
    ).toBeNull();
    await act(async () => {
      finishCheckout?.({kind: 'FAILED'});
    });
    expect(screen.getByText('Continue annually')).toBeTruthy();
    expect(
      screen.queryByText('Your purchase is pending confirmation.'),
    ).toBeNull();
    expect(
      screen.getByText('We could not complete the purchase. Try again.'),
    ).toBeTruthy();
  });
});

describe('purchase confirmation recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    setActiveLocale('en');
  });
  it.each([
    [
      'TEST_ACCOUNT_REQUIRED',
      'This test purchase requires a registered BooKoo test account.',
    ],
    [
      'ACCOUNT_LINK_REQUIRED',
      'This purchase could not be linked to your BooKoo account. Sign in to the original account and restore purchases.',
    ],
  ] as const)(
    'explains %s and offers recovery without a second sale',
    async (blocker, copy) => {
      const restore = jest.fn(
        async () => ({kind: 'CONFIRMATION_BLOCKED', blocker}) as const,
      );
      const state = subscription({
        packages: [annual],
        restore,
        purchase: jest.fn(
          async () => ({kind: 'CONFIRMATION_BLOCKED', blocker}) as const,
        ),
      });
      mockUseSubscription.mockReturnValue(state);
      const screen = renderScreen();
      await waitFor(() =>
        expect(screen.getByText('Continue annually')).toBeTruthy(),
      );
      fireEvent.press(screen.getByText('Continue annually'));
      await waitFor(() => expect(screen.getByText(copy)).toBeTruthy());
      expect(
        screen.queryByText('Your purchase is pending confirmation.'),
      ).toBeNull();
      expect(screen.queryByText('Continue annually')).toBeNull();
      expect(screen.getByText('Manage subscription')).toBeTruthy();
      fireEvent.press(screen.getByText('Restore purchases'));
      await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
      expect(screen.getByText(copy)).toBeTruthy();
      mockUseSubscription.mockReturnValue({...state, isActive: true});
      screen.rerender(
        <SafeAreaProvider>
          <CpkProvider
            themeConfig={{customTheme: theme, initialThemeType: 'light'}}
          >
            <ProScreen />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    },
  );
  it('clears a stale pending page when restore confirms no active purchase', async () => {
    mockUseSubscription.mockReturnValue(
      subscription({
        packages: [annual],
        purchase: jest.fn(async () => ({kind: 'PENDING'}) as const),
      }),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Continue annually')).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Continue annually'));
    await waitFor(() =>
      expect(
        screen.getByText('Your purchase is pending confirmation.'),
      ).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Restore purchases'));
    await waitFor(() =>
      expect(
        screen.getByText('No previous Pro purchase was found.'),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByText('Your purchase is pending confirmation.'),
    ).toBeNull();
    expect(screen.getByText('Continue annually')).toBeTruthy();
  });
  it('does not offer another sale when confirmation retry fails', async () => {
    mockUseSubscription.mockReturnValue(
      subscription({
        packages: [annual],
        purchase: jest.fn(async () => ({kind: 'PENDING'}) as const),
        restore: jest.fn(async () => ({kind: 'FAILED'}) as const),
      }),
    );
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Continue annually')).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Continue annually'));
    await waitFor(() =>
      expect(
        screen.getByText('Your purchase is pending confirmation.'),
      ).toBeTruthy(),
    );
    fireEvent.press(screen.getByText('Restore purchases'));
    await waitFor(() =>
      expect(
        screen.getByText('We could not complete the purchase. Try again.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Continue annually')).toBeNull();
  });
});
