import type {ReactElement} from 'react';
import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {Share, StyleSheet, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import type {FunctionReturnType} from 'convex/server';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import {useRouter} from 'expo-router';
import {Button, Card, EditText, Icon, Typography, useCPK} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import {inviteUrl} from '@shared/inviteCode';
import {HANDLE_MAX_LENGTH, validateHandle} from '@shared/username';
import {useSession} from '~/features/auth/session';
import {useDebouncedValue} from '~/hooks/useDebouncedValue';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {BookooButton} from '~/components/uis/BookooButton';
import {
  AppScreen,
  LedgerMark,
  ScreenSkeleton,
  ScreenState,
} from '~/features/ledger/ui';
import {
  inviteAccessDescription,
  inviteRoleLabel,
} from '~/features/invite/access';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';
import {
  ledgerExpansionMessageFor,
  premiumRefusalOf,
} from '~/features/subscription/errors';
import {formatDate, t} from '~/utils/i18n';
import type {TranslationKey} from '~/utils/i18n';
import {DETAIL_CONTENT_TOP} from '~/theme/layout';

function useLedger(ledgerId: string) {
  return useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
}

type InviteRow = FunctionReturnType<
  typeof api.invites.queries.listPaginated
>['page'][number];
type JoinRequestRow = FunctionReturnType<
  typeof api.joinRequests.queries.pending
>['page'][number];
type AuditRow = FunctionReturnType<
  typeof api.audit.queries.list
>['page'][number];

const AUDIT_ACTION_KEY: Readonly<Record<AuditRow['action'], TranslationKey>> = {
  CATEGORY_ARCHIVED: 'release.auditActionCategoryArchived',
  CATEGORY_CREATED: 'release.auditActionCategoryCreated',
  CATEGORY_REASSIGNED: 'release.auditActionCategoryReassigned',
  CATEGORY_RENAMED: 'release.auditActionCategoryRenamed',
  CURRENCY_CONFIRMED: 'release.auditActionCurrencyConfirmed',
  EXPORT_REQUESTED: 'release.auditActionExportRequested',
  INVITE_CREATED: 'release.auditActionInviteCreated',
  INVITE_REDEEMED: 'release.auditActionInviteRedeemed',
  INVITE_REVOKED: 'release.auditActionInviteRevoked',
  ITEMS_REBUCKETED: 'release.auditActionItemsRebucketed',
  ITEM_DELETED: 'release.auditActionItemDeleted',
  ITEM_RESTORED: 'release.auditActionItemRestored',
  JOIN_APPROVED: 'release.auditActionJoinApproved',
  JOIN_REJECTED: 'release.auditActionJoinRejected',
  JOIN_REQUESTED: 'release.auditActionJoinRequested',
  LEDGER_ARCHIVED: 'release.auditActionLedgerArchived',
  LEDGER_CREATED: 'release.auditActionLedgerCreated',
  LEDGER_DELETE_CANCELLED: 'release.auditActionLedgerDeleteCancelled',
  LEDGER_DELETE_SCHEDULED: 'release.auditActionLedgerDeleteScheduled',
  LEDGER_RESTORED: 'release.auditActionLedgerRestored',
  LEDGER_UPDATED: 'release.auditActionLedgerUpdated',
  MEMBER_JOINED: 'release.auditActionMemberJoined',
  MEMBER_LEFT: 'release.auditActionMemberLeft',
  MEMBER_REMOVED: 'release.auditActionMemberRemoved',
  MEMBER_ROLE_CHANGED: 'release.auditActionMemberRoleChanged',
  MIGRATION_IMPORTED: 'release.auditActionMigrationImported',
  MIGRATION_OWNERSHIP_RESCUED: 'release.auditActionMigrationOwnershipRescued',
  OWNERSHIP_TRANSFERRED: 'release.auditActionOwnershipTransferred',
  POLICY_CHANGED: 'release.auditActionPolicyChanged',
  ROLLUP_REPAIRED: 'release.auditActionRollupRepaired',
  TIMEZONE_CHANGED: 'release.auditActionTimezoneChanged',
};

const InviteCard = memo(function InviteCard({
  invite,
  onRevoke,
}: {
  readonly invite: InviteRow;
  readonly onRevoke: (inviteId: InviteRow['id']) => void;
}): ReactElement {
  const {theme} = useCPK();
  return (
    <View
      style={[
        styles.inviteCard,
        {
          borderColor: theme.role.border,
        },
      ]}
    >
      <Icon color={theme.text.label} name="Link" size={20} />
      <View style={styles.flex}>
        <Typography.Body2 $fontWeight="bold">
          {invite.note ?? inviteRoleLabel(invite.role)}
        </Typography.Body2>
        <Typography.Body4 style={{color: theme.text.label}}>
          {invite.maxUses === null
            ? t('member.linkJoined', {count: invite.useCount})
            : t('member.linkJoinedLimit', {
                count: invite.useCount,
                limit: invite.maxUses,
              })}
        </Typography.Body4>
        {invite.expiresAt === null ? null : (
          <Typography.Body4 style={{color: theme.text.label}}>
            {t('member.linkExpires', {
              date: formatDate(invite.expiresAt, 'PP'),
            })}
          </Typography.Body4>
        )}
      </View>
      <BookooButton
        color="danger"
        onPress={() => onRevoke(invite.id)}
        size="small"
        text={t('member.revokeInviteLink')}
        type="text"
      />
    </View>
  );
});

const JoinRequestCard = memo(function JoinRequestCard({
  onDecide,
  request,
}: {
  readonly onDecide: (
    requestId: JoinRequestRow['id'],
    approve: boolean,
  ) => void;
  readonly request: JoinRequestRow;
}): ReactElement {
  return (
    <View style={styles.card}>
      <Typography.Body2 $fontWeight="bold">
        {request.handle === null ? request.displayName : `@${request.handle}`}
      </Typography.Body2>
      <Typography.Body3>{request.message}</Typography.Body3>
      <View style={styles.row}>
        <Button
          onPress={() => onDecide(request.id, true)}
          text={t('ledger.accept')}
        />
        <Button
          color="danger"
          onPress={() => onDecide(request.id, false)}
          text={t('ledger.reject')}
          type="outlined"
        />
      </View>
    </View>
  );
});

const AuditCard = memo(function AuditCard({
  row,
}: {
  readonly row: AuditRow;
}): ReactElement {
  const {theme} = useCPK();
  return (
    <View
      style={[
        styles.auditCard,
        {backgroundColor: theme.bg.basic, borderColor: theme.role.border},
      ]}
    >
      <View style={[styles.auditIcon, {backgroundColor: theme.role.underlay}]}>
        <Icon
          color={theme.role.primary}
          name="ClockCounterClockwise"
          size={22}
        />
      </View>
      <View style={styles.auditCopy}>
        <Typography.Body2 $fontWeight="bold">
          {t(AUDIT_ACTION_KEY[row.action])}
        </Typography.Body2>
        <Typography.Body4 style={{color: theme.text.label}}>
          {formatDate(row.createdAt, 'PPP p')}
        </Typography.Body4>
      </View>
    </View>
  );
});

export function LedgerInvitesScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const {snackbar, theme} = useCPK();
  const accent = useLedgerAccent();
  const dialog = useBookooAlertDialog();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const {user} = useSession();
  const [creating, setCreating] = useState(false);
  const [showRecipient, setShowRecipient] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const handle = validateHandle(recipientInput.trim().replace(/^@/, ''));
  const handleKey = showRecipient && handle.ok ? handle.key : null;
  const debouncedHandle = useDebouncedValue(handleKey, 300);
  const recipient = useQuery(
    api.user.queries.publicProfileByHandle,
    handleKey !== null && handleKey === debouncedHandle
      ? {handle: handleKey, now}
      : 'skip',
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inviteCountBeforeLoad = useRef<number | null>(null);
  const ledger = useLedger(ledgerId);
  const {
    loadMore: loadMoreInvites,
    results: inviteResults,
    status: invitePaginationStatus,
  } = usePaginatedQuery(
    api.invites.queries.listPaginated,
    ledger === undefined || ledger === null
      ? 'skip'
      : {ledgerId: ledger.id, now},
    // The invite API caps a page at INVITE_PAGE_SIZE (20); §11.3.
    {initialNumItems: 20},
  );
  const create = useMutation(api.invites.mutations.create);
  const revoke = useMutation(api.invites.mutations.revoke);
  const confirmRevoke = useCallback(
    (inviteId: InviteRow['id']): void => {
      dialog.confirm({
        body: t('member.revokeInviteConfirm'),
        confirmText: t('member.revokeInviteLink'),
        icon: 'LinkBreak',
        onConfirm: () => {
          void revoke({inviteId})
            .then(() =>
              snackbar.open({
                color: 'success',
                text: t('common.success'),
              }),
            )
            .catch(() =>
              snackbar.open({
                color: 'danger',
                text: t('error.generic'),
              }),
            );
        },
        title: t('member.revokeInviteLink'),
        tone: 'danger',
      });
    },
    [dialog, revoke, snackbar],
  );
  const renderInvite = useCallback(
    ({item}: {item: InviteRow}) => (
      <InviteCard invite={item} onRevoke={confirmRevoke} />
    ),
    [confirmRevoke],
  );
  const loadNextVisibleInvitePage = useCallback((): void => {
    if (
      invitePaginationStatus !== 'CanLoadMore' ||
      inviteCountBeforeLoad.current !== null
    )
      return;
    inviteCountBeforeLoad.current = inviteResults.length;
    loadMoreInvites(20);
  }, [invitePaginationStatus, inviteResults.length, loadMoreInvites]);
  useEffect(() => {
    if (invitePaginationStatus === 'LoadingMore') return;
    if (invitePaginationStatus === 'Exhausted') {
      inviteCountBeforeLoad.current = null;
      return;
    }
    if (invitePaginationStatus !== 'CanLoadMore') return;
    const countBeforeLoad = inviteCountBeforeLoad.current;
    if (countBeforeLoad === null) {
      if (inviteResults.length === 0) loadNextVisibleInvitePage();
      return;
    }
    if (inviteResults.length !== countBeforeLoad) {
      inviteCountBeforeLoad.current = null;
      return;
    }
    // The server paginates before filtering expired rows. Keep advancing only
    // when the requested page contributed no visible invite; otherwise a
    // fully expired page could hide later active invites from the user.
    loadMoreInvites(20);
  }, [
    invitePaginationStatus,
    inviteResults.length,
    loadMoreInvites,
    loadNextVisibleInvitePage,
  ]);
  // Null FIRST: the paginated query is skipped for a missing ledger, so its
  // status stays 'LoadingFirstPage' forever and a loading check placed above
  // this would render a skeleton instead of not-found, permanently.
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  if (ledger === undefined || invitePaginationStatus === 'LoadingFirstPage')
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (ledger.role !== 'OWNER' && ledger.role !== 'ADMIN')
    return (
      <AppScreen>
        <ScreenState icon="ShieldWarning" title={t('error.ledger.forbidden')} />
      </AppScreen>
    );

  const createInvite = (
    inviteeUserId?: NonNullable<typeof recipient>['userId'],
  ): void => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    setCopied(false);
    void create({
      ledgerId: ledger.id,
      role: 'MEMBER',
      requiresApproval: false,
      ...(inviteeUserId === undefined ? {} : {inviteeUserId}),
    })
      .then(({code}) => {
        if (inviteeUserId !== undefined) {
          setRecipientInput('');
          setShowRecipient(false);
          snackbar.open({color: 'success', text: t('member.directInviteSent')});
          return;
        }
        const link = inviteUrl(code);
        setLastInviteLink(link);
        return Share.share({message: link});
      })
      .catch((error: unknown) => {
        // A member-limit refusal is not a malfunction; saying "something went
        // wrong" hides the one paywall the app actually enforces and leaves the
        // owner with no idea what to do. MONETIZATION.md §5.
        const refusal = premiumRefusalOf(error);
        setCreateError(
          ledgerExpansionMessageFor(error, ledger.role === 'OWNER') ??
            t('error.generic'),
        );
        if (refusal !== null && ledger.role === 'OWNER')
          router.navigate({
            pathname: '/pro',
            params: {capability: refusal.capability},
          });
      })
      .finally(() => setCreating(false));
  };

  return (
    <AppScreen>
      <View style={styles.inviteListColumn}>
        <FlashList
          contentContainerStyle={styles.inviteContent}
          data={inviteResults}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(invite) => String(invite.id)}
          ListHeaderComponent={
            <View style={styles.inviteHeader}>
              <Card
                backgroundColor={accent.subtle}
                borderRadius={28}
                elevation={0}
                padding={24}
                styles={{content: styles.invitationPass}}
              >
                <View style={styles.invitePassTop}>
                  <Typography.Body4
                    $fontWeight="bold"
                    style={{color: accent.text}}
                  >
                    {t('member.invitePeople')}
                  </Typography.Body4>
                  <Icon color={accent.text} name="UsersThree" size={20} />
                </View>
                <View style={styles.inviteHero}>
                  <LedgerMark
                    colorKey={ledger.colorKey}
                    iconKey={ledger.iconKey}
                    size={48}
                  />
                  <Typography.Heading3
                    $fontWeight="bold"
                    maxFontSizeMultiplier={1.35}
                    numberOfLines={2}
                    style={styles.flex}
                  >
                    {ledger.title}
                  </Typography.Heading3>
                </View>
                <View
                  style={[styles.inviteAccess, {borderColor: accent.border}]}
                >
                  <Icon color={accent.text} name="CheckCircle" size={20} />
                  <View style={styles.flex}>
                    <Typography.Body3 $fontWeight="bold">
                      {t('common.member')}
                    </Typography.Body3>
                    <Typography.Body4 style={{color: theme.text.label}}>
                      {inviteAccessDescription('MEMBER')}
                    </Typography.Body4>
                  </View>
                </View>
              </Card>
              <Typography.Body3 style={{color: theme.text.label}}>
                {t('member.invitePeopleBody')}
              </Typography.Body3>
              <BookooButton
                loading={creating}
                onPress={() => createInvite()}
                startElement={
                  <Icon
                    color={theme.button.primary.text}
                    name="ShareNetwork"
                    size={19}
                  />
                }
                text={t('member.createInviteLink')}
              />
              <Button
                disabled={creating}
                onPress={() => {
                  setCreateError(null);
                  setShowRecipient(!showRecipient);
                }}
                testID="invite-by-username"
                text={t('member.inviteByUsername')}
                type="outlined"
              />
              {showRecipient ? (
                <View style={styles.recipientForm}>
                  <EditText
                    accessibilityLabel={t('auth.usernameHeading')}
                    autoCapitalize="none"
                    decoration="boxed"
                    editable={!creating}
                    maxLength={HANDLE_MAX_LENGTH + 1}
                    onChangeText={(value) => {
                      setCreateError(null);
                      setRecipientInput(value);
                    }}
                    placeholder="@username"
                    testID="invite-recipient-handle"
                    value={recipientInput}
                  />
                  {recipient === undefined ? null : (
                    <Typography.Body3 style={{color: theme.text.label}}>
                      {recipient === null || recipient.userId === user?.userId
                        ? t('member.inviteRecipientUnavailable')
                        : `${recipient.displayName} (@${recipient.handle})`}
                    </Typography.Body3>
                  )}
                  <BookooButton
                    disabled={
                      recipient == null || recipient.userId === user?.userId
                    }
                    loading={creating}
                    onPress={() => {
                      if (
                        recipient != null &&
                        recipient.userId !== user?.userId
                      )
                        createInvite(recipient.userId);
                    }}
                    testID="invite-send-direct"
                    text={t('common.send')}
                  />
                </View>
              ) : null}
              {lastInviteLink === null ? null : (
                <View
                  style={[
                    styles.inviteReady,
                    {
                      backgroundColor: theme.bg.highlight,
                      borderColor: theme.role.primary,
                    },
                  ]}
                >
                  <Icon
                    color={theme.role.primary}
                    name="CheckCircleFill"
                    size={24}
                  />
                  <View style={styles.flex}>
                    <Typography.Body2 $fontWeight="bold">
                      {t('member.inviteReady')}
                    </Typography.Body2>
                    <Typography.Body4 style={{color: theme.text.label}}>
                      {t('member.inviteReadyBody')}
                    </Typography.Body4>
                  </View>
                  <BookooButton
                    onPress={() => {
                      void Clipboard.setStringAsync(lastInviteLink).then(() => {
                        setCopied(true);
                        snackbar.open({
                          color: 'success',
                          text: t('member.inviteLinkCopied'),
                        });
                      });
                    }}
                    size="small"
                    text={copied ? t('common.success') : t('release.copyLink')}
                    type="outlined"
                  />
                </View>
              )}
              {createError === null ? null : (
                <Typography.Body3 style={{color: theme.text.validation}}>
                  {createError}
                </Typography.Body3>
              )}
              <Typography.Body2
                $fontWeight="bold"
                style={styles.inviteSectionHeading}
              >
                {t('release.invites')}
              </Typography.Body2>
            </View>
          }
          ListEmptyComponent={
            <Typography.Body3
              style={{color: theme.text.label, paddingVertical: 16}}
            >
              {t('member.noActiveInvites')}
            </Typography.Body3>
          }
          onEndReached={loadNextVisibleInvitePage}
          onEndReachedThreshold={0.6}
          renderItem={renderInvite}
        />
      </View>
    </AppScreen>
  );
}

