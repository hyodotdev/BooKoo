import {requireNativeModule} from 'expo';
import {Appearance, Platform} from 'react-native';

type NativeColorScheme = 'light' | 'dark' | 'unspecified';

interface BookooAppearanceModule {
  setColorSchemeAsync(scheme: NativeColorScheme): Promise<void>;
}

export async function setNativeColorScheme(
  preference?: 'light' | 'dark',
): Promise<void> {
  const scheme = preference ?? 'unspecified';
  // RN controls iOS and AppCompat surfaces, but Android's separate Compose
  // activities do not inherit AppCompatDelegate's local override.
  Appearance.setColorScheme(scheme);
  if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
    await requireNativeModule<BookooAppearanceModule>(
      'BookooAppearance',
    ).setColorSchemeAsync(scheme);
  }
}
