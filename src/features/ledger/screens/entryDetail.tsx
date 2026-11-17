import type {ReactElement} from 'react';
import {useLocale} from '~/hooks/useLocale';
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {FlashList} from '@shopify/flash-list';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import type {FunctionReturnType} from 'convex/server';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {Image} from 'expo-image';
import {
  Card,
  CustomPressable,
  EditText,
  Icon,
  Typography,
  useCPK,
} from 'cpk-ui';
import {useRouter} from 'expo-router';
import {
  useActionSheet,
  type ActionSheetOptions,
} from '@expo/react-native-action-sheet';

import {api} from '@convex/_generated/api';
import type {Id} from '@convex/_generated/dataModel';
import {entryCashFlowMinor} from '@shared/money';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {BookooButton} from '~/components/uis/BookooButton';
import {useSession} from '~/features/auth/session';
import {formatAmount, formatDate, t, tCount} from '~/utils/i18n';
import {categoryDisplayName} from '../categories';
import {canEditEntry} from '../permissions';
import {
  AppScreen,
  FormFrame,
  ScreenSkeleton,
  ScreenState,
  safeIconName,
} from '../ui';
import {PrivateImage} from '~/features/media/PrivateImage';
import {uploadFile} from '~/features/media/upload';
import {hasPhotoPickerAccess} from '~/features/media/photoPickerPermission';
import {useConnectivity} from '~/features/runtime/connectivity';
import {ReportControl} from '~/features/release/ReportControl';
import {
  LEDGER_ACCENTS,
  LEDGER_COLOR_KEYS,
  ledgerAccentSurface,
} from '~/theme/ledgerAccent';
import {occurredAtToLocalWallClock} from '@shared/date';

interface PendingCommentPhoto {
  readonly key: string;
  readonly uri: string;
  readonly storageId: Id<'_storage'>;
  readonly thumbStorageId: Id<'_storage'>;
  readonly width: number;
  readonly height: number;
}

/**
 * Android draws the JS action sheet edge-to-edge: without the bottom inset its
 * Cancel row sat on the navigation bar's back/home buttons. iOS ignores these.
 */
function useActionSheetChrome(): Pick<
  ActionSheetOptions,
  'containerStyle' | 'textStyle'
> {
  const {theme} = useCPK();
  const {bottom} = useSafeAreaInsets();
  return useMemo(
    () => ({
      containerStyle: {backgroundColor: theme.bg.basic, paddingBottom: bottom},
      textStyle: {color: theme.text.basic},
    }),
    [bottom, theme.bg.basic, theme.text.basic],
  );
}

/**
 * The touched view, so an iPad action sheet points at its "···" button.
 * Without an anchor iOS centres the popover over the screen. The target comes
 * from native hit-testing, so it is always a mounted view's tag; RN types it
 * as a string.
 */
export function actionSheetAnchor(
  event?: GestureResponderEvent,
): number | undefined {
  const tag = Number(event?.nativeEvent.target);
  return Number.isInteger(tag) && tag > 0 ? tag : undefined;
}

