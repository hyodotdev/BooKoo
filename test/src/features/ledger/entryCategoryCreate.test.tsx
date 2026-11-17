import 'react-native';

import {act, fireEvent, render} from '@testing-library/react-native';
import {FlashList} from '@shopify/flash-list';
import {useMutation, useQuery} from 'convex/react';
import {CpkProvider} from 'cpk-ui';
import {router, Stack} from 'expo-router';
import {Dimensions, Platform, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {
  EntryCategoryCreateScreen,
  EntryCategoryPickerScreen,
} from '../../../../src/features/ledger/screens/entryCategoryPicker';
import {theme} from '../../../../src/theme';
import {t} from '../../../../src/utils/i18n';

describe('category creator keyboard ownership', () => {
  afterEach(() => jest.restoreAllMocks());

  it('allows retry on failure but stays busy during successful native dismissal', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.mocked(useQuery).mockReturnValue({id: 'ledger-test'});
    const mutation = Object.assign(
      jest
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({key: 'coffee-qa'}),
      {withOptimisticUpdate: jest.fn()},
    );
    jest.mocked(useMutation).mockReturnValue(mutation);
    jest.mocked(router.dismiss).mockClear();
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 412, height: 924},
          insets: {top: 60, left: 0, right: 0, bottom: 24},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <EntryCategoryCreateScreen kind="EXPENSE" ledgerId="ledger-test" />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    fireEvent.changeText(
      screen.getByTestId('entry-category-create-name'),
      'Coffee',
    );
    const save = screen.getByRole('button', {name: t('screen.save')});
    await act(async () => fireEvent.press(save));
    expect(router.dismiss).not.toHaveBeenCalled();
    expect(save).not.toBeDisabled();
    await act(async () => fireEvent.press(save));
    expect(router.dismiss).toHaveBeenCalledWith(2);
    expect(save).toBeDisabled();
    fireEvent.press(save);
    expect(mutation).toHaveBeenCalledTimes(2);
  });

  it('shows a missing ledger instead of waiting for its skipped category query', () => {
    jest.mocked(useQuery).mockReturnValueOnce(null).mockReturnValue(undefined);
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 412, height: 924},
          insets: {top: 60, left: 0, right: 0, bottom: 24},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <EntryCategoryPickerScreen
            kind="EXPENSE"
            ledgerId="missing-ledger"
            selectedKey=""
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText(t('error.ledger.notFound'))).toBeTruthy();
    // A bare link opened this state with no visible way out of the sheet.
    fireEvent.press(screen.getByTestId('entry-category-close'));
    expect(router.back).toHaveBeenCalled();
  });

  it('keeps the create sheet closable when its ledger is missing', () => {
    jest.mocked(useQuery).mockReturnValue(null);
    jest.mocked(router.back).mockClear();
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 412, height: 924},
          insets: {top: 60, left: 0, right: 0, bottom: 24},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <EntryCategoryCreateScreen kind="EXPENSE" ledgerId="missing-ledger" />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText(t('error.ledger.notFound'))).toBeTruthy();
    fireEvent.press(screen.getByTestId('entry-category-create-close'));
    expect(router.back).toHaveBeenCalled();
  });

  it.each(['android', 'ios'] as const)(
    'uses one keyboard resize owner on %s',
    (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      jest.mocked(useQuery).mockReturnValue({id: 'ledger-test'});
      const screen = render(
        <SafeAreaProvider
          initialMetrics={{
            frame: {x: 0, y: 0, width: 412, height: 924},
            insets: {top: 60, left: 0, right: 0, bottom: 24},
          }}
        >
          <CpkProvider
            themeConfig={{customTheme: theme, initialThemeType: 'light'}}
          >
            <EntryCategoryCreateScreen kind="EXPENSE" ledgerId="ledger-test" />
          </CpkProvider>
        </SafeAreaProvider>,
      );
      // The keyboard-controller Jest adapter renders its avoiding view as View.
      const avoidingView = screen
        .UNSAFE_getAllByType(View)
        .find((view) => view.props.behavior === 'height');
      expect(avoidingView).toBeDefined();
      expect(avoidingView?.props.enabled).toBe(platform !== 'android');
      fireEvent.changeText(
        screen.getByTestId('entry-category-create-name'),
        'Weekend\n food',
      );
      expect(screen.getByTestId('entry-category-create-name')).toHaveProp(
        'value',
        'Weekendfood',
      );
      if (platform === 'android') {
        expect(
          screen.UNSAFE_getByType(Stack.Screen).props.options
            .unstable_sheetFooter,
        ).toEqual(expect.any(Function));
      } else {
        expect(screen.UNSAFE_queryByType(Stack.Screen)).toBeNull();
      }
    },
  );
});

describe('category picker grid', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sizes its columns from the sheet, not the wider window', () => {
    // iPad landscape: a 1133pt window presents the picker in a ~512pt sheet.
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({width: 1133, height: 744, scale: 2, fontScale: 1});
    jest.mocked(useQuery).mockImplementation(((
      _query: unknown,
      args: unknown,
    ) => {
      if (args === 'skip') return undefined;
      const {ledgerId} = args as {ledgerId: string};
      if (ledgerId === 'route-ledger') return {id: 'ledger-doc'};
      return [
        {
          key: 'mobileFee',
          kind: 'EXPENSE',
          label: 'Phone & internet',
          iconKey: 'DeviceMobile',
          colorToken: 'TEAL',
          hidden: false,
          archived: false,
        },
      ];
    }) as typeof useQuery);
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 1133, height: 744},
          insets: {top: 24, left: 0, right: 0, bottom: 20},
        }}
      >
        <CpkProvider
          themeConfig={{customTheme: theme, initialThemeType: 'light'}}
        >
          <EntryCategoryPickerScreen
            kind="EXPENSE"
            ledgerId="route-ledger"
            selectedKey=""
          />
        </CpkProvider>
      </SafeAreaProvider>,
    );
    const grid = () => screen.UNSAFE_getByType(FlashList);
    expect(grid().props.numColumns).toBe(6);
    fireEvent(grid(), 'layout', {
      nativeEvent: {layout: {x: 0, y: 0, width: 512, height: 600}},
    });
    expect(grid().props.numColumns).toBe(4);
    // Capped like other compact controls: uncapped large text cut "Drinks"
    // to "Drin...".
    expect(screen.getByText('Phone & internet')).toHaveProp(
      'maxFontSizeMultiplier',
      1.25,
    );
  });
});
