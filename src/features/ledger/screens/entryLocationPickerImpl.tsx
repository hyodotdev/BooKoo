import type {ReactElement} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {BackHandler, Keyboard, Platform, StyleSheet, View} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import * as Location from 'expo-location';
import {AppleMaps, GoogleMaps, type Coordinates} from 'expo-maps';
import {useRouter} from 'expo-router';
import {
  CustomPressable,
  EditText,
  Icon,
  LoadingIndicator,
  Typography,
  useCPK,
} from 'cpk-ui';

import {BookooBottomAction} from '~/components/uis/BookooBottomAction';
import {ledgerAccentSurface} from '~/theme/ledgerAccent';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';
import {EXACT_HIT_SLOP} from '~/theme/layout';
import {t} from '~/utils/i18n';
import {useEntryPickerStore, type EntryPlace} from '../entryPickerStore';
import {AppScreen} from '../ui';

interface MapCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

const SEOUL: MapCoordinate = {latitude: 37.5665, longitude: 126.978};
const MAP_ZOOM = 15;

function validCoordinate(value: Coordinates): value is MapCoordinate {
  return (
    value.latitude !== undefined &&
    value.longitude !== undefined &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}

const readableAddress = (
  address: Location.LocationGeocodedAddress | undefined,
): string =>
  [
    address?.name,
    address?.street,
    address?.streetNumber,
    address?.district,
    address?.city,
    address?.region,
  ]
    .filter((value, index, values): value is string =>
      value !== null && value !== undefined && value.length > 0
        ? values.indexOf(value) === index
        : false,
    )
    .join(' ');

async function ensureGeocodePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission.granted;
}

