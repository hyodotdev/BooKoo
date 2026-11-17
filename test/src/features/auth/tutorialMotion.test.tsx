import type {ReactElement} from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {ScrollView, type NativeScrollEvent} from 'react-native';
import {CpkProvider, PageIndicator} from 'cpk-ui';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useReducedMotion} from 'react-native-reanimated';

import {TutorialScreen} from '../../../../src/features/auth/tutorial';
import {theme} from '../../../../src/theme';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({width: 390, height: 844, scale: 1, fontScale: 1}),
}));

function renderTutorial(child: ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <CpkProvider themeConfig={{customTheme: theme}}>{child}</CpkProvider>
    </SafeAreaProvider>,
  );
}

jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual(
    '../../../../__mocks__/react-native-reanimated',
  );
  const native = jest.requireActual('react-native');
  const react = jest.requireActual('react');
  return {
    ...mock,
    default: {...mock.default, ScrollView: native.ScrollView},
    useSharedValue: (initial: number) =>
      react.useRef(mock.useSharedValue(initial)).current,
    useAnimatedScrollHandler:
      (callback: (event: NativeScrollEvent) => void) =>
      (event: {nativeEvent: NativeScrollEvent}) =>
        callback(event.nativeEvent),
  };
});

function scroll(x: number, width = 390): {nativeEvent: NativeScrollEvent} {
  return {
    nativeEvent: {
      contentOffset: {x, y: 0},
      layoutMeasurement: {width, height: 700},
      contentSize: {width: width * 3, height: 700},
      contentInset: {top: 0, bottom: 0, left: 0, right: 0},
      zoomScale: 1,
    },
  };
}

describe('tutorial native pager contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('tracks a partial swipe and reversal without changing the settled page', () => {
    const screen = renderTutorial(<TutorialScreen onFinished={jest.fn()} />);
    const pager = screen.getByTestId('tutorial-pager');
    fireEvent.scroll(pager, scroll(195));
    expect(screen.UNSAFE_getByType(PageIndicator).props.progress.get()).toBe(
      0.5,
    );
    expect(screen.getByTestId('tutorial-dot-indicator')).toHaveProp(
      'accessibilityValue',
      {min: 0, max: 3, now: 1},
    );
    fireEvent.scroll(pager, scroll(78));
    expect(screen.UNSAFE_getByType(PageIndicator).props.progress.get()).toBe(
      0.2,
    );
    fireEvent(pager, 'momentumScrollEnd', scroll(390));
    expect(screen.getByTestId('tutorial-dot-indicator')).toHaveProp(
      'accessibilityValue',
      {min: 0, max: 3, now: 2},
    );
  });

  it('does not skip pages or finish early when Next is tapped repeatedly', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const onFinished = jest.fn();
    const screen = renderTutorial(<TutorialScreen onFinished={onFinished} />);
    const next = screen.getByTestId('tutorial-next');
    fireEvent.press(next);
    fireEvent.press(next);
    fireEvent.press(next);
    expect(onFinished).not.toHaveBeenCalled();
    expect(scrollTo.mock.calls.map(([options]) => options)).toEqual([
      {animated: true, x: 390},
      {animated: true, x: 390},
      {animated: true, x: 390},
    ]);
    fireEvent(
      screen.getByTestId('tutorial-pager'),
      'momentumScrollEnd',
      scroll(390),
    );
    fireEvent.press(screen.getByTestId('tutorial-next'));
    expect(onFinished).not.toHaveBeenCalled();
    fireEvent(
      screen.getByTestId('tutorial-pager'),
      'momentumScrollEnd',
      scroll(780),
    );
    // The native progress range must finish at 100%, never 150%.
    expect(screen.getByTestId('tutorial-dot-indicator')).toHaveProp(
      'accessibilityValue',
      {min: 0, max: 3, now: 3},
    );
    fireEvent.press(screen.getByTestId('tutorial-next'));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('advances immediately without motion or a momentum callback when reduced', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const screen = renderTutorial(<TutorialScreen onFinished={jest.fn()} />);
    fireEvent.press(screen.getByTestId('tutorial-next'));
    expect(scrollTo).toHaveBeenLastCalledWith({animated: false, x: 390});
    expect(screen.getByTestId('tutorial-dot-indicator')).toHaveProp(
      'accessibilityValue',
      {min: 0, max: 3, now: 2},
    );
  });

  it('retains the selected page when the viewport rotates', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 0;
      });
    const screen = renderTutorial(<TutorialScreen onFinished={jest.fn()} />);
    fireEvent(
      screen.getByTestId('tutorial-pager'),
      'momentumScrollEnd',
      scroll(390),
    );
    act(() =>
      fireEvent(screen.getByTestId('tutorial-pager'), 'layout', {
        nativeEvent: {layout: {x: 0, y: 0, width: 900, height: 400}},
      }),
    );
    expect(scrollTo).toHaveBeenLastCalledWith({animated: false, x: 900});
    expect(screen.getByTestId('tutorial-dot-indicator')).toHaveProp(
      'accessibilityValue',
      {min: 0, max: 3, now: 2},
    );
  });
});
