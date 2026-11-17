import type {ReactElement} from 'react';
import {memo, useCallback, useMemo, useState} from 'react';
import {StyleSheet, useWindowDimensions, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {Image} from 'expo-image';
import {useRouter} from 'expo-router';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import {RectButton} from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import {EditText, Icon, Typography, useCPK, type IconName} from 'cpk-ui';
import type {ButtonColorType} from 'cpk-ui/components/uis/Button/Button';
import type {FunctionReturnType} from 'convex/server';

import {api} from '@convex/_generated/api';
import type {LedgerRole} from '@shared/ledgerRoles';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {BookooButton} from '~/components/uis/BookooButton';
import {BookooLoading} from '~/components/uis/BookooLoading';
import {useSession} from '~/features/auth/session';
import {ledgerAccentSurface} from '~/theme/ledgerAccent';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';
import {DETAIL_CONTENT_TOP} from '~/theme/layout';
import {t, tCount} from '~/utils/i18n';
import {memberActionPlan, type MemberManagementAction} from '../memberActions';
import type {LedgerRow} from '../types';
import {AppScreen, LedgerMark, ScreenSkeleton, ScreenState} from '../ui';

type MemberRow = FunctionReturnType<
  typeof api.ledgers.queries.rosterPaginated
>['page'][number];

interface ActionMeta {
  readonly color: ButtonColorType;
  readonly icon: IconName;
  readonly label: string;
  readonly body: (name: string) => string;
}

const actionMeta = (action: MemberManagementAction): ActionMeta => {
  switch (action) {
    case 'TRANSFER_OWNERSHIP':
      return {
        color: 'warning',
        icon: 'Crown',
        label: t('member.transferOwnership'),
        body: (name) => t('member.transferOwnershipBody', {name}),
      };
    case 'ASSIGN_ADMIN':
      return {
        color: 'primary',
        icon: 'ShieldStar',
        label: t('member.assignAdministrator'),
        body: (name) => t('member.assignAdministratorBody', {name}),
      };
    case 'REMOVE_ADMIN':
      return {
        color: 'secondary',
        icon: 'ShieldSlash',
        label: t('member.removeAdministrator'),
        body: (name) => t('member.removeAdministratorBody', {name}),
      };
    case 'MAKE_MEMBER':
      return {
        color: 'primary',
        icon: 'UserPlus',
        label: t('member.makeMember'),
        body: (name) => t('member.makeMemberBody', {name}),
      };
    case 'MAKE_VIEWER':
      return {
        color: 'info',
        icon: 'Eye',
        label: t('member.makeViewer'),
        body: (name) => t('member.makeViewerBody', {name}),
      };
    case 'REMOVE_MEMBER':
      return {
        color: 'danger',
        icon: 'UserMinus',
        label: t('member.delete'),
        body: (name) => t('member.removeMemberBody', {name}),
      };
  }
};

const roleLabel = (role: LedgerRole): string => {
  switch (role) {
    case 'OWNER':
      return t('member.owner');
    case 'ADMIN':
      return t('member.administrator');
    case 'MEMBER':
      return t('common.member');
    case 'VIEWER':
      return t('member.viewer');
  }
};

function SwipeAction({
  action,
  onPress,
  progress,
}: {
  action: MemberManagementAction;
  onPress: () => void;
  progress: SharedValue<number>;
}): ReactElement {
  const {theme} = useCPK();
  const meta = actionMeta(action);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.35, 1]),
    transform: [{scale: interpolate(progress.value, [0, 1], [0.84, 1])}],
  }));
  return (
    <Animated.View style={[styles.swipeAction, animatedStyle]}>
      <RectButton
        accessibilityLabel={meta.label}
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.swipeActionButton,
          {backgroundColor: theme.button[meta.color].bg},
        ]}
      >
        <View style={styles.swipeActionContent}>
          <Icon
            color={theme.button[meta.color].text}
            name={meta.icon}
            size={23}
          />
          <Typography.Body4
            $fontWeight="bold"
            numberOfLines={2}
            style={[
              styles.swipeActionText,
              {color: theme.button[meta.color].text},
            ]}
          >
            {meta.label}
          </Typography.Body4>
        </View>
      </RectButton>
    </Animated.View>
  );
}

