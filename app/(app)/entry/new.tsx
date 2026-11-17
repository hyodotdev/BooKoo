import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {LedgerItemFormScreen} from '~/features/ledger/screens/entryEditor';
import {useActiveLedger} from '~/features/ledger/useActiveLedger';
import {AppScreen, ScreenSkeleton, ScreenState} from '~/features/ledger/ui';
import {t} from '~/utils/i18n';

export default function NewEntryRoute(): ReactElement {
  const params = useLocalSearchParams<{dayKey?: string}>();
  const {activeLedger} = useActiveLedger();
  if (activeLedger === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (activeLedger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('ledger.empty')} />
      </AppScreen>
    );
  const parsedDayKey = Number(params.dayKey);
  return (
    <LedgerItemFormScreen
      dayKey={Number.isSafeInteger(parsedDayKey) ? parsedDayKey : undefined}
      ledger={activeLedger}
    />
  );
}
