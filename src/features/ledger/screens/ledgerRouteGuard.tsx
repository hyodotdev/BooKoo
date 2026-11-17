import type {ReactElement} from 'react';
import {useEffect, useRef} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useQuery} from 'convex-helpers/react/cache';
import {useRouter} from 'expo-router';

import {api} from '@convex/_generated/api';
import {BookooButton} from '~/components/uis/BookooButton';
import {useLocale} from '~/hooks/useLocale';
import {t} from '~/utils/i18n';
import {canCreateEntry} from '../permissions';
import {useLedgerStore} from '../store';
import {AppScreen, ScreenSkeleton, ScreenState} from '../ui';

const LEDGER_HOME_ROUTE = '/(app)/(tabs)/(root)' as const;

/**
 * Treats a ledger route parameter as untrusted until Convex confirms that the
 * signed-in account still owns an active membership. No ledger-backed screen
 * is mounted while that boundary is unresolved.
 */
export function LedgerRouteGuard({
  ledgerId,
  showJoinedAction = false,
}: {
  readonly ledgerId: string;
  readonly showJoinedAction?: boolean;
}): ReactElement {
  useLocale();
  const router = useRouter();
  const handled = useRef(false);
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
  const setActiveLedgerId = useLedgerStore((state) => state.setActiveLedgerId);
  const canOfferEntry =
    ledger != null && showJoinedAction && canCreateEntry(ledger);

  useEffect(() => {
    if (ledger === undefined || handled.current) return;
    if (
      ledger !== null &&
      useLedgerStore.getState().activeLedgerId !== ledger.id
    ) {
      setActiveLedgerId(ledger.id);
    }
    // Keep the joined ledger selected even if the member leaves this screen
    // with the system back action or the app is interrupted.
    if (canOfferEntry) return;
    handled.current = true;

    if (ledger === null) {
      if (router.canGoBack()) router.back();
      else router.replace(LEDGER_HOME_ROUTE);
      return;
    }

    router.replace(LEDGER_HOME_ROUTE);
  }, [canOfferEntry, ledger, router, setActiveLedgerId]);

  if (ledger != null && canOfferEntry) {
    const continueToLedger = (addEntry: boolean): void => {
      if (handled.current) return;
      handled.current = true;
      router.replace(
        addEntry
          ? {
              pathname: '/ledger/[ledgerId]/item/new',
              params: {ledgerId: ledger.id, fromInvite: '1'},
            }
          : LEDGER_HOME_ROUTE,
      );
    };

    return (
      <AppScreen>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenState
            action={
              <View style={styles.actions}>
                <BookooButton
                  onPress={() => continueToLedger(true)}
                  testID="joined-invite-add-entry"
                  text={t('a11y.addEntry')}
                />
                <BookooButton
                  onPress={() => continueToLedger(false)}
                  testID="joined-invite-open-ledger"
                  text={t('common.done')}
                  type="text"
                />
              </View>
            }
            icon="CheckCircle"
            title={t('member.joinedLedger', {ledger: ledger.title})}
          />
        </ScrollView>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenSkeleton rows={1} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: {gap: 8},
  content: {flexGrow: 1, justifyContent: 'center'},
});
