import {useCallback, useRef, useState} from 'react';
import {useAuthActions} from '@convex-dev/auth/react';
import {useMutation} from 'convex/react';
import {Image} from 'expo-image';

import {api} from '@convex/_generated/api';
import {currentExpoPushToken} from '~/features/push/provider';
import {Storage, storage} from '~/utils/storage';
import {releaseSocialSessions} from './social';

export function useSessionSignOut(): {
  readonly leaving: boolean;
  readonly signOut: () => Promise<void>;
} {
  const {signOut: convexSignOut} = useAuthActions();
  const unregisterToken = useMutation(
    api.notifications.mutations.unregisterToken,
  );
  const leavingRef = useRef(false);
  const [leaving, setLeaving] = useState(false);

  const signOut = useCallback(async (): Promise<void> => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      await Promise.allSettled([
        Image.clearMemoryCache(),
        Image.clearDiskCache(),
      ]);
      try {
        const token = await currentExpoPushToken();
        if (token !== null) await unregisterToken({token});
      } catch {
        // Sign-out must continue if the provider token cannot be resolved.
      }
      await releaseSocialSessions();
      await convexSignOut();
      storage.delete(Storage.SessionHint);
      storage.delete(Storage.ActiveLedgerId);
    } finally {
      leavingRef.current = false;
      setLeaving(false);
    }
  }, [convexSignOut, unregisterToken]);

  return {leaving, signOut};
}