export function LedgerItemDetailScreen({
  embedded = false,
  itemId,
  ledgerId: routeLedgerId,
}: {
  readonly embedded?: boolean;
  readonly itemId: string;
  readonly ledgerId?: string;
}): ReactElement {
  useLocale();
  const router = useRouter();
  const {theme, themeType} = useCPK();
  const dialog = useBookooAlertDialog();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const {user} = useSession();
  const {showActionSheetWithOptions} = useActionSheet();
  const sheetChrome = useActionSheetChrome();
  const [restoring, setRestoring] = useState(false);
  const [reportingItem, setReportingItem] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [pendingCommentPhotos, setPendingCommentPhotos] = useState<
    readonly PendingCommentPhoto[]
  >([]);
  const commentRequestRef = useRef<{
    readonly fingerprint: string;
    readonly id: string;
  } | null>(null);
  const connectivity = useConnectivity();
  const item = useQuery(api.items.queries.getMineByRoute, {itemId});
  const routeLedgerMismatch =
    item !== undefined &&
    item !== null &&
    routeLedgerId !== undefined &&
    String(item.ledgerId) !== routeLedgerId;
  const unavailableRoute = item === null;
  const ledger = useQuery(
    api.ledgers.queries.get,
    item === undefined || item === null || routeLedgerMismatch
      ? 'skip'
      : {ledgerId: item.ledgerId},
  );
  const categories = useQuery(
    api.categories.queries.list,
    item === undefined || item === null || routeLedgerMismatch
      ? 'skip'
      : {ledgerId: item.ledgerId},
  );
  const createComment = useMutation(api.comments.mutations.create);
  const deleteComment = useMutation(api.comments.mutations.softDelete);
  const restoreItem = useMutation(api.items.mutations.restore);
  const generateUploadUrl = useMutation(api.files.mutations.generateUploadUrl);
  const claimUpload = useMutation(api.files.mutations.claimUpload);
  const photos = useQuery(
    api.photos.queries.listByItem,
    item === undefined || item === null || routeLedgerMismatch
      ? 'skip'
      : {itemId: item.id},
  );
  const comments = usePaginatedQuery(
    api.comments.queries.list,
    item === undefined || item === null || routeLedgerMismatch
      ? 'skip'
      : {itemId: item.id},
    // Thread rows carry joined author + attachment metadata; 20 keeps the
    // first keyboard-ready frame small while onEndReached remains unbounded.
    {initialNumItems: 20},
  );
  const addCommentPhotos = useCallback(async (): Promise<void> => {
    if (
      attaching ||
      item === undefined ||
      item === null ||
      pendingCommentPhotos.length >= 4
    )
      return;
    if (!connectivity.connected) {
      setCommentError(t('error.network'));
      return;
    }
    setAttaching(true);
    try {
      if (!(await hasPhotoPickerAccess())) throw new Error('Permission denied');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 4 - pendingCommentPhotos.length,
        quality: 0.92,
      });
      if (result.canceled) return;
      const uploaded: PendingCommentPhoto[] = [];
      for (const asset of result.assets) {
        const thumb = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{resize: {width: Math.min(320, asset.width)}}],
          {compress: 0.8, format: ImageManipulator.SaveFormat.JPEG},
        );
        const [originalUrl, thumbUrl] = await Promise.all([
          generateUploadUrl({
            purpose: 'COMMENT_ATTACHMENT',
            itemId: item.id,
          }),
          generateUploadUrl({
            purpose: 'COMMENT_ATTACHMENT',
            itemId: item.id,
          }),
        ]);
        const [storageId, thumbStorageId] = await Promise.all([
          uploadFile(originalUrl, asset.uri, asset.mimeType ?? 'image/jpeg'),
          uploadFile(thumbUrl, thumb.uri, 'image/jpeg'),
        ]);
        await Promise.all([
          claimUpload({
            storageId,
            purpose: 'COMMENT_ATTACHMENT',
            variant: 'ORIGINAL',
            itemId: item.id,
          }),
          claimUpload({
            storageId: thumbStorageId,
            purpose: 'COMMENT_ATTACHMENT',
            variant: 'THUMB',
            itemId: item.id,
          }),
        ]);
        uploaded.push({
          key: Crypto.randomUUID(),
          uri: thumb.uri,
          storageId,
          thumbStorageId,
          width: asset.width,
          height: asset.height,
        });
      }
      setPendingCommentPhotos((current) =>
        [...current, ...uploaded].slice(0, 4),
      );
    } catch {
      setCommentError(
        connectivity.connected ? t('error.upload.invalid') : t('error.network'),
      );
    } finally {
      setAttaching(false);
    }
  }, [
    attaching,
    claimUpload,
    connectivity.connected,
    generateUploadUrl,
    item,
    pendingCommentPhotos.length,
  ]);

  const submitComment = useCallback(async (): Promise<void> => {
    if (commenting || item === undefined || item === null) return;
    const body = commentBody.trim();
    if (body.length === 0 && pendingCommentPhotos.length === 0) return;
    if (!connectivity.connected) {
      setCommentError(t('error.network'));
      return;
    }
    setCommenting(true);
    setCommentError(null);
    const attachments = pendingCommentPhotos.map((photo) => ({
      storageId: photo.storageId,
      thumbStorageId: photo.thumbStorageId,
      width: photo.width,
      height: photo.height,
    }));
    const fingerprint = JSON.stringify({
      itemId: item.id,
      body,
      attachments,
    });
    const clientRequestId =
      commentRequestRef.current?.fingerprint === fingerprint
        ? commentRequestRef.current.id
        : Crypto.randomUUID();
    commentRequestRef.current = {fingerprint, id: clientRequestId};
    try {
      await createComment({
        itemId: item.id,
        body,
        clientRequestId,
        ...(attachments.length === 0 ? {} : {attachments}),
      });
      commentRequestRef.current = null;
      setCommentBody('');
      setPendingCommentPhotos([]);
    } catch {
      setCommentError(
        connectivity.connected ? t('error.generic') : t('error.network'),
      );
    } finally {
      setCommenting(false);
    }
  }, [
    commentBody,
    commenting,
    connectivity.connected,
    createComment,
    item,
    pendingCommentPhotos,
  ]);
  const category = useMemo(
    () => categories?.find((row) => row.key === item?.categoryKey),
    [categories, item?.categoryKey],
  );
  const openCommentAttachment = useCallback(
    (commentId: Comment['id'], index: number): void => {
      if (item === undefined || item === null) return;
      router.navigate({
        pathname: '/photo/[itemId]',
        params: {itemId: item.id, commentId, index},
      });
    },
    [item, router],
  );
  const requestDeleteComment = useCallback(
    (commentId: Comment['id']): void => {
      dialog.confirm({
        body: t('common.deleteConfirm'),
        confirmText: t('common.delete'),
        icon: 'Trash',
        onConfirm: () => void deleteComment({commentId}),
        title: t('common.delete'),
        tone: 'danger',
      });
    },
    [deleteComment, dialog],
  );
  useEffect(() => {
    if ((!routeLedgerMismatch && !unavailableRoute) || embedded) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/timeline');
  }, [embedded, routeLedgerMismatch, router, unavailableRoute]);
  const renderComment = useCallback(
    ({item: comment}: {item: Comment}): ReactElement | null => {
      if (item === undefined || item === null) return null;
      return (
        <CommentRow
          comment={comment}
          isOwn={comment.authorId === user?.userId}
          ledgerId={item.ledgerId}
          onDelete={requestDeleteComment}
          onOpenAttachment={openCommentAttachment}
        />
      );
    },
    [item, openCommentAttachment, requestDeleteComment, user?.userId],
  );
  if (item === null)
    return embedded ? (
      <View style={styles.embeddedRoot} testID="entry-detail-embedded">
        <ScreenState icon="ReceiptX" title={t('error.item.notFound')} />
      </View>
    ) : (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (
    item === undefined ||
    routeLedgerMismatch ||
    ledger === undefined ||
    categories === undefined
  )
    return embedded ? (
      <View style={styles.embeddedRoot} testID="entry-detail-embedded">
        <ScreenSkeleton rows={6} />
      </View>
    ) : (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  const amountColor =
    item.type === 'INCOME' ? theme.text.income : theme.text.expense;
  const canWrite = canEditEntry(ledger, item, user?.userId);
  const isOwnItem = item.authorId === user?.userId;
  const canComment =
    ledger.role !== 'VIEWER' && ledger.maintenanceLock === 'NONE';
  // A deleted entry has no composer, so its empty thread must not say
  // "Write one below".
  const canComposeComment = item.deletedAt === null && canComment;
  const colorKey =
    LEDGER_COLOR_KEYS.find((key) => key === ledger.colorKey) ?? 'TEAL';
  const accent =
    LEDGER_ACCENTS[colorKey][themeType === 'dark' ? 'dark' : 'light'];
  const mode = themeType === 'dark' ? 'dark' : 'light';
  const surface = ledgerAccentSurface(accent, mode);
  const editColor = accent.text;
  const restoreEntry = (): void => {
    if (restoring) return;
    setRestoring(true);
    void restoreItem({itemId: item.id}).finally(() => setRestoring(false));
  };
  const openItemOptions = (event?: GestureResponderEvent): void => {
    const primaryLabel =
      item.deletedAt === null ? t('common.update') : t('screen.restoreEntry');
    const options = [
      ...(canWrite ? [primaryLabel] : []),
      ...(!isOwnItem ? [t('release.report')] : []),
      t('common.cancel'),
    ];
    const cancelButtonIndex = options.length - 1;
    showActionSheetWithOptions(
      {
        ...sheetChrome,
        anchor: actionSheetAnchor(event),
        cancelButtonIndex,
        options,
        userInterfaceStyle: mode,
      },
      (selectedIndex) => {
        if (selectedIndex === undefined || selectedIndex === cancelButtonIndex)
          return;
        if (canWrite && selectedIndex === 0) {
          if (item.deletedAt === null) {
            router.navigate({
              pathname: '/ledger/[ledgerId]/item/[itemId]/edit',
              params: {itemId: item.id, ledgerId: item.ledgerId},
            });
          } else {
            restoreEntry();
          }
          return;
        }
        setReportingItem(true);
      },
    );
  };
  const itemActionsButton =
    canWrite || !isOwnItem ? (
      <CustomPressable
        accessibilityLabel={t('common.more')}
        accessibilityRole="button"
        disabled={restoring}
        onPress={openItemOptions}
        style={styles.editButton}
        testID="ledger-item-more"
      >
        {restoring ? (
          <ActivityIndicator color={editColor} size="small" />
        ) : (
          <Icon color={editColor} name="DotsThree" size={24} />
        )}
      </CustomPressable>
    ) : null;
  const detailList = (
    <FlashList
      contentContainerStyle={styles.listContent}
      data={comments.results}
      keyExtractor={(comment) => String(comment.id)}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <FormFrame style={styles.detailFrame}>
          {item.deletedAt === null ? null : (
            <Card
              backgroundColor={theme.bg.basic}
              borderRadius={14}
              elevation={0}
              padding={14}
              style={styles.deletedNotice}
              styles={{content: styles.deletedNoticeContent}}
              testID="ledger-item-deleted-notice"
            >
              <View style={styles.deletedNoticeCopy}>
                <Icon color={theme.text.label} name="Trash" size={20} />
                <Typography.Body3
                  style={[styles.flex, {color: theme.text.label}]}
                >
                  {t('screen.deletedEntriesHint')}
                </Typography.Body3>
              </View>
              {canWrite ? (
                <BookooButton
                  borderRadius={16}
                  loading={restoring}
                  onPress={restoreEntry}
                  size="small"
                  style={styles.deletedNoticeAction}
                  testID="ledger-item-restore"
                  text={t('screen.restoreEntry')}
                  type="outlined"
                />
              ) : null}
            </Card>
          )}
          <View style={styles.hero}>
            {embedded ? (
              <View style={styles.embeddedMore}>{itemActionsButton}</View>
            ) : null}
            <Typography.Heading3 style={{color: theme.text.label}}>
              {item.type === 'INCOME'
                ? t('ledgerItem.income')
                : t('ledgerItem.expense')}
            </Typography.Heading3>
            <Typography.Heading1
              $fontWeight="bold"
              style={[styles.amount, {color: amountColor}]}
            >
              {formatAmount({
                amountMinor: entryCashFlowMinor(item.type, item.amountMinor),
                currency: item.currency,
              })}
            </Typography.Heading1>
          </View>
          <View style={styles.detailMetadata} testID="ledger-item-metadata">
            <View style={styles.detailLine} testID="ledger-item-category">
              <Icon
                color={theme.text.label}
                name={safeIconName(category?.iconKey ?? 'Question')}
                size={23}
              />
              <Typography.Body2 $fontWeight="bold" style={styles.flex}>
                {category === undefined
                  ? item.categoryKey
                  : categoryDisplayName(category)}
              </Typography.Body2>
            </View>
            <View style={styles.detailLine} testID="ledger-item-date">
              <Icon color={theme.text.label} name="Calendar" size={22} />
              <Typography.Body3 style={styles.flex}>
                {formatDate(
                  occurredAtToLocalWallClock(
                    item.occurredAt,
                    item.occurredOffsetMinutes,
                  ),
                  'PPP · p',
                )}
              </Typography.Body3>
            </View>
            {item.place === null ? null : (
              <CustomPressable
                accessibilityLabel={item.place.label}
                accessibilityRole="button"
                onPress={() =>
                  void Linking.openURL(
                    `https://maps.apple.com/?ll=${item.place?.lat},${item.place?.lng}`,
                  )
                }
                style={styles.detailLine}
              >
                <Icon color={theme.text.label} name="MapPin" size={22} />
                <Typography.Body3 style={styles.flex}>
                  {item.place.label}
                </Typography.Body3>
                <Icon
                  color={theme.text.placeholder}
                  name="CaretRight"
                  size={18}
                />
              </CustomPressable>
            )}
            {item.memo.length === 0 ? null : (
              <View style={styles.detailLine} testID="ledger-item-memo">
                <Icon color={theme.text.label} name="Note" size={22} />
                <Typography.Body3 style={styles.flex}>
                  {item.memo}
                </Typography.Body3>
              </View>
            )}
          </View>
          {photos === undefined || photos.length === 0 ? null : (
            <View style={styles.photoSection} testID="ledger-item-photos">
              <View style={styles.photoSectionTitle}>
                <Icon color={theme.text.label} name="Image" size={21} />
                <Typography.Body2 $fontWeight="bold">
                  {t('release.photos')}
                </Typography.Body2>
                <Typography.Body3
                  $fontWeight="bold"
                  style={{color: accent.text}}
                >
                  {photos.length}
                </Typography.Body3>
              </View>
              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <CustomPhoto
                    key={photo.id}
                    onPress={() =>
                      router.navigate({
                        pathname: '/photo/[itemId]',
                        params: {itemId: item.id, index},
                      })
                    }
                    photoId={photo.id}
                  />
                ))}
              </View>
            </View>
          )}
          <View
            style={[
              styles.sectionDivider,
              {backgroundColor: theme.role.divider},
            ]}
          />
          <View style={styles.commentSectionHeader}>
            <Typography.Body2 $fontWeight="bold">
              {tCount('ledgerItem.commentCount', item.commentCount)}
            </Typography.Body2>
          </View>
        </FormFrame>
      }
      ListFooterComponent={null}
      ListEmptyComponent={
        comments.status === 'LoadingFirstPage' ? (
          <View
            accessibilityLabel={t('common.loading')}
            accessibilityRole="progressbar"
            style={styles.commentLoading}
            testID="ledger-item-comments-loading"
          >
            <ActivityIndicator color={theme.role.primary} size="small" />
          </View>
        ) : (
          <View
            style={[styles.commentEmpty, {borderColor: theme.role.divider}]}
            testID="ledger-item-comments-empty"
          >
            <Typography.Body3
              style={[styles.commentEmptyCopy, {color: theme.text.label}]}
            >
              {canComposeComment
                ? t('ledgerItem.commentEmptyHint')
                : t('ledgerItem.commentEmptyReadOnly')}
            </Typography.Body3>
          </View>
        )
      }
      onEndReached={() => {
        // Keep comment pages aligned with COMMENT_PAGE_SIZE on the server.
        if (comments.status === 'CanLoadMore') comments.loadMore(20);
      }}
      onEndReachedThreshold={0.6}
      renderItem={renderComment}
    />
  );
  const detailWithComposer = (
    <KeyboardAvoidingView
      automaticOffset
      behavior="padding"
      style={styles.flex}
      testID="ledger-item-comment-keyboard-area"
    >
      {detailList}
      {canComposeComment ? (
        <View>
          <View
            style={[
              styles.composer,
              {
                backgroundColor: theme.bg.basic,
                borderTopColor: theme.role.divider,
                paddingBottom: embedded
                  ? 8
                  : keyboardVisible
                    ? 8
                    : Math.max(8, insets.bottom - 4),
              },
            ]}
            testID="ledger-item-comment-composer"
          >
            {pendingCommentPhotos.length === 0 ? null : (
              <ScrollView
                contentContainerStyle={styles.pendingPhotos}
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
              >
                {pendingCommentPhotos.map((photo) => (
                  <View key={photo.key} style={styles.pendingPhotoWrap}>
                    <Image source={photo.uri} style={styles.pendingPhoto} />
                    <CustomPressable
                      accessibilityLabel={t('common.delete')}
                      accessibilityRole="button"
                      onPress={() =>
                        setPendingCommentPhotos((current) =>
                          current.filter((row) => row.key !== photo.key),
                        )
                      }
                      style={styles.pendingPhotoRemove}
                    >
                      <Icon color="#FFFFFF" name="X" size={13} />
                    </CustomPressable>
                  </View>
                ))}
              </ScrollView>
            )}
            {commentError === null ? null : (
              <View style={styles.commentError}>
                <Typography.Body4
                  accessibilityLiveRegion="polite"
                  style={{color: theme.text.validation}}
                >
                  {commentError}
                </Typography.Body4>
                <CustomPressable
                  accessibilityLabel={t('common.tryAgain')}
                  accessibilityRole="button"
                  onPress={() => void submitComment()}
                  style={styles.commentRetry}
                >
                  <Typography.Body4
                    $fontWeight="bold"
                    style={{color: theme.role.primary}}
                  >
                    {t('common.tryAgain')}
                  </Typography.Body4>
                </CustomPressable>
              </View>
            )}
            <View
              style={[
                styles.composerField,
                {
                  backgroundColor: theme.bg.paper,
                  borderColor: theme.role.border,
                },
              ]}
              testID="ledger-item-comment-field"
            >
              <CustomPressable
                accessibilityLabel={t('release.addCommentPhoto')}
                accessibilityRole="button"
                disabled={attaching || pendingCommentPhotos.length >= 4}
                onPress={() => void addCommentPhotos()}
                style={[
                  styles.attachButton,
                  {backgroundColor: theme.role.underlay},
                  (attaching || pendingCommentPhotos.length >= 4) &&
                    styles.commentSendDisabled,
                ]}
              >
                {attaching ? (
                  <ActivityIndicator color={theme.role.primary} size="small" />
                ) : (
                  <Icon color={theme.role.primary} name="Paperclip" size={21} />
                )}
              </CustomPressable>
              <View
                style={styles.commentInputWrap}
                testID="ledger-item-comment-input-wrap"
              >
                <EditText
                  accessibilityLabel={t('ledgerItem.commentPlaceholder')}
                  decoration="boxed"
                  hideCounter
                  maxLength={2000}
                  multiline
                  onChangeText={setCommentBody}
                  onSubmitEditing={() => void submitComment()}
                  placeholder={t('ledgerItem.commentPlaceholder')}
                  styles={{
                    container: styles.commentInputContainer,
                    input: styles.commentInputText,
                    inputContainer: styles.commentInputInner,
                  }}
                  textInputProps={{blurOnSubmit: false, returnKeyType: 'send'}}
                  value={commentBody}
                />
              </View>
              <CustomPressable
                accessibilityLabel={t('common.send')}
                accessibilityRole="button"
                disabled={
                  commenting ||
                  (commentBody.trim().length === 0 &&
                    pendingCommentPhotos.length === 0)
                }
                onPress={() => void submitComment()}
                style={[
                  styles.commentSend,
                  {backgroundColor: surface.background},
                  (commenting ||
                    (commentBody.trim().length === 0 &&
                      pendingCommentPhotos.length === 0)) &&
                    styles.commentSendDisabled,
                ]}
              >
                {commenting ? (
                  <ActivityIndicator color={surface.foreground} size="small" />
                ) : (
                  <Icon
                    color={surface.foreground}
                    name="PaperPlaneTilt"
                    size={20}
                  />
                )}
              </CustomPressable>
            </View>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
  if (embedded)
    return (
      <View style={styles.embeddedRoot} testID="entry-detail-embedded">
        {detailWithComposer}
        {isOwnItem ? null : (
          <ReportControl
            blockUserId={item.authorId}
            contextLedgerId={item.ledgerId}
            onVisibleChange={setReportingItem}
            showTrigger={false}
            subject={{kind: 'ITEM', itemId: item.id}}
            visible={reportingItem}
          />
        )}
      </View>
    );

  return (
    <AppScreen>
      <View
        style={[
          styles.routeHeader,
          {
            backgroundColor: theme.bg.paper,
            borderBottomColor: theme.role.divider,
          },
        ]}
      >
        <CustomPressable
          accessibilityLabel={t('a11y.close')}
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(app)/(tabs)/(root)/timeline');
          }}
          style={styles.backButton}
        >
          <Icon color={theme.text.basic} name="X" size={22} />
        </CustomPressable>
        <View style={styles.headerTitle} />
        {itemActionsButton ?? <View style={styles.backButton} />}
      </View>
      {detailWithComposer}
      {isOwnItem ? null : (
        <ReportControl
          blockUserId={item.authorId}
          contextLedgerId={item.ledgerId}
          onVisibleChange={setReportingItem}
          showTrigger={false}
          subject={{kind: 'ITEM', itemId: item.id}}
          visible={reportingItem}
        />
      )}
    </AppScreen>
  );
}

