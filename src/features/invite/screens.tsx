import {LEGAL_ACKNOWLEDGEMENT} from '@shared/legal';
import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {Redirect, useLocalSearchParams, useRouter} from 'expo-router';
import {
  Accordion,
  Button,
  Card,
  EditText,
  Icon,
  Typography,
  useCPK,
} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import {
  formatInviteCodeForDisplay,
  normalizeInviteCode,
} from '@shared/inviteCode';
import {useSession} from '~/features/auth/session';
import {
  AppScreen,
  FormFrame,
  ScreenSkeleton,
  ScreenState,
} from '~/features/ledger/ui';
import {useLedgerStore} from '~/features/ledger/store';
import {useLocale} from '~/hooks/useLocale';
import {formatDate, t, tCount} from '~/utils/i18n';
import {LEDGER_ACCENTS, type LedgerColorKey} from '~/theme/ledgerAccent';
import {DETAIL_CONTENT_TOP} from '~/theme/layout';
import {inviteAccessDescription, inviteRoleLabel} from './access';
import {
  clearPendingInvite,
  saveJoinedInviteContinuation,
  savePendingInvite,
} from './pendingInvite';
import {joinedInviteDestination} from './pendingInviteResume';
import {ReportControl} from '~/features/release/ReportControl';
import {BookooBottomAction} from '~/components/uis/BookooBottomAction';
import {BookooButton} from '~/components/uis/BookooButton';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';

const terminalInviteMessage = (status: string): string => {
  switch (status) {
    case 'DECLINED':
      return t('member.inviteDeclined');
    case 'EXPIRED':
      return t('error.inviteExpired');
    case 'LEDGER_UNAVAILABLE':
      return t('error.ledgerNotFound');
    case 'WRONG_ACCOUNT':
      return t('member.inviteWrongAccount');
    default:
      return t('member.inviteLinkInvalid');
  }
};

export function InvitePreviewScreen(): ReactElement {
  const {code = ''} = useLocalSearchParams<{code?: string}>();
  return <InvitePreview key={code} code={code} />;
}

export function ReceivedInvitePreviewScreen(): ReactElement {
  const {inviteId = ''} = useLocalSearchParams<{inviteId?: string}>();
  const {stage} = useSession();
  if (stage === 'loading')
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  if (stage !== 'ready') return <Redirect href="/" />;
  return <InvitePreview key={inviteId} inviteId={inviteId} />;
}

