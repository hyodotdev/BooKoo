import type {PropsWithChildren, ReactElement} from 'react';

import {AdRuntimeProvider} from '~/features/ads/provider';
import {NotificationProvider} from '~/features/push/provider';
import {LedgerAccentProvider} from '~/theme/ledgerAccentProvider';
import {PresenceProvider} from './presence';
import {SoftUpdateSheet} from './softUpdate';

export function ReadyProviders({children}: PropsWithChildren): ReactElement {
  return (
    <LedgerAccentProvider>
      <NotificationProvider>
        <AdRuntimeProvider>
          <PresenceProvider>{children}</PresenceProvider>
        </AdRuntimeProvider>
      </NotificationProvider>
      <SoftUpdateSheet />
    </LedgerAccentProvider>
  );
}