type Comment = FunctionReturnType<
  typeof api.comments.queries.list
>['page'][number];

const CommentRow = memo(function CommentRow({
  comment,
  isOwn,
  ledgerId,
  onDelete,
  onOpenAttachment,
}: {
  readonly comment: Comment;
  readonly isOwn: boolean;
  readonly ledgerId: Id<'ledgers'>;
  readonly onDelete: (commentId: Comment['id']) => void;
  readonly onOpenAttachment: (commentId: Comment['id'], index: number) => void;
}): ReactElement {
  useLocale();
  const {theme} = useCPK();
  const {showActionSheetWithOptions} = useActionSheet();
  const sheetChrome = useActionSheetChrome();
  const [reporting, setReporting] = useState(false);
  const displayName = comment.blockedRelationship
    ? t('release.blockedUser')
    : comment.author.displayName || t('auth.noName');

  return (
    <View style={[styles.comment, {borderColor: theme.role.divider}]}>
      <View
        style={[styles.commentAvatar, {backgroundColor: theme.role.underlay}]}
      >
        {comment.author.avatarThumbUrl === null ||
        comment.blockedRelationship ? (
          <Icon color={theme.text.label} name="User" size={22} />
        ) : (
          <Image
            accessibilityLabel={displayName}
            contentFit="cover"
            source={comment.author.avatarThumbUrl}
            style={styles.commentAvatarImage}
          />
        )}
      </View>
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <View style={styles.commentIdentity}>
            <Typography.Body3
              $fontWeight="bold"
              numberOfLines={1}
              ellipsizeMode="tail"
              accessibilityLabel={displayName}
            >
              {displayName}
            </Typography.Body3>
            <Typography.Body4 style={{color: theme.text.placeholder}}>
              {formatDate(comment.createdAt, 'PP · p')}
            </Typography.Body4>
          </View>
          <CustomPressable
            accessibilityLabel={t('common.more')}
            accessibilityRole="button"
            onPress={(event) => {
              const options = [
                isOwn ? t('common.delete') : t('release.report'),
                t('common.cancel'),
              ];
              showActionSheetWithOptions(
                {
                  ...sheetChrome,
                  anchor: actionSheetAnchor(event),
                  cancelButtonIndex: 1,
                  destructiveButtonIndex: isOwn ? 0 : undefined,
                  options,
                },
                (selectedIndex) => {
                  if (selectedIndex !== 0) return;
                  if (isOwn) onDelete(comment.id);
                  else setReporting(true);
                },
              );
            }}
            style={styles.commentAction}
          >
            <Icon color={theme.text.label} name="DotsThree" size={20} />
          </CustomPressable>
        </View>
        {comment.blockedRelationship || comment.body.length > 0 ? (
          <Typography.Body3 style={{color: theme.text.basic}}>
            {comment.blockedRelationship
              ? t('release.blockedComment')
              : comment.body}
          </Typography.Body3>
        ) : null}
        {comment.attachmentPhotoIds.length === 0 ? null : (
          <View style={styles.commentAttachments}>
            {comment.attachmentPhotoIds.map((photoId, index) => (
              <CustomPressable
                accessibilityLabel={t('release.commentPhotoPosition', {
                  current: index + 1,
                  total: comment.attachmentPhotoIds.length,
                })}
                accessibilityRole="button"
                key={photoId}
                onPress={() => onOpenAttachment(comment.id, index)}
                style={styles.commentAttachmentButton}
              >
                <PrivateImage
                  accessibilityLabel={t('release.commentPhotoPosition', {
                    current: index + 1,
                    total: comment.attachmentPhotoIds.length,
                  })}
                  photoId={photoId}
                  style={styles.commentAttachment}
                />
              </CustomPressable>
            ))}
          </View>
        )}
        {isOwn ? null : (
          <ReportControl
            blockUserId={comment.authorId}
            contextLedgerId={ledgerId}
            onVisibleChange={setReporting}
            showTrigger={false}
            subject={{kind: 'COMMENT', commentId: comment.id}}
            visible={reporting}
          />
        )}
      </View>
    </View>
  );
});