export function JoinRequestsScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const {theme} = useCPK();
  const ledger = useLedger(ledgerId);
  const requests = usePaginatedQuery(
    api.joinRequests.queries.pending,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
    {initialNumItems: 30},
  );
  const decide = useMutation(api.joinRequests.mutations.decide);
  const [decideError, setDecideError] = useState<string | null>(null);
  const isOwner = ledger?.role === 'OWNER';
  const decideRequest = useCallback(
    (requestId: JoinRequestRow['id'], approve: boolean): void => {
      setDecideError(null);
      // This was an unhandled floating promise: approving past the free member
      // limit rejected silently, the row stayed PENDING, and the app just
      // looked broken to both people.
      decide({requestId, approve}).catch((error: unknown) => {
        setDecideError(
          ledgerExpansionMessageFor(error, isOwner) ?? t('error.generic'),
        );
      });
    },
    [decide, isOwner],
  );
  const renderRequest = useCallback(
    ({item}: {item: JoinRequestRow}) => (
      <JoinRequestCard onDecide={decideRequest} request={item} />
    ),
    [decideRequest],
  );
  // Same ordering trap as the invites screen: the paginated query is skipped
  // for a missing ledger, so its status never leaves 'LoadingFirstPage'.
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  if (ledger === undefined || requests.status === 'LoadingFirstPage')
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  return (
    <AppScreen>
      <FlashList
        contentContainerStyle={styles.listContent}
        data={requests.results}
        keyExtractor={(request) => String(request.id)}
        ListHeaderComponent={
          decideError === null ? null : (
            <Typography.Body3 style={{color: theme.text.validation}}>
              {decideError}
            </Typography.Body3>
          )
        }
        ListEmptyComponent={
          <ScreenState
            compact
            icon="UserPlus"
            title={t('release.noRequests')}
          />
        }
        onEndReached={() => {
          if (requests.status === 'CanLoadMore') requests.loadMore(30);
        }}
        onEndReachedThreshold={0.6}
        renderItem={renderRequest}
      />
    </AppScreen>
  );
}

