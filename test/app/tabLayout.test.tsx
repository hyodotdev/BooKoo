import type {ReactNode} from 'react';
import {render} from '@testing-library/react-native';

import TabLayout from '../../app/(app)/(tabs)/(root)/_layout';
import type {LedgerRow} from '../../src/features/ledger/types';
import {useActiveLedger} from '../../src/features/ledger/useActiveLedger';

let mockIsTablet = false;

jest.mock('expo-router/js-tabs', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactNative = require('react-native') as typeof import('react-native');

  const Tabs = ({
    children,
    safeAreaInsets,
    screenOptions,
  }: {
    children?: ReactNode;
    safeAreaInsets?: {bottom?: number};
    screenOptions?: Record<string, unknown>;
  }) => {
    const tabBarStyle = screenOptions?.tabBarStyle as
      Record<string, unknown> | undefined;
    return React.createElement(
      ReactNative.View,
      {
        accessibilityLabel: `${String(screenOptions?.tabBarPosition)}:${String(
          screenOptions?.tabBarLabelPosition,
        )}`,
        accessibilityHint: JSON.stringify({
          activeBackground: screenOptions?.tabBarActiveBackgroundColor,
          activeTint: screenOptions?.tabBarActiveTintColor,
          sceneStyle: screenOptions?.sceneStyle,
          tabBarStyle,
          variant: screenOptions?.tabBarVariant,
        }),
        accessibilityValue: {text: String(safeAreaInsets?.bottom)},
        testID: 'mock-tabs',
      },
      children,
    );
  };
  Tabs.Screen = function MockTabScreen({
    options,
  }: {
    options?: {
      href?: null;
      tabBarIcon?: React.ComponentType<{focused: boolean}>;
    };
  }): ReactNode {
    if (options?.href === null)
      return React.createElement(ReactNative.View, {
        testID: 'hidden-add-tab',
      });
    const TabBarIcon = options?.tabBarIcon;
    return TabBarIcon === undefined
      ? null
      : React.createElement(TabBarIcon, {focused: false});
  };

  return {Tabs};
});

jest.mock('cpk-ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactNative = require('react-native') as typeof import('react-native');

  return {
    Typography: {
      Body4: ({children}: {children?: ReactNode}) =>
        React.createElement(ReactNative.View, null, children),
    },
    useCPK: () => ({
      media: {isTablet: false},
      theme: {
        bg: {chrome: 'white', paper: 'paper-bg'},
        role: {border: 'gray', primary: 'green', underlay: 'mint-pale'},
        text: {label: 'black', placeholder: 'gray'},
      },
    }),
  };
});

jest.mock('../../src/hooks/useTabletLayout', () => ({
  useTabletLayout: () => mockIsTablet,
}));

jest.mock('../../src/features/ledger/useActiveLedger', () => ({
  useActiveLedger: jest.fn(),
}));

jest.mock('../../src/features/runtime/shellLoadingOverlay', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactNative = require('react-native') as typeof import('react-native');

  return {
    ShellLoadingOverlay: ({visible}: {visible: boolean}) =>
      visible
        ? React.createElement(ReactNative.View, {
            testID: 'mock-shell-loading-overlay',
          })
        : null,
  };
});

jest.mock('../../src/theme/ledgerAccentProvider', () => ({
  useLedgerAccent: () => ({
    base: 'ledger-red',
    border: 'ledger-red-border',
    on: 'white',
    subtle: 'ledger-red-pale',
    text: 'ledger-red-text',
  }),
}));

jest.mock('../../src/features/ads/banner', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactNative = require('react-native') as typeof import('react-native');

  return {
    FreeTabBannerFooter: () =>
      React.createElement(ReactNative.View, {
        testID: 'mock-tab-banner-footer',
      }),
  };
});

const ledger: LedgerRow = {
  archivedAt: null,
  baseCurrency: 'KRW',
  colorKey: 'TEAL',
  createdAt: 1,
  currencyIsAssumed: false,
  description: '',
  emoji: null,
  iconKey: null,
  id: 'ledger-1' as LedgerRow['id'],
  invitePolicy: 'MANAGERS_ONLY',
  itemWritePolicy: 'ANY_MEMBER',
  lastOpenedAt: null,
  lastReadAt: null,
  maintenanceLock: 'NONE',
  memberCount: 1,
  muted: false,
  notifyComment: true,
  notifyNewItem: true,
  ownerId: 'user-1' as LedgerRow['ownerId'],
  periodStartDay: 1,
  pinnedAt: null,
  role: 'OWNER',
  rollupVersion: 1,
  sortOrder: 0,
  timeZone: 'Asia/Seoul',
  timeZoneIsAssumed: false,
  title: 'Home ledger',
  updatedAt: 1,
  weekStartsOn: 0,
};

const populatedLedger = {
  activeLedger: ledger,
  ledgerPaginationStatus: 'Exhausted' as const,
  ledgers: [ledger],
  loadMoreLedgers: jest.fn(),
  setActiveLedgerId: jest.fn(),
};

