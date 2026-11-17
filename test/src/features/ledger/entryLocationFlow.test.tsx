import 'react-native';


import type {AppleMaps} from 'expo-maps';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {CpkProvider} from 'cpk-ui';
import * as Location from 'expo-location';
import {Platform} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {EntryLocationPickerScreen} from '../../../../src/features/ledger/screens/entryLocationPickerImpl';
import {useEntryPickerStore} from '../../../../src/features/ledger/entryPickerStore';
import {theme} from '../../../../src/theme';

jest.mock('expo-location', () => ({
  Accuracy: {Balanced: 3},
  PermissionStatus: {GRANTED: 'granted'},
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  geocodeAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

jest.mock('expo-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {View} =
    jest.requireActual<typeof import('react-native')>('react-native');
  const NativeMap = React.forwardRef<AppleMaps.MapView, AppleMaps.MapProps>(
    function NativeMap(props, _ref) {
      return <View {...props} testID="native-map" />;
    },
  );
  const maps = {
    View: NativeMap,
    MapColorScheme: {LIGHT: 'LIGHT', DARK: 'DARK'},
  };
  return {AppleMaps: maps, GoogleMaps: maps};
});

const grant = jest.mocked(Location.requestForegroundPermissionsAsync);
const locate = jest.mocked(Location.getCurrentPositionAsync);
const search = jest.mocked(Location.geocodeAsync);
const reverse = jest.mocked(Location.reverseGeocodeAsync);
const permission = {
  status: Location.PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
} as const;
const position = {
  coords: {
    latitude: 37.5665,
    longitude: 126.978,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
};

function renderPicker(saved = false) {
  const onClose = jest.fn();
  const screen = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 0, bottom: 0, left: 0, right: 0},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <EntryLocationPickerScreen
          address={saved ? 'Seoul City Hall' : ''}
          label={saved ? 'City Hall' : ''}
          lat={saved ? '37.5665' : ''}
          lng={saved ? '126.978' : ''}
          ledgerId="synthetic-ledger"
          onClose={onClose}
        />
      </CpkProvider>
    </SafeAreaProvider>,
  );
  return {screen, onClose};
}

describe('native entry location selection', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.5');
    jest.clearAllMocks();
    useEntryPickerStore.getState().clearPlaceSelection();
    grant.mockResolvedValue(permission);
    locate.mockResolvedValue(position);
    search.mockResolvedValue([
      {latitude: 35.1796, longitude: 129.0756, altitude: 0, accuracy: 10},
    ]);
    reverse.mockResolvedValue([
      {
        name: 'City Hall',
        formattedAddress: null,
        street: 'Sejong-daero',
        streetNumber: '110',
        district: null,
        city: 'Seoul',
        region: 'Seoul',
        country: 'South Korea',
        isoCountryCode: 'KR',
        postalCode: null,
        subregion: null,
        timezone: null,
      },
    ]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows a fallback instead of a blank native map on iOS 16', () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('16.4');
    const {screen} = renderPicker();
    expect(screen.getByTestId('entry-location-map-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('native-map')).toBeNull();
    expect(locate).not.toHaveBeenCalled();
  });

  it('locates after first render and saves the pin with its resolved address', async () => {
    const {screen, onClose} = renderPicker();
    await waitFor(() =>
      expect(screen.getByTestId('native-map').props.markers).toEqual([
        expect.objectContaining({
          coordinates: {latitude: 37.5665, longitude: 126.978},
        }),
      ]),
    );
    fireEvent.press(screen.getByText('Done'));
    expect(locate).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: false,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useEntryPickerStore.getState().placeSelection).toEqual({
      ledgerId: 'synthetic-ledger',
      place: expect.objectContaining({
        lat: 37.5665,
        lng: 126.978,
        label: 'City Hall',
        countryCode: 'KR',
        address: expect.stringContaining('Sejong-daero'),
      }),
    });
  });

  it('reopens saved coordinates without replacing them with GPS', () => {
    const {screen} = renderPicker(true);
    expect(locate).not.toHaveBeenCalled();
    expect(grant).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('native-map').props.cameraPosition.coordinates,
    ).toEqual({latitude: 37.5665, longitude: 126.978});
  });

  it('searches an address, then clears that label after selecting a different pin', async () => {
    const {screen} = renderPicker(true);
    fireEvent.changeText(
      screen.getByTestId('entry-location-search-input'),
      'Busan City Hall',
    );
    fireEvent.press(screen.getByTestId('entry-location-search'));
    await waitFor(() =>
      expect(screen.getByTestId('native-map').props.markers[0]).toEqual(
        expect.objectContaining({
          title: 'Busan City Hall',
          coordinates: {latitude: 35.1796, longitude: 129.0756},
        }),
      ),
    );
    fireEvent(screen.getByTestId('native-map'), 'mapClick', {
      coordinates: {latitude: 35.16, longitude: 129.06},
    });
    expect(screen.getByTestId('entry-location-search-input').props.value).toBe(
      '',
    );
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() =>
      expect(reverse).toHaveBeenCalledWith({
        latitude: 35.16,
        longitude: 129.06,
      }),
    );
    expect(
      useEntryPickerStore.getState().placeSelection?.place?.label,
    ).not.toBe('Busan City Hall');
  });

  it('does not let a late GPS result replace a deliberately chosen pin', async () => {
    let resolvePosition: ((value: Location.LocationObject) => void) | undefined;
    locate.mockReturnValue(
      new Promise((resolve) => {
        resolvePosition = resolve;
      }),
    );
    const {screen} = renderPicker();
    await waitFor(() => expect(locate).toHaveBeenCalled());
    fireEvent(screen.getByTestId('native-map'), 'mapClick', {
      coordinates: {latitude: 35, longitude: 129},
    });
    await act(async () => resolvePosition?.(position));
    expect(
      screen.getByTestId('native-map').props.markers[0].coordinates,
    ).toEqual({latitude: 35, longitude: 129});
  });

  it('ignores work completed after cancellation', async () => {
    let resolvePosition: ((value: Location.LocationObject) => void) | undefined;
    locate.mockReturnValue(
      new Promise((resolve) => {
        resolvePosition = resolve;
      }),
    );
    const {screen, onClose} = renderPicker();
    await waitFor(() => expect(locate).toHaveBeenCalled());
    fireEvent.press(screen.getByLabelText('Cancel'));
    await act(async () => resolvePosition?.(position));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useEntryPickerStore.getState().placeSelection).toBeNull();
    expect(screen.getByTestId('native-map').props.markers).toEqual([]);
  });

  it('lets address search supersede an unfinished GPS request', async () => {
    let resolvePosition: ((value: Location.LocationObject) => void) | undefined;
    locate.mockReturnValue(
      new Promise((resolve) => {
        resolvePosition = resolve;
      }),
    );
    const {screen} = renderPicker();
    await waitFor(() => expect(locate).toHaveBeenCalled());
    fireEvent.changeText(
      screen.getByTestId('entry-location-search-input'),
      'Busan City Hall',
    );
    fireEvent.press(screen.getByTestId('entry-location-search'));
    await waitFor(() => expect(search).toHaveBeenCalledWith('Busan City Hall'));
    await act(async () => resolvePosition?.(position));
    expect(
      screen.getByTestId('native-map').props.markers[0].coordinates,
    ).toEqual({latitude: 35.1796, longitude: 129.0756});
  });
});