export function LedgerAuditScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const ledger = useLedger(ledgerId);
  const rows = usePaginatedQuery(
    api.audit.queries.list,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
    {initialNumItems: 30},
  );
  const renderAuditRow = useCallback(
    ({item}: {item: AuditRow}) => <AuditCard row={item} />,
    [],
  );
  // Null before loading: a skipped paginated query never leaves
  // 'LoadingFirstPage', which would render a skeleton forever.
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  if (ledger === undefined || rows.status === 'LoadingFirstPage')
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  return (
    <AppScreen>
      <FlashList
        contentContainerStyle={styles.listContent}
        data={rows.results}
        keyExtractor={(row) => String(row.id)}
        ListEmptyComponent={
          <ScreenState
            compact
            icon="ListChecks"
            title={t('release.noContent')}
          />
        }
        onEndReached={() => {
          if (rows.status === 'CanLoadMore') rows.loadMore(30);
        }}
        onEndReachedThreshold={0.6}
        renderItem={renderAuditRow}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  recipientForm: {gap: 8},
  auditCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  auditCopy: {flex: 1, gap: 4},
  auditIcon: {
    alignItems: 'center',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  card: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 12,
  },
  flex: {flex: 1, minWidth: 0},
  inviteCard: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 18,
  },
  inviteContent: {
    padding: 18,
    paddingTop: DETAIL_CONTENT_TOP,
    paddingBottom: 40,
  },
  inviteListColumn: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 720,
    width: '100%',
  },
  inviteHeader: {gap: 14, paddingBottom: 14},
  invitationPass: {gap: 24},
  invitePassTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  inviteAccess: {
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 18,
  },
  inviteSectionHeading: {paddingTop: 16},
  inviteHero: {alignItems: 'center', flexDirection: 'row', gap: 14},
  inviteReady: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    padding: 13,
  },
  listContent: {padding: 16, paddingTop: DETAIL_CONTENT_TOP},
  row: {flexDirection: 'row', gap: 8},
});