describe('authenticated tab layout', () => {
  beforeEach(() => {
    jest
      .mocked(useActiveLedger)
      .mockReturnValue(populatedLedger as ReturnType<typeof useActiveLedger>);
  });

  afterEach(() => {
    mockIsTablet = false;
  });

  it('places the shared banner footer after tabs and owns the bottom inset', () => {
    const screen = render(<TabLayout />);
    const shell = screen.getByTestId('authenticated-tab-shell');
    const tabs = screen.getByTestId('mock-tabs');
    const tree = screen.toJSON();

    // Tabs, footer and the loading-overlay slot. The slot renders nothing once
    // the ledger is known, so the host tree below keeps exactly two children.
    expect(shell.children).toHaveLength(3);
    if (tree === null || Array.isArray(tree))
      throw new Error('expected one tab shell root');
    expect(
      tree.children?.map((child) =>
        typeof child === 'string' ? child : child.props.testID,
      ),
    ).toEqual(['mock-tabs', 'mock-tab-banner-footer']);
    expect(tabs.props.accessibilityValue).toEqual({text: '0'});
    expect(tabs.props.accessibilityLabel).toBe('bottom:below-icon');
    expect(JSON.parse(tabs.props.accessibilityHint)).toMatchObject({
      activeTint: 'ledger-red-text',
      tabBarStyle: {height: 64, paddingBottom: 0},
      variant: 'uikit',
    });
  });

  it('paints tab scenes with the paper background, so no navigation gray shows before the first paint', () => {
    const screen = render(<TabLayout />);
    const tabs = screen.getByTestId('mock-tabs');

    expect(JSON.parse(tabs.props.accessibilityHint)).toMatchObject({
      sceneStyle: {backgroundColor: 'paper-bg'},
    });
  });

  it('uses a narrow branded rail for tablet navigation', () => {
    mockIsTablet = true;

    const screen = render(<TabLayout />);
    const tabs = screen.getByTestId('mock-tabs');

    expect(tabs.props.accessibilityLabel).toBe('left:below-icon');
    expect(JSON.parse(tabs.props.accessibilityHint)).toMatchObject({
      activeBackground: 'ledger-red-pale',
      activeTint: 'ledger-red-text',
      tabBarStyle: {minWidth: 104, width: 104},
      variant: 'material',
    });
  });

  it('exposes stable targets for every visible tab', () => {
    const screen = render(<TabLayout />);

    expect(screen.getByTestId('tab-monthly')).toBeTruthy();
    expect(screen.getByTestId('tab-timeline')).toBeTruthy();
    expect(screen.getByTestId('tab-stats')).toBeTruthy();
    expect(screen.getByTestId('tab-more')).toBeTruthy();
    expect(screen.getByLabelText('Monthly')).toBeTruthy();
    expect(screen.getByLabelText('List')).toBeTruthy();
    expect(screen.getByLabelText('Stats')).toBeTruthy();
    expect(screen.getByLabelText('More')).toBeTruthy();
    expect(screen.getByTestId('hidden-add-tab')).toBeTruthy();
  });

  it('hides the tab bar and ad footer when there is no ledger', () => {
    jest.mocked(useActiveLedger).mockReturnValue({
      ...populatedLedger,
      activeLedger: undefined,
      ledgers: [],
    });
    const screen = render(<TabLayout />);
    const tabs = screen.getByTestId('mock-tabs');

    expect(JSON.parse(tabs.props.accessibilityHint)).toMatchObject({
      tabBarStyle: {
        height: 0,
        opacity: 0,
        overflow: 'hidden',
        paddingBottom: 0,
      },
    });
    expect(screen.getByTestId('mock-tab-banner-footer')).toBeTruthy();
  });

  it('collapses the tablet rail to nothing when there is no ledger', () => {
    // A height-only collapse left the side rail's width behind as an empty
    // white column beside the content.
    mockIsTablet = true;
    jest.mocked(useActiveLedger).mockReturnValue({
      ...populatedLedger,
      activeLedger: null,
      ledgers: [],
    });
    const screen = render(<TabLayout />);
    const tabs = screen.getByTestId('mock-tabs');

    // Width alone was not enough: the tab bar's own paddingStart/paddingEnd
    // kept a 24pt column on a real iPad.
    expect(JSON.parse(tabs.props.accessibilityHint)).toMatchObject({
      tabBarStyle: {
        display: 'none',
        minWidth: 0,
        paddingEnd: 0,
        paddingStart: 0,
        width: 0,
      },
    });
  });

  it('covers the rail and content with one loading surface until the ledger resolves', () => {
    jest.mocked(useActiveLedger).mockReturnValue({
      ...populatedLedger,
      activeLedger: undefined,
      ledgers: undefined,
    });
    const screen = render(<TabLayout />);
    const tree = screen.toJSON();
    if (tree === null || Array.isArray(tree))
      throw new Error('expected one tab shell root');

    // Last child, so it paints above the tabs, rail included.
    expect(
      tree.children?.map((child) =>
        typeof child === 'string' ? child : child.props.testID,
      ),
    ).toEqual([
      'mock-tabs',
      'mock-tab-banner-footer',
      'mock-shell-loading-overlay',
    ]);

    jest
      .mocked(useActiveLedger)
      .mockReturnValue(populatedLedger as ReturnType<typeof useActiveLedger>);
    screen.rerender(<TabLayout />);
    expect(screen.queryByTestId('mock-shell-loading-overlay')).toBeNull();
  });

  it('shows the empty ledger canvas, not the loader, once the ledger is known to be absent', () => {
    jest.mocked(useActiveLedger).mockReturnValue({
      ...populatedLedger,
      activeLedger: null,
      ledgers: [],
    });
    const screen = render(<TabLayout />);

    expect(screen.queryByTestId('mock-shell-loading-overlay')).toBeNull();
  });
});
