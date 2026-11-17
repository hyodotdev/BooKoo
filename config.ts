import Constants, {ExecutionEnvironment} from 'expo-constants';
import * as Application from 'expo-application';

// OTA manifests may carry a newer marketing version than the installed binary.
export const appVersion =
  (Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? null
    : Application.nativeApplicationVersion) ??
  Constants?.expoConfig?.version ??
  '0.0.0';
export const easProjectId = Constants?.expoConfig?.extra?.eas?.projectId;

/** Convex deployment URL — injected at build time, never from `extra`. */
export const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';
export const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? '';
