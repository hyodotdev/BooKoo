import type {ColorSchemeName} from 'react-native';

/** Keep system-bar glyphs legible and consistent with the active app theme. */
export function statusBarStyleForTheme(
  themeType: ColorSchemeName,
): 'dark-content' | 'light-content' {
  return themeType === 'dark' ? 'light-content' : 'dark-content';
}
