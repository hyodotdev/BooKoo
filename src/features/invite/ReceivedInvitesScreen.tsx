import type {FunctionReturnType} from 'convex/server';
import {usePaginatedQuery} from 'convex-helpers/react/cache';
import {FlashList} from '@shopify/flash-list';
import {Redirect, useRouter} from 'expo-router';
import {Button, CustomPressable, Icon, Typography, useCPK} from 'cpk-ui';
import {memo, useCallback, useState, type ReactElement} from 'react';
import {StyleSheet, View} from 'react-native';

import {api} from '@convex/_generated/api';
import {useSession} from '~/features/auth/session';
import {
  AppScreen,
  ListFooter,
  ScreenSkeleton,
  ScreenState,
} from '~/features/ledger/ui';
import {useLocale} from '~/hooks/useLocale';
import {formatDate, t, type SupportedLocale} from '~/utils/i18n';
import {inviteRoleLabel} from './access';

const PAGE_SIZE = 20;
type Invite = FunctionReturnType<
  typeof api.invites.queries.receivedPaginated
>['page'][number];

const ReceivedInviteRow = memo(function ReceivedInviteRow({
  item,
  locale,
  onOpen,
}: {
  item: Invite;
  locale: SupportedLocale;
  onOpen: (id: Invite['id']) => void;
}): ReactElement {
  const {theme} = useCPK();
  return (
    <CustomPressable
      accessibilityRole="button"
      onPress={() => onOpen(item.id)}
      style={[styles.row, {backgroundColor: theme.bg.basic}]}
      testID="received-invite-row"
    >
      <View style={styles.copy}>
        <Typography.Body2 $fontWeight="bold" style={{color: theme.text.basic}}>
          {item.title}
        </Typography.Body2>
        <Typography.Body3 style={{color: theme.text.label}}>
          {inviteRoleLabel(item.role)}
        </Typography.Body3>
        {item.expiresAt === null ? null : (
          <Typography.Body4 style={{color: theme.text.label}}>
            {t('member.linkExpires', {
              date: formatDate(item.expiresAt, 'PP', locale),
            })}
          </Typography.Body4>
        )}
      </View>
      <Icon name="CaretRight" size={20} color={theme.text.label} />
    </CustomPressable>
  );
});

export function ReceivedInvitesScreen(): ReactElement {
  const router = useRouter();
  const {stage} = useSession();
  const {locale} = useLocale();
  const [now] = useState(Date.now);
  const {results, status, loadMore} = usePaginatedQuery(
    api.invites.queries.receivedPaginated,
    stage === 'ready' ? {now} : 'skip',
    {initialNumItems: PAGE_SIZE},
  );
  const openInvite = useCallback(
    (inviteId: Invite['id']): void => {
      router.navigate({pathname: '/invites/[inviteId]', params: {inviteId}});
    },
    [router],
  );
  const renderItem = useCallback(
    ({item}: {item: Invite}) => (
      <ReceivedInviteRow item={item} locale={locale} onOpen={openInvite} />
    ),
    [locale, openInvite],
  );
  if (stage !== 'ready' && stage !== 'loading') return <Redirect href="/" />;
  if (status === 'LoadingFirstPage')
    return (
      <AppScreen>
        <ScreenSkeleton rows={4} />
      </AppScreen>
    );
  return (
    <AppScreen>
      <FlashList
        contentContainerStyle={styles.list}
        data={results}
        extraData={locale}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Button
            onPress={() => router.navigate('/invite/code')}
            text={t('member.enterInviteCode')}
            type="outlined"
          />
        }
        ListEmptyComponent={
          status === 'Exhausted' ? (
            <ScreenState compact title={t('member.noReceivedInvites')} />
          ) : null
        }
        ListFooterComponent={
          status === 'CanLoadMore' ? (
            <Button
              onPress={() => loadMore(PAGE_SIZE)}
              text={t('common.more')}
              type="outlined"
            />
          ) : (
            <ListFooter
              loading={status === 'LoadingMore'}
              exhausted={status === 'Exhausted'}
            />
          )
        }
        onEndReached={() => {
          if (status === 'CanLoadMore' && results.length > 0)
            loadMore(PAGE_SIZE);
        }}
        onEndReachedThreshold={0.5}
        renderItem={renderItem}
        testID="received-invites-list"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  copy: {flex: 1, gap: 3},
  list: {paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16},
  row: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    minHeight: 64,
    padding: 14,
  },
});
