import type {PropsWithChildren, ReactElement} from 'react';
import {useCallback, useEffect, useRef} from 'react';
import {AppState, Platform} from 'react-native';
import {useMutation} from 'convex/react';
import * as Application from 'expo-application';

import {api} from '@convex/_generated/api';
import {QA_APPLICATION_ID} from '@shared/application';
import {useLocale} from '~/hooks/useLocale';
import {useCurrentUser} from '~/features/auth/currentUser';
import {readIpCountryCode} from './ipCountry';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function PresenceProvider({children}: PropsWithChildren): ReactElement {
  const touchPresence = useMutation(api.user.mutations.touchPresence);
  const {locale} = useLocale();
  const user = useCurrentUser();
  const countryEnabled = user?.countryAnalyticsEnabled === true;
  const lastTouch = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const touch = useCallback((): void => {
    // Local debug installs and the separate QA binary must not mark a
    // production account active merely because an agent exercised the UI.
    if (__DEV__ || Application.applicationId === QA_APPLICATION_ID) return;
    if (
      AppState.currentState === 'background' ||
      AppState.currentState === 'inactive'
    )
      return;
    const now = Date.now();
    if (now - lastTouch.current < TOUCH_INTERVAL_MS) return;
    const buildNumber = Number(Application.nativeBuildVersion);
    if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) return;
    lastTouch.current = now;
    const controller = new AbortController();
    pending.current = controller;
    const payload = {
      platform:
        Platform.OS === 'ios'
          ? ('ios' as const)
          : Platform.OS === 'android'
            ? ('android' as const)
            : ('web' as const),
      appVersion: Application.nativeApplicationVersion ?? '0.0.0',
      buildNumber,
      locale,
    };
    void (async () => {
      // Record the foreground immediately. Optional enrichment must not delay
      // the baseline heartbeat or lose a brief foreground visit.
      await touchPresence(payload);
      if (!countryEnabled || controller.signal.aborted) return;
      const ipCountryCode = await readIpCountryCode(controller.signal);
      if (controller.signal.aborted || ipCountryCode === undefined) return;
      await touchPresence({...payload, ipCountryCode});
    })()
      .catch(() => {
        if (pending.current === controller) lastTouch.current = 0;
      })
      .finally(() => {
        if (pending.current === controller) {
          pending.current = null;
          if (controller.signal.aborted) lastTouch.current = 0;
        }
      });
  }, [countryEnabled, locale, touchPresence]);
  useEffect(() => {
    if (pending.current?.signal.aborted) {
      pending.current = null;
      lastTouch.current = 0;
    }
    touch();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') touch();
      else if (pending.current !== null) {
        pending.current.abort();
        lastTouch.current = 0;
      }
    });
    return () => {
      pending.current?.abort();
      subscription.remove();
    };
  }, [touch]);
  return <>{children}</>;
}