const MemberRowCard = memo(function MemberRowCard({
  actorRole,
  busy,
  isSelf,
  largeText,
  member,
  onAction,
}: {
  actorRole: LedgerRole;
  busy: boolean;
  isSelf: boolean;
  largeText: boolean;
  member: MemberRow;
  onAction: (action: MemberManagementAction, member: MemberRow) => void;
}): ReactElement {
  const {theme} = useCPK();
  const plan = useMemo(
    () => memberActionPlan(actorRole, member.role, isSelf),
    [actorRole, isSelf, member.role],
  );
  const enabled =
    !busy && (plan.leading.length > 0 || plan.trailing.length > 0);
  const displayName = member.displayName || t('auth.noName');
  const renderActions = useCallback(
    (
      actions: readonly MemberManagementAction[],
      progress: SharedValue<number>,
      methods: SwipeableMethods,
    ): ReactElement => (
      <View style={styles.swipeActionGroup}>
        {actions.map((action) => (
          <SwipeAction
            action={action}
            key={action}
            onPress={() => {
              methods.close();
              onAction(action, member);
            }}
            progress={progress}
          />
        ))}
      </View>
    ),
    [member, onAction],
  );
  return (
    <ReanimatedSwipeable
      containerStyle={styles.swipeContainer}
      enabled={enabled}
      friction={1.5}
      leftThreshold={48}
      overshootFriction={8}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        plan.leading.length === 0
          ? undefined
          : (progress, _translation, methods) =>
              renderActions(plan.leading, progress, methods)
      }
      renderRightActions={
        plan.trailing.length === 0
          ? undefined
          : (progress, _translation, methods) =>
              renderActions(plan.trailing, progress, methods)
      }
      rightThreshold={48}
      testID={`member-swipe-${member.userId}`}
    >
      <View
        style={[
          styles.memberCard,
          largeText && styles.memberCardLargeText,
          {
            backgroundColor: isSelf ? theme.bg.highlight : theme.bg.basic,
            borderColor: isSelf ? theme.role.primary : theme.role.border,
            opacity: busy ? 0.56 : 1,
          },
        ]}
      >
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, {backgroundColor: theme.role.underlay}]}>
            {member.avatarThumbUrl === null ? (
              <Icon color={theme.role.primary} name="User" size={25} />
            ) : (
              <Image
                accessibilityLabel={displayName}
                contentFit="cover"
                source={member.avatarThumbUrl}
                style={styles.avatarImage}
              />
            )}
          </View>
          {member.role === 'OWNER' ? (
            <View
              style={[
                styles.ownerBadge,
                {backgroundColor: theme.button.warning.bg},
              ]}
            >
              <Icon
                color={theme.button.warning.text}
                name="CrownFill"
                size={11}
              />
            </View>
          ) : null}
        </View>
        <View style={[styles.identity, largeText && styles.identityLargeText]}>
          <View style={[styles.nameRow, largeText && styles.nameRowLargeText]}>
            <Typography.Body2
              $fontWeight="bold"
              numberOfLines={2}
              ellipsizeMode="tail"
              accessibilityLabel={displayName}
              style={styles.memberName}
              testID={`member-name-${member.userId}`}
            >
              {displayName}
            </Typography.Body2>
            {isSelf ? (
              <View
                style={[
                  styles.youBadge,
                  {backgroundColor: theme.role.underlay},
                ]}
              >
                <Typography.Body4
                  $fontWeight="bold"
                  style={{color: theme.role.link}}
                >
                  {t('member.you')}
                </Typography.Body4>
              </View>
            ) : null}
          </View>
          <Typography.Body4 numberOfLines={1} style={{color: theme.text.label}}>
            {member.handle === null
              ? roleLabel(member.role)
              : `@${member.handle}`}
          </Typography.Body4>
        </View>
        <View
          style={[
            styles.roleBadge,
            largeText && styles.roleBadgeLargeText,
            {backgroundColor: theme.role.underlay},
          ]}
        >
          <Icon
            color={theme.role.link}
            name={member.role === 'OWNER' ? 'CrownFill' : 'ShieldCheck'}
            size={15}
          />
          <Typography.Body4
            $fontWeight="bold"
            numberOfLines={largeText ? undefined : 1}
            style={[styles.memberName, {color: theme.role.link}]}
          >
            {roleLabel(member.role)}
          </Typography.Body4>
        </View>
      </View>
    </ReanimatedSwipeable>
  );
});

