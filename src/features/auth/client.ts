import {ConvexReactClient} from 'convex/react';
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type {TokenStorage} from '@convex-dev/auth/react';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (convexUrl === undefined || convexUrl.trim().length === 0)
  throw new Error('EXPO_PUBLIC_CONVEX_URL is required');

export const convexClient = new ConvexReactClient(convexUrl, {
  unsavedChangesWarning: false,
});

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureAuthStorage: TokenStorage | undefined =
  Platform.OS === 'web'
    ? undefined
    : {
        // A locked or temporarily unavailable keychain must not strand a
        // signed-out user behind the native splash screen. Treat an unreadable
        // token as absent; writes still fail loudly so a sign-in is never
        // reported as durable when it was not persisted.
        getItem: async (key) => {
          try {
            return await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
          } catch {
            return null;
          }
        },
        setItem: (key, value) =>
          SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS),
        removeItem: async (key) => {
          try {
            await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
          } catch {
            // The inaccessible token cannot be used by this process anyway.
          }
        },
      };