function CustomPhoto({
  photoId,
  onPress,
}: {
  photoId: string;
  onPress: () => void;
}): ReactElement {
  return (
    <CustomPressable
      accessibilityLabel={t('release.receiptPhoto')}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.photoButton}
    >
      <PrivateImage
        accessibilityLabel={t('release.receiptPhoto')}
        photoId={photoId}
        style={styles.photo}
      />
    </CustomPressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  amount: {fontVariant: ['tabular-nums']},
  attachButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  comment: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  commentAction: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  commentAttachment: {height: 104, width: 104},
  commentAttachmentButton: {
    borderRadius: 10,
    height: 104,
    overflow: 'hidden',
    width: 104,
  },
  commentAttachments: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  commentAvatar: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  commentAvatarImage: {height: 44, width: 44},
  commentContent: {flex: 1, minWidth: 0, gap: 8},
  commentHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commentIdentity: {flex: 1, minWidth: 0, gap: 2},
  commentError: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  commentEmpty: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  commentEmptyCopy: {textAlign: 'center'},
  commentLoading: {
    alignItems: 'center',
    minHeight: 76,
    justifyContent: 'center',
  },
  commentRetry: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  // cpk-ui EditText owns width: 100%; a flex wrapper first claims only the
  // remaining row width so the trailing Send control stays on screen.
  commentInputWrap: {flex: 1, minWidth: 0},
  commentInputContainer: {
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  commentInputInner: {paddingVertical: 0},
  commentInputText: {
    maxHeight: 112,
    minHeight: 44,
    textAlignVertical: 'center',
  },
  commentReport: {alignItems: 'flex-start'},
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  composerField: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 56,
    paddingHorizontal: 6,
  },
  commentSend: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  commentSendDisabled: {opacity: 0.32},
  commentSectionHeader: {paddingBottom: 8, paddingTop: 4},
  deletedNotice: {marginTop: 16},
  deletedNoticeAction: {alignSelf: 'flex-start'},
  deletedNoticeContent: {gap: 12},
  deletedNoticeCopy: {alignItems: 'center', flexDirection: 'row', gap: 10},
  detailFrame: {gap: 0},
  detailLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingVertical: 9,
  },
  detailMetadata: {gap: 2, paddingBottom: 26},
  embeddedMore: {position: 'absolute', right: 0, top: 0},
  embeddedRoot: {flex: 1},
  flex: {flex: 1, minWidth: 0},
  headerTitle: {flex: 1},
  hero: {
    alignItems: 'flex-start',
    gap: 14,
    paddingBottom: 30,
    paddingTop: 24,
    position: 'relative',
  },
  listContent: {paddingHorizontal: 0},
  pendingPhoto: {height: 66, width: 66},
  pendingPhotoRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,28,45,0.86)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: -5,
    top: -5,
    width: 24,
  },
  pendingPhotoWrap: {
    borderRadius: 10,
    height: 66,
    marginRight: 3,
    marginTop: 5,
    overflow: 'visible',
    width: 66,
  },
  pendingPhotos: {gap: 8, paddingHorizontal: 4, paddingRight: 16},
  editButton: {
    alignItems: 'center',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    minWidth: 52,
    paddingHorizontal: 12,
  },
  photo: {height: 132, width: 132},
  photoButton: {
    borderCurve: 'continuous',
    borderRadius: 10,
    height: 132,
    overflow: 'hidden',
    width: 132,
  },
  photoGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  photoSection: {gap: 12, paddingBottom: 20, paddingTop: 18},
  photoSectionTitle: {alignItems: 'center', flexDirection: 'row', gap: 8},
  routeHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 52,
    paddingHorizontal: 4,
  },
  sectionDivider: {height: StyleSheet.hairlineWidth},
});