export function LedgerMembersScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const {user} = useSession();
  const {snackbar, theme, themeType} = useCPK();
  const {fontScale} = useWindowDimensions();
  const activeAccent = useLedgerAccent();
  const inviteForeground = ledgerAccentSurface(
    activeAccent,
    themeType === 'dark' ? 'dark' : 'light',
  ).foreground;
  const dialog = useBookooAlertDialog();
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
  const roster = usePaginatedQuery(
    api.ledgers.queries.rosterPaginated,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
    {initialNumItems: 30},
  );
  const changeRole = useMutation(api.members.mutations.changeRole);
  const remove = useMutation(api.members.mutations.remove);
  const transferOwnership = useMutation(
    api.members.mutations.transferOwnership,
  );
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const runAction = useCallback(
    async (
      action: MemberManagementAction,
      member: MemberRow,
      ready: LedgerRow,
    ): Promise<void> => {
      setBusyUserId(String(member.userId));
      try {
        switch (action) {
          case 'TRANSFER_OWNERSHIP':
            await transferOwnership({
              ledgerId: ready.id,
              userId: member.userId,
            });
            break;
          case 'ASSIGN_ADMIN':
            await changeRole({
              ledgerId: ready.id,
              userId: member.userId,
              role: 'ADMIN',
            });
            break;
          case 'REMOVE_ADMIN':
          case 'MAKE_MEMBER':
            await changeRole({
              ledgerId: ready.id,
              userId: member.userId,
              role: 'MEMBER',
            });
            break;
          case 'MAKE_VIEWER':
            await changeRole({
              ledgerId: ready.id,
              userId: member.userId,
              role: 'VIEWER',
            });
            break;
          case 'REMOVE_MEMBER':
            await remove({
              blockRejoin: false,
              ledgerId: ready.id,
              userId: member.userId,
            });
            break;
        }
        snackbar.open({color: 'success', text: t('common.success')});
      } catch {
        snackbar.open({color: 'danger', text: t('error.generic')});
      } finally {
        setBusyUserId(null);
      }
    },
    [changeRole, remove, snackbar, transferOwnership],
  );

  const requestAction = useCallback(
    (action: MemberManagementAction, member: MemberRow): void => {
      if (ledger === undefined || ledger === null) return;
      const meta = actionMeta(action);
      const displayName = member.displayName || t('auth.noName');
      dialog.confirm({
        body: meta.body(displayName),
        confirmText:
          action === 'TRANSFER_OWNERSHIP'
            ? t('member.transferOwnershipAction')
            : meta.label,
        icon: meta.icon,
        onConfirm: () => void runAction(action, member, ledger),
        title: meta.label,
        tone: action === 'REMOVE_MEMBER' ? 'danger' : meta.color,
      });
    },
    [dialog, ledger, runAction],
  );
  const renderMember = useCallback(
    ({item}: {item: MemberRow}): ReactElement => (
      <MemberRowCard
        actorRole={ledger?.role ?? 'VIEWER'}
        busy={busyUserId === String(item.userId)}
        isSelf={String(user?.userId ?? '') === String(item.userId)}
        largeText={fontScale > 1.4}
        member={item}
        onAction={requestAction}
      />
    ),
    [busyUserId, fontScale, ledger?.role, requestAction, user?.userId],
  );

  if (ledger === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('error.ledger.notFound')} />
      </AppScreen>
    );

  const canInvite =
    (ledger.role === 'OWNER' || ledger.role === 'ADMIN') &&
    ledger.maintenanceLock === 'NONE';
  const canManage = ledger.role === 'OWNER' || ledger.role === 'ADMIN';
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleMembers =
    normalizedSearch.length === 0
      ? roster.results
      : roster.results.filter((member) =>
          [member.displayName, member.handle]
            .filter((value): value is string => value !== null)
            .some((value) =>
              value.toLocaleLowerCase().includes(normalizedSearch),
            ),
        );
  if (roster.isLoading && roster.results.length === 0)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );

  return (
    <AppScreen>
      <FlashList
        contentContainerStyle={styles.listContent}
        data={visibleMembers}
        keyExtractor={(member) => String(member.userId)}
        ListEmptyComponent={
          <ScreenState compact icon="Users" title={t('member.noMembers')} />
        }
        ListFooterComponent={
          roster.status === 'LoadingMore' ? (
            <BookooLoading testID="member-loading-more" variant="inline" />
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <LedgerMark
              colorKey={ledger.colorKey}
              iconKey={ledger.iconKey}
              size={44}
            />
            {/* The copy's floor grows with the text, so large text wraps
                Invite onto its own line instead of splitting words. */}
            <View
              style={[
                styles.headerCopy,
                {minWidth: 120 * Math.max(1, fontScale)},
              ]}
              testID="member-header-copy"
            >
              <Typography.Heading4
                $fontWeight="bold"
                maxFontSizeMultiplier={1.35}
                numberOfLines={2}
                ellipsizeMode="tail"
                accessibilityLabel={ledger.title}
              >
                {ledger.title}
              </Typography.Heading4>
              <Typography.Body3 style={{color: theme.text.label}}>
                {tCount('ledger.memberCount', ledger.memberCount)}
              </Typography.Body3>
            </View>
            {canInvite ? (
              <BookooButton
                borderRadius={22}
                onPress={() => router.navigate(`/ledger/${ledger.id}/invites`)}
                size="small"
                startElement={
                  <View
                    style={styles.inviteIcon}
                    testID="member-invite-icon-wrap"
                  >
                    <Icon color={inviteForeground} name="UserPlus" size={18} />
                  </View>
                }
                text={t('common.invite')}
              />
            ) : null}
            <EditText
              accessibilityLabel={t('member.search')}
              autoCapitalize="none"
              decoration="boxed"
              hideCounter
              onChangeText={setSearch}
              placeholder={t('member.search')}
              placeholderColor={theme.text.placeholder}
              startElement={
                <Icon
                  color={theme.text.placeholder}
                  name="MagnifyingGlass"
                  size={20}
                />
              }
              style={styles.search}
              styles={{container: styles.searchContainer}}
              textInputProps={{autoCorrect: false}}
              value={search}
            />
            {canManage ? (
              <View style={styles.hint}>
                <Icon color={theme.text.label} name="HandSwipeLeft" size={16} />
                <Typography.Body4 style={{color: theme.text.label, flex: 1}}>
                  {t('member.swipeHint')}
                </Typography.Body4>
              </View>
            ) : null}
          </View>
        }
        onEndReached={() => {
          if (roster.status === 'CanLoadMore') roster.loadMore(50);
        }}
        onEndReachedThreshold={0.55}
        renderItem={renderMember}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  avatarImage: {height: 48, width: 48},
  avatarWrap: {height: 52, position: 'relative', width: 52},
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 8,
  },
  headerCopy: {flex: 1, gap: 4},
  hint: {
    alignItems: 'center',
    flexBasis: '100%',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  identity: {flex: 1, gap: 3, minWidth: 0},
  identityLargeText: {alignSelf: 'stretch', flex: 0},
  memberName: {flexShrink: 1, minWidth: 0},
  inviteIcon: {backgroundColor: 'transparent'},
  listContent: {
    paddingBottom: 24,
    paddingHorizontal: 10,
    paddingTop: DETAIL_CONTENT_TOP,
  },
  searchContainer: {borderRadius: 16},
  memberCard: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  nameRow: {alignItems: 'center', flexDirection: 'row', gap: 7},
  memberCardLargeText: {alignItems: 'flex-start', flexDirection: 'column'},
  nameRowLargeText: {alignItems: 'flex-start', flexDirection: 'column'},
  ownerBadge: {
    alignItems: 'center',
    borderRadius: 10,
    bottom: 0,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 20,
  },
  roleBadge: {
    alignItems: 'center',
    borderRadius: 13,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    maxWidth: '40%',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  roleBadgeLargeText: {maxWidth: '100%'},
  swipeAction: {height: '100%', width: 84},
  swipeActionButton: {flex: 1},
  swipeActionContent: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  swipeActionGroup: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  swipeContainer: {overflow: 'hidden'},
  search: {flexBasis: '100%'},
  swipeActionText: {textAlign: 'center'},
  youBadge: {
    borderRadius: 9,
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
});
