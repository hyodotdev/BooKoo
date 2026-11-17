import {render} from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import CalendarRoute from '../../app/(app)/(tabs)/(root)/index';
import {
  CalendarMobile,
  CalendarTablet,
  useCalendarScreenProps,
} from '../../src/features/ledger/screens/calendar';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/features/ledger/screens/calendar', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLocal = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {View} = require('react-native') as typeof import('react-native');
  return {
    useCalendarScreenProps: jest.fn(() => ({marker: 'same-props'})),
    CalendarMobile: jest.fn(({marker}: {marker: string}) =>
      ReactLocal.createElement(View, {testID: `mobile-${marker}`}),
    ),
    CalendarTablet: jest.fn(({marker}: {marker: string}) =>
      ReactLocal.createElement(View, {testID: `tablet-${marker}`}),
    ),
  };
});

const windowSize = jest.mocked(ReactNative.useWindowDimensions);
const mockUseCalendarScreenProps = jest.mocked(useCalendarScreenProps);
const mockMobile = jest.mocked(CalendarMobile);
const mockTablet = jest.mocked(CalendarTablet);

describe('responsive tab routes', () => {
  beforeEach(() => {
    windowSize.mockReturnValue({
      width: 402,
      height: 874,
      scale: 3,
      fontScale: 1,
    });
    mockUseCalendarScreenProps.mockClear();
    mockMobile.mockClear();
    mockTablet.mockClear();
  });

  it('renders the phone variant with the container props', () => {
    const screen = render(<CalendarRoute />);

    expect(screen.getByTestId('mobile-same-props')).toBeTruthy();
    expect(mockUseCalendarScreenProps).toHaveBeenCalledTimes(1);
    expect(mockMobile).toHaveBeenCalledWith(
      expect.objectContaining({marker: 'same-props'}),
      undefined,
    );
  });

  it('renders the tablet variant with the same container props', () => {
    windowSize.mockReturnValue({
      width: 600,
      height: 1024,
      scale: 1,
      fontScale: 1,
    });

    const screen = render(<CalendarRoute />);

    expect(screen.getByTestId('tablet-same-props')).toBeTruthy();
    expect(mockUseCalendarScreenProps).toHaveBeenCalledTimes(1);
    expect(mockTablet).toHaveBeenCalledWith(
      expect.objectContaining({marker: 'same-props'}),
      undefined,
    );
  });
});
