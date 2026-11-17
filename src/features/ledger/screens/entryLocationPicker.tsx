import type {ComponentProps, ReactElement} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {requireOptionalNativeModule} from 'expo';

import {t} from '~/utils/i18n';

type ImplProps = ComponentProps<
  typeof import('./entryLocationPickerImpl').EntryLocationPickerScreen
>;

function LocationPickerUnavailable(): ReactElement {
  return (
    <View style={styles.frame} testID="location-picker-unavailable">
      <Text style={styles.title}>{t('error.mapsUnavailable')}</Text>
      <Text style={styles.body}>{t('error.generic')}</Text>
    </View>
  );
}

/**
 * Expo Router and the entry editor import this screen into the main bundle.
 * A missing ExpoLocation / ExpoMaps native module must not take down the whole
 * app with a redbox during route evaluation — show a recovery surface instead.
 */
export function EntryLocationPickerScreen(props: ImplProps): ReactElement {
  const hasLocation = requireOptionalNativeModule('ExpoLocation') != null;
  const hasMaps = requireOptionalNativeModule('ExpoMaps') != null;
  if (!hasLocation || !hasMaps) return <LocationPickerUnavailable />;

  let Impl: (typeof import('./entryLocationPickerImpl'))['EntryLocationPickerScreen'];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Impl = (
      require('./entryLocationPickerImpl') as typeof import('./entryLocationPickerImpl')
    ).EntryLocationPickerScreen;
  } catch {
    return <LocationPickerUnavailable />;
  }
  return <Impl {...props} />;
}

const styles = StyleSheet.create({
  body: {color: '#5B6472', fontSize: 15, lineHeight: 22},
  frame: {flex: 1, gap: 12, justifyContent: 'center', padding: 24},
  title: {color: '#102A43', fontSize: 22, fontWeight: '700'},
});