export function EntryLocationPickerScreen({
  address,
  label,
  lat,
  ledgerId,
  lng,
  onClose,
}: {
  address: string;
  label: string;
  lat: string;
  ledgerId: string;
  lng: string;
  readonly onClose?: () => void;
}): ReactElement {
  const router = useRouter();
  const appleMapRef = useRef<AppleMaps.MapView>(null);
  const googleMapRef = useRef<GoogleMaps.MapView>(null);
  const mapReady = useRef(false);
  const operation = useRef(0);
  const activeOperation = useRef(false);
  const {theme, themeType} = useCPK();
  const activeAccent = useLedgerAccent();
  const selectPlace = useEntryPickerStore((state) => state.selectPlace);
  // Expo's SwiftUI map needs iOS 17; Android needs an embedded native key.
  // Do not render a blank native wrapper on unsupported OS/web runtimes.
  const canRenderMap =
    (Platform.OS === 'ios' &&
      Number.parseInt(String(Platform.Version), 10) >= 17) ||
    (Platform.OS === 'android' &&
      Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY));
  const initialCoordinate = useMemo<MapCoordinate | null>(() => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    return lat.trim().length > 0 &&
      lng.trim().length > 0 &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
      ? {latitude, longitude}
      : null;
  }, [lat, lng]);
  const [coordinate, setCoordinate] = useState(initialCoordinate ?? SEOUL);
  const [hasSelection, setHasSelection] = useState(initialCoordinate !== null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [query, setQuery] = useState(address || label);
  const [selectedLabel, setSelectedLabel] = useState(label);
  const [pendingAction, setPendingAction] = useState<
    'finish' | 'locate' | 'search' | null
  >(initialCoordinate === null && canRenderMap ? 'locate' : null);
  const busy = pendingAction !== null;
  const [error, setError] = useState<string | null>(null);
  const close = useCallback((): void => {
    operation.current += 1;
    activeOperation.current = false;
    if (onClose !== undefined) {
      onClose();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)');
  }, [onClose, router]);

  useEffect(() => {
    if (Platform.OS !== 'android' || onClose === undefined) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        close();
        return true;
      },
    );

    return () => subscription.remove();
  }, [close, onClose]);

  useEffect(
    () => () => {
      operation.current += 1;
      activeOperation.current = false;
    },
    [],
  );

  const moveTo = useCallback((next: MapCoordinate) => {
    setCoordinate(next);
    setHasSelection(true);
    appleMapRef.current?.setCameraPosition({coordinates: next, zoom: MAP_ZOOM});
    googleMapRef.current?.setCameraPosition({
      coordinates: next,
      zoom: MAP_ZOOM,
      duration: 260,
    });
  }, []);
  const chooseCoordinate = useCallback(
    (event: {coordinates: Coordinates}) => {
      if (pendingAction === 'finish' || !validCoordinate(event.coordinates))
        return;
      // A deliberate pin selection supersedes a slower initial GPS/search result.
      operation.current += 1;
      activeOperation.current = false;
      setPendingAction(null);
      setCoordinate(event.coordinates);
      setHasSelection(true);
      setSelectedLabel('');
      setQuery('');
      setError(null);
      Keyboard.dismiss();
    },
    [pendingAction],
  );
  const search = useCallback(async (): Promise<void> => {
    const value = query.trim();
    if (
      !canRenderMap ||
      value.length === 0 ||
      (activeOperation.current && pendingAction !== 'locate')
    )
      return;
    // Manual search may supersede slow GPS without waiting for device services.
    activeOperation.current = true;
    const request = ++operation.current;
    setPendingAction('search');
    setError(null);
    try {
      if (!(await ensureGeocodePermission())) {
        if (operation.current !== request) return;
        setError(t('permission.locationDenied'));
        return;
      }
      if (operation.current !== request) return;
      const result = (await Location.geocodeAsync(value))[0];
      if (operation.current !== request) return;
      if (result === undefined || !validCoordinate(result)) {
        setError(t('common.noSearchResult'));
        return;
      }
      moveTo({latitude: result.latitude, longitude: result.longitude});
      setSelectedLabel(value);
      Keyboard.dismiss();
    } catch {
      if (operation.current === request) setError(t('error.generic'));
    } finally {
      if (operation.current === request) {
        activeOperation.current = false;
        setPendingAction(null);
      }
    }
  }, [canRenderMap, moveTo, pendingAction, query]);
  const resolveCurrentPosition = useCallback(
    async (request: number): Promise<void> => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (operation.current !== request) return;
        setLocationGranted(permission.granted);
        if (!permission.granted) {
          setError(t('permission.locationDenied'));
          return;
        }
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: false,
        });
        if (operation.current !== request) return;
        moveTo({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        setSelectedLabel('');
        setQuery('');
      } catch {
        if (operation.current === request) setError(t('error.generic'));
      } finally {
        if (operation.current === request) {
          activeOperation.current = false;
          setPendingAction(null);
        }
      }
    },
    [moveTo],
  );

  const locateMe = useCallback((): void => {
    if (activeOperation.current) return;
    activeOperation.current = true;
    const request = ++operation.current;
    setPendingAction('locate');
    setError(null);
    void resolveCurrentPosition(request);
  }, [resolveCurrentPosition]);

  useEffect(() => {
    if (initialCoordinate !== null || !canRenderMap) return;
    activeOperation.current = true;
    void resolveCurrentPosition(++operation.current);
  }, [canRenderMap, initialCoordinate, resolveCurrentPosition]);

  const syncInitialCamera = useCallback((): void => {
    if (mapReady.current) return;
    mapReady.current = true;
    if (hasSelection) moveTo(coordinate);
  }, [coordinate, hasSelection, moveTo]);

  const finish = useCallback(async (): Promise<void> => {
    if (activeOperation.current || !hasSelection) return;
    activeOperation.current = true;
    const request = ++operation.current;
    setPendingAction('finish');
    setError(null);
    try {
      if (!(await ensureGeocodePermission())) {
        if (operation.current !== request) return;
        setError(t('permission.locationDenied'));
        return;
      }
      if (operation.current !== request) return;
      const reverse = (
        await Location.reverseGeocodeAsync({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        })
      )[0];
      if (operation.current !== request) return;
      const resolvedAddress = readableAddress(reverse);
      const place: EntryPlace = {
        label:
          selectedLabel.trim() ||
          reverse?.name ||
          reverse?.street ||
          resolvedAddress ||
          `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
        lat: coordinate.latitude,
        lng: coordinate.longitude,
        ...(resolvedAddress.length === 0 ? {} : {address: resolvedAddress}),
        ...(reverse?.isoCountryCode === null ||
        reverse?.isoCountryCode === undefined
          ? {}
          : {countryCode: reverse.isoCountryCode}),
      };
      selectPlace({ledgerId, place});
      Keyboard.dismiss();
      close();
    } catch {
      if (operation.current === request) setError(t('error.generic'));
    } finally {
      if (operation.current === request) {
        activeOperation.current = false;
        setPendingAction(null);
      }
    }
  }, [close, coordinate, hasSelection, ledgerId, selectPlace, selectedLabel]);

  const mode = themeType === 'dark' ? 'dark' : 'light';
  const actionBackground = ledgerAccentSurface(activeAccent, mode).background;

  return (
    <AppScreen
      backgroundColor={theme.bg.basic}
      bottomInsetColor={actionBackground}
    >
      <KeyboardAvoidingView
        automaticOffset
        behavior="height"
        style={styles.flex}
      >
        <View style={styles.header}>
          <CustomPressable
            accessibilityLabel={t('common.cancel')}
            accessibilityRole="button"
            hitSlop={EXACT_HIT_SLOP}
            onPress={close}
            style={styles.headerAction}
          >
            <Icon color={theme.text.basic} name="X" size={22} />
          </CustomPressable>
          <Typography.Heading4
            $fontWeight="bold"
            style={[styles.headerTitle, {color: theme.text.basic}]}
          >
            {t('common.location')}
          </Typography.Heading4>
          <CustomPressable
            accessibilityLabel={t('common.none')}
            accessibilityRole="button"
            hitSlop={EXACT_HIT_SLOP}
            onPress={() => {
              selectPlace({ledgerId, place: null});
              close();
            }}
            style={styles.headerAction}
          >
            <Icon color={theme.text.label} name="Trash" size={21} />
          </CustomPressable>
        </View>
        <View style={styles.searchRow}>
          <EditText
            accessibilityLabel={t('common.searchPlaceholder')}
            autoCapitalize="words"
            decoration="boxed"
            hideCounter
            onChangeText={setQuery}
            onSubmitEditing={() => void search()}
            placeholder={t('common.searchPlaceholder')}
            startElement={
              <Icon color={theme.text.label} name="MagnifyingGlass" size={20} />
            }
            style={styles.searchInput}
            testID="entry-location-search-input"
            value={query}
          />
          <CustomPressable
            accessibilityLabel={t('common.searchPlaceholder')}
            accessibilityRole="button"
            accessibilityState={{
              busy: pendingAction === 'search',
              disabled:
                !canRenderMap ||
                pendingAction === 'finish' ||
                pendingAction === 'search',
            }}
            disabled={
              !canRenderMap ||
              pendingAction === 'finish' ||
              pendingAction === 'search'
            }
            onPress={() => void search()}
            testID="entry-location-search"
            style={[styles.roundAction, {backgroundColor: theme.role.primary}]}
          >
            {pendingAction === 'search' ? (
              <LoadingIndicator color={theme.text.contrast} size="small" />
            ) : (
              <Icon color={theme.text.contrast} name="ArrowRight" size={20} />
            )}
          </CustomPressable>
        </View>
        <View style={styles.mapFrame}>
          {canRenderMap ? (
            <>
              <View style={StyleSheet.absoluteFill} testID="entry-location-map">
                {Platform.OS === 'ios' ? (
                  <AppleMaps.View
                    cameraPosition={{
                      coordinates: initialCoordinate ?? SEOUL,
                      zoom: MAP_ZOOM,
                    }}
                    colorScheme={
                      themeType === 'dark'
                        ? AppleMaps.MapColorScheme.DARK
                        : AppleMaps.MapColorScheme.LIGHT
                    }
                    markers={
                      hasSelection
                        ? [
                            {
                              id: 'selected-place',
                              coordinates: coordinate,
                              title: selectedLabel || t('common.location'),
                              tintColor: activeAccent.text,
                            },
                          ]
                        : []
                    }
                    onMapClick={chooseCoordinate}
                    onCameraMove={syncInitialCamera}
                    properties={{isMyLocationEnabled: locationGranted}}
                    ref={appleMapRef}
                    style={StyleSheet.absoluteFill}
                    uiSettings={{myLocationButtonEnabled: false}}
                  />
                ) : (
                  <GoogleMaps.View
                    cameraPosition={{
                      coordinates: initialCoordinate ?? SEOUL,
                      zoom: MAP_ZOOM,
                    }}
                    colorScheme={
                      themeType === 'dark'
                        ? GoogleMaps.MapColorScheme.DARK
                        : GoogleMaps.MapColorScheme.LIGHT
                    }
                    markers={
                      hasSelection
                        ? [
                            {
                              id: 'selected-place',
                              coordinates: coordinate,
                              title: selectedLabel || t('common.location'),
                            },
                          ]
                        : []
                    }
                    onMapClick={chooseCoordinate}
                    onMapLoaded={syncInitialCamera}
                    properties={{isMyLocationEnabled: locationGranted}}
                    ref={googleMapRef}
                    style={StyleSheet.absoluteFill}
                    uiSettings={{
                      myLocationButtonEnabled: false,
                      mapToolbarEnabled: false,
                    }}
                  />
                )}
              </View>
              <CustomPressable
                accessibilityLabel={t('common.useCurrentLocation')}
                accessibilityRole="button"
                accessibilityState={{
                  busy: pendingAction === 'locate',
                  disabled: busy,
                }}
                disabled={busy}
                onPress={() => void locateMe()}
                testID="entry-location-current"
                style={[styles.locateButton, {backgroundColor: theme.bg.sheet}]}
              >
                {pendingAction === 'locate' ? (
                  <LoadingIndicator color={activeAccent.text} size="small" />
                ) : (
                  <Icon color={theme.role.primary} name="Crosshair" size={24} />
                )}
              </CustomPressable>
            </>
          ) : (
            <View
              style={[styles.mapUnavailable, {backgroundColor: theme.bg.basic}]}
              testID="entry-location-map-unavailable"
            >
              <Icon color={theme.text.label} name="MapPin" size={32} />
              <Typography.Body2
                style={[styles.mapUnavailableText, {color: theme.text.label}]}
              >
                {t('error.mapsUnavailable')}
              </Typography.Body2>
            </View>
          )}
          {pendingAction !== 'finish' ? null : (
            <View
              pointerEvents="auto"
              style={[styles.finishOverlay, {backgroundColor: theme.bg.basic}]}
              testID="entry-location-finishing"
            >
              <LoadingIndicator color={activeAccent.text} size="large" />
              <Typography.Body3 style={{color: theme.text.label}}>
                {t('common.loading')}
              </Typography.Body3>
            </View>
          )}
        </View>
        <BookooBottomAction
          disabled={
            !canRenderMap ||
            !hasSelection ||
            (busy && pendingAction !== 'finish')
          }
          helperText={error ?? undefined}
          helperTone="error"
          loading={pendingAction === 'finish'}
          onPress={() => void finish()}
          text={t('common.done')}
        />
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  finishOverlay: {
    alignItems: 'center',
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 8,
  },
  headerAction: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerTitle: {flex: 1, textAlign: 'center'},
  locateButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 24,
    bottom: 16,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    width: 48,
  },
  mapFrame: {flex: 1, overflow: 'hidden'},
  mapUnavailable: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  mapUnavailableText: {textAlign: 'center'},
  roundAction: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  searchInput: {flex: 1},
  searchRow: {alignItems: 'center', flexDirection: 'row', gap: 8, padding: 12},
});