function InvitePreview({
  code,
  inviteId,
}:
  | {code: string; inviteId?: never}
  | {code?: never; inviteId: string}): ReactElement {
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const {locale} = useLocale();
  const {onboardingStep, stage, user} = useSession();
  const setActiveLedgerId = useLedgerStore((state) => state.setActiveLedgerId);
  const [now] = useState(() => Date.now());
  const codePreview = useQuery(
    api.invites.queries.preview,
    code === undefined ? 'skip' : {code, now},
  );
  const receivedPreview = useQuery(
    api.invites.queries.previewReceived,
    inviteId === undefined ? 'skip' : {inviteId, now},
  );
  const preview = code === undefined ? receivedPreview : codePreview;
  const redeem = useMutation(api.invites.mutations.redeem);
  const redeemReceived = useMutation(api.invites.mutations.redeemReceived);
  const declineReceived = useMutation(api.invites.mutations.declineReceived);
  const dialog = useBookooAlertDialog();
  const completeLedgerStep = useMutation(api.user.mutations.completeLedgerStep);
  const [action, setAction] = useState<'accept' | 'decline' | null>(null);
  const [result, setResult] = useState<{
    readonly kind: 'PENDING' | 'ERROR';
    readonly message: string;
  } | null>(null);
  const canJoin =
    stage === 'ready' ||
    (stage === 'onboarding' && onboardingStep === 'ledger');
  const completesOnboarding =
    code !== undefined && stage === 'onboarding' && onboardingStep === 'ledger';
  const pending =
    result?.kind === 'PENDING' ||
    (preview?.status === 'OK' &&
      preview.requestPending === true &&
      !preview.alreadyMember);
  useEffect(() => {
    if (code !== undefined && preview !== undefined && preview.status !== 'OK')
      void clearPendingInvite(code);
  }, [code, preview]);
  if (preview === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  if (preview.status !== 'OK')
    return (
      <AppScreen>
        <ScreenState
          action={
            <BookooButton
              onPress={() =>
                inviteId === undefined
                  ? router.replace('/')
                  : router.dismissTo('/invites')
              }
              text={
                inviteId === undefined
                  ? t('common.goHome')
                  : t('member.receivedInvites')
              }
            />
          }
          body={
            preview.status === 'DECLINED'
              ? undefined
              : t('member.inviteInvalidBody')
          }
          icon={preview.status === 'DECLINED' ? 'XCircle' : 'WarningCircle'}
          title={terminalInviteMessage(preview.status)}
        />
      </AppScreen>
    );
  const colorKey =
    preview.ledger.colorKey in LEDGER_ACCENTS
      ? (preview.ledger.colorKey as LedgerColorKey)
      : 'TEAL';
  const accent =
    LEDGER_ACCENTS[colorKey][themeType === 'dark' ? 'dark' : 'light'];
  return (
    <AppScreen>
      <View style={styles.invitePage}>
        <ScrollView
          contentContainerStyle={styles.inviteContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <Card
            backgroundColor={accent.subtle}
            borderRadius={28}
            elevation={0}
            padding={24}
            styles={{content: styles.invitePass}}
          >
            <View style={styles.invitePassTop}>
              <Typography.Body4 $fontWeight="bold" style={{color: accent.text}}>
                {t('common.invite')}
              </Typography.Body4>
              <Icon color={accent.text} name="UsersThree" size={20} />
            </View>
            <View style={styles.inviteHeading}>
              <Icon color={accent.text} name="BookOpen" size={44} />
              <Typography.Heading3
                $fontWeight="bold"
                accessibilityRole="header"
                maxFontSizeMultiplier={1.35}
                numberOfLines={2}
                style={styles.inviteHeadingCopy}
              >
                {preview.ledger.title}
              </Typography.Heading3>
            </View>
            <Typography.Body4 style={{color: theme.text.label}}>
              {tCount('ledger.memberCount', preview.ledger.memberCount)}
            </Typography.Body4>
            <View style={[styles.inviteAccess, {borderColor: accent.border}]}>
              <Icon color={accent.text} name="CheckCircle" size={20} />
              <View style={styles.inviteSummaryCopy}>
                <Typography.Body3 $fontWeight="bold">
                  {inviteRoleLabel(preview.role)}
                </Typography.Body3>
                <Typography.Body4 style={{color: theme.text.label}}>
                  {inviteAccessDescription(preview.role)}
                </Typography.Body4>
              </View>
            </View>
          </Card>
          {preview.ledger.description.length === 0 ? null : (
            <Typography.Body2 style={{color: theme.text.label}}>
              {preview.ledger.description}
            </Typography.Body2>
          )}
          <View style={styles.inviteSummaryRow}>
            <Icon color={theme.text.label} name="UserCircle" size={24} />
            <View style={styles.inviteSummaryCopy}>
              <Typography.Body4 style={{color: theme.text.label}}>
                {t('member.invitedBy')}
              </Typography.Body4>
              <Typography.Body2 $fontWeight="bold">
                {preview.inviter.handle === null
                  ? preview.inviter.displayName
                  : `@${preview.inviter.handle}`}
              </Typography.Body2>
            </View>
          </View>
          {preview.requiresApproval ? (
            <Typography.Body3 style={{color: theme.text.label}}>
              {t('member.inviteApprovalBody')}
            </Typography.Body3>
          ) : null}
          {preview.expiresAt === null ? null : (
            <Typography.Body4 style={{color: theme.text.label}}>
              {t('member.linkExpires', {
                date: formatDate(preview.expiresAt, 'PP'),
              })}
            </Typography.Body4>
          )}
          {code === undefined ? null : (
            <Accordion
              size="small"
              data={[
                {
                  title: t('member.inviteLink'),
                  items: [formatInviteCodeForDisplay(code)],
                },
              ]}
              renderItem={(value) => (
                <Typography.Body4 selectable style={{color: theme.text.label}}>
                  {value}
                </Typography.Body4>
              )}
            />
          )}
          {completesOnboarding ? (
            <Typography.Body4 style={{color: theme.text.label}}>
              {t('intro.agreementNotice', {
                terms: t('intro.terms'),
                privacy: t('intro.privacy'),
              })}
            </Typography.Body4>
          ) : null}
          {inviteId !== undefined && !preview.alreadyMember && !pending ? (
            <BookooButton
              color="danger"
              disabled={action === 'accept'}
              loading={action === 'decline'}
              onPress={() => {
                if (action !== null) return;
                dialog.confirm({
                  body: t('member.declineInviteBody'),
                  confirmText: t('ledger.reject'),
                  icon: 'XCircle',
                  title: t('member.declineInvite'),
                  tone: 'danger',
                  onConfirm: () => {
                    setAction('decline');
                    setResult(null);
                    void declineReceived({inviteId})
                      .catch(() =>
                        setResult({kind: 'ERROR', message: t('error.generic')}),
                      )
                      .finally(() => setAction(null));
                  },
                });
              }}
              text={t('member.declineInvite')}
              testID="decline-received-invite"
              type="text"
            />
          ) : null}
          {result === null ? null : (
            <View
              style={[
                styles.inviteResult,
                {
                  backgroundColor:
                    result.kind === 'ERROR'
                      ? theme.bg.highlight
                      : theme.role.underlay,
                },
              ]}
            >
              <Icon
                color={
                  result.kind === 'ERROR'
                    ? theme.role.danger
                    : theme.role.primary
                }
                name={result.kind === 'ERROR' ? 'WarningCircle' : 'Clock'}
                size={20}
              />
              <Typography.Body3 style={styles.inviteResultCopy}>
                {result.message}
              </Typography.Body3>
            </View>
          )}
        </ScrollView>
        <BookooBottomAction
          disabled={pending || action === 'decline'}
          loading={action === 'accept'}
          onPress={() => {
            if (action !== null) return;
            if (!canJoin && code !== undefined) {
              void savePendingInvite(code).then(() =>
                router.navigate('/sign-in'),
              );
              return;
            }
            setAction('accept');
            setResult(null);
            void (async () => {
              const result =
                inviteId === undefined
                  ? await redeem({code})
                  : await redeemReceived({inviteId});
              if (
                result.status === 'REQUESTED' ||
                result.status === 'REQUEST_PENDING'
              ) {
                if (code !== undefined) await clearPendingInvite(code);
                setResult({kind: 'PENDING', message: t('member.requested')});
                return;
              }
              if (result.status === 'LEDGER_AT_CAPACITY') {
                // Never a paywall for the person accepting an invitation —
                // docs/product/MONETIZATION.md §5.
                setResult({
                  kind: 'ERROR',
                  message: t('member.ledgerFull'),
                });
                return;
              }
              if (
                result.status !== 'JOINED' &&
                result.status !== 'ALREADY_MEMBER'
              ) {
                if (
                  code !== undefined &&
                  (result.status === 'INVALID' ||
                    result.status === 'EXPIRED' ||
                    result.status === 'REVOKED' ||
                    result.status === 'EXHAUSTED')
                )
                  await clearPendingInvite(code);
                setResult({
                  kind: 'ERROR',
                  message: terminalInviteMessage(result.status),
                });
                return;
              }
              setActiveLedgerId(result.ledgerId);
              if (completesOnboarding && code !== undefined) {
                if (user === null) throw new Error('Missing invited user');
                // Completing onboarding changes the root protected stack.
                // Persist the destination before that remount and let
                // PendingInviteResume navigate only after the ready stack is
                // available. Replacing `/` here races the stack transition
                // and leaves iOS on a blank route until a cold relaunch.
                await saveJoinedInviteContinuation(
                  code,
                  String(user.userId),
                  result.ledgerId,
                );
                await completeLedgerStep({
                  ...LEGAL_ACKNOWLEDGEMENT,
                  skipped: false,
                  termsAccepted: true,
                  privacyAcknowledged: true,
                  age14Plus: true,
                  locale,
                });
                return;
              }
              // Membership is already committed. A keychain cleanup failure
              // must not keep the user on the invite form.
              if (code !== undefined)
                await clearPendingInvite().catch(() => undefined);
              if (result.status === 'JOINED') {
                router.replace(joinedInviteDestination(result.ledgerId));
              } else if (preview.addressedToViewer) {
                router.replace({
                  pathname: '/ledger/[ledgerId]',
                  params: {ledgerId: result.ledgerId},
                });
              } else {
                router.replace('/');
              }
            })()
              .catch(() =>
                setResult({kind: 'ERROR', message: t('error.generic')}),
              )
              .finally(() => setAction(null));
          }}
          text={
            pending
              ? t('member.requested')
              : preview.addressedToViewer && preview.alreadyMember
                ? t('member.openInvitedLedger')
                : canJoin
                  ? t('ledger.accept')
                  : t('auth.login')
          }
        />
      </View>
    </AppScreen>
  );
}

export function InviteCodeScreen(): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  const [code, setCode] = useState('');
  const normalized = normalizeInviteCode(code);
  return (
    <AppScreen>
      <FormFrame>
        <Typography.Body2 style={{color: theme.text.label}}>
          {t('member.inviteCodeBody')}
        </Typography.Body2>
        <EditText
          accessibilityLabel={t('member.inviteLink')}
          autoCapitalize="characters"
          decoration="boxed"
          maxLength={40}
          onChangeText={setCode}
          value={code}
        />
        <BookooButton
          disabled={normalized === null}
          onPress={() => {
            if (normalized !== null)
              router.navigate({
                pathname: '/invite/[code]',
                params: {code: normalized},
              });
          }}
          text={t('common.next')}
        />
      </FormFrame>
    </AppScreen>
  );
}

export function PublicProfileScreen(): ReactElement {
  const {handle = ''} = useLocalSearchParams<{handle?: string}>();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const profile = useQuery(api.user.queries.publicProfileByHandle, {
    handle,
    now,
  });
  const block = useMutation(api.blocks.mutations.create);
  const {stage, user} = useSession();
  const isSelf = profile !== null && profile?.userId === user?.userId;
  useEffect(() => {
    if (isSelf) router.replace('/profile/me');
  }, [isSelf, router]);
  if (profile === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  if (profile === null)
    return (
      <AppScreen>
        <ScreenState title={t('error.notFound')} />
      </AppScreen>
    );
  if (isSelf)
    return (
      <AppScreen>
        <ScreenSkeleton />
      </AppScreen>
    );
  return (
    <AppScreen>
      <FormFrame>
        <Typography.Title $fontWeight="bold" maxFontSizeMultiplier={1.35}>
          {profile.displayName}
        </Typography.Title>
        <Typography.Body2>@{profile.handle}</Typography.Body2>
        {stage === 'ready' ? (
          <>
            <Button
              color="danger"
              onPress={() => void block({userId: profile.userId})}
              text={t('release.block')}
              type="outlined"
            />
            <ReportControl
              blockUserId={profile.userId}
              subject={{kind: 'USER', userId: profile.userId}}
            />
          </>
        ) : null}
      </FormFrame>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  inviteContent: {
    alignSelf: 'center',
    gap: 22,
    maxWidth: 720,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: DETAIL_CONTENT_TOP,
    width: '100%',
  },
  inviteHeading: {alignItems: 'center', flexDirection: 'row', gap: 16},
  inviteHeadingCopy: {flex: 1, minWidth: 0},
  invitePass: {gap: 20},
  invitePassTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inviteAccess: {
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 18,
  },
  invitePage: {flex: 1},
  inviteResult: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  inviteResultCopy: {flex: 1},
  inviteSummaryCopy: {flex: 1, gap: 2},
  inviteSummaryRow: {alignItems: 'center', flexDirection: 'row', gap: 10},
});
