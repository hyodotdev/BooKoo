import type {ReactElement} from 'react';
import {useRouter} from 'expo-router';

import {useCPK} from 'cpk-ui';

import {useOpenLedgerDrawer} from '~/features/ledger/drawer';
import {LedgerSettingsScreen} from '~/features/ledger/screens/ledgerAdmin';
import {
  AppScreen,
  NoLedgerEmptyCanvas,
  ScreenSkeleton,
  statusBarStyleForTheme,
} from '~/features/ledger/ui';
import {useActiveLedger} from '~/features/ledger/useActiveLedger';
import {brandLedgerSurface} from '~/theme/ledgerAccent';

export default function MeRoute(): ReactElement {
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const openDrawer = useOpenLedgerDrawer();
  const {activeLedger} = useActiveLedger();

  if (activeLedger === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton centerOnScreen rows={5} />
      </AppScreen>
    );

  if (activeLedger === null)
    return (
      <AppScreen
        backgroundColor={theme.bg.paper}
        statusBarBackgroundColor={
          brandLedgerSurface(themeType === 'dark' ? 'dark' : 'light')
            .background
        }
        statusBarStyle={statusBarStyleForTheme(themeType)}
      >
        <NoLedgerEmptyCanvas
          onAdd={() => router.navigate('/ledgers/new')}
          onOpenDrawer={openDrawer}
        />
      </AppScreen>
    );

  return (
    <LedgerSettingsScreen
      initialLedger={activeLedger}
      ledgerId={activeLedger.id}
      onOpenDrawer={openDrawer}
      presentation="tab"
    />
  );
}
