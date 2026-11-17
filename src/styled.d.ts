import type {AppThemeColors} from './theme';

declare module 'kstyled' {
  interface DefaultTheme extends AppThemeColors {
    isPortrait?: boolean;
    isDesktop?: boolean;
    isTablet?: boolean;
    isMobile?: boolean;
  }
}
