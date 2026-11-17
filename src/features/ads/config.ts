import {Platform} from 'react-native';
import Constants from 'expo-constants';

const IOS_APP_KEY = process.env.EXPO_PUBLIC_LEVELPLAY_IOS_APP_KEY ?? '';
const ANDROID_APP_KEY = process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_APP_KEY ?? '';
const IOS_BANNER_ID = process.env.EXPO_PUBLIC_LEVELPLAY_IOS_BANNER_ID ?? '';
const ANDROID_BANNER_ID =
  process.env.EXPO_PUBLIC_LEVELPLAY_ANDROID_BANNER_ID ?? '';

export const TAB_SHELL_PLACEMENT = 'tab_shell_banner';

/** SDK diagnostics only; test creatives require separately verified test mode. */
export function isAdDebugEnabled(): boolean {
  const stage: unknown = Constants.expoConfig?.extra?.stage;
  return __DEV__ || stage === 'development' || stage === 'preview';
}

export function bannerUnitId(): string | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  const id = Platform.OS === 'ios' ? IOS_BANNER_ID : ANDROID_BANNER_ID;

  return id.length === 0 ? null : id;
}

export function adAppKey(): string | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  const key = Platform.OS === 'ios' ? IOS_APP_KEY : ANDROID_APP_KEY;
  return key.length === 0 ? null : key;
}

export function isAdRuntimeConfigured(): boolean {
  return adAppKey() !== null && bannerUnitId() !== null;
}
