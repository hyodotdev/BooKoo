import type {ReactElement} from 'react';
import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  View,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useAuthToken} from '@convex-dev/auth/react';
import {usePaginatedQuery, useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import type {FunctionReturnType} from 'convex/server';
import {useLocalSearchParams, useRouter} from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import {File, Paths} from 'expo-file-system';
import PagerView from 'react-native-pager-view';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  CustomPressable,
  Icon,
  PinchZoom,
  Typography,
  type PinchZoomRef,
} from 'cpk-ui';

import {api} from '@convex/_generated/api';
import type {Id} from '@convex/_generated/dataModel';
import {useBookooAlertDialog} from '~/components/modals/bookoo-alert-dialog';
import {AppScreen, ScreenSkeleton, ScreenState} from '~/features/ledger/ui';
import {canEditEntry} from '~/features/ledger/permissions';
import {useSession} from '~/features/auth/session';
import {showNotice} from '~/utils/alert';
import {t} from '~/utils/i18n';
import {PrivateImage} from './PrivateImage';

type LedgerPhoto = FunctionReturnType<
  typeof api.photos.queries.listByLedger
>['page'][number];

export function PhotoViewerScreen(): ReactElement {
  const dialog = useBookooAlertDialog();
  const {user} = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const token = useAuthToken();
  const params = useLocalSearchParams<{
    itemId?: string;
    index?: string;
    edit?: string;
    commentId?: string;
    photoId?: string;
  }>();
  const itemId = params.itemId ?? '';
  const commentId = params.commentId;
  const item = useQuery(api.items.queries.getMineByRoute, {itemId});
  const ledger = useQuery(
    api.ledgers.queries.get,
    item === undefined || item === null ? 'skip' : {ledgerId: item.ledgerId},
  );
  const itemPhotos = useQuery(
    api.photos.queries.listByItem,
    item === undefined || item === null || commentId !== undefined
      ? 'skip'
      : {itemId: item.id},
  );
  const commentPhotos = useQuery(
    api.photos.queries.listByComment,
    commentId === undefined
      ? 'skip'
      : {commentId: commentId as Id<'itemComments'>},
  );
  const photos = commentId === undefined ? itemPhotos : commentPhotos;
  const requestedIndex = Math.max(0, Number(params.index ?? '0') || 0);
  const [activeIndex, setActiveIndex] = useState(requestedIndex);
  const [pagingEnabled, setPagingEnabled] = useState(true);
  const [activeScale, setActiveScale] = useState(1);
  const pager = useRef<PagerView>(null);
  const positionedPhotoId = useRef<string | undefined>(undefined);
  const zooms = useRef(new Map<string, PinchZoomRef>());
  const clampedIndex = Math.min(
    activeIndex,
    Math.max(0, (photos?.length ?? 1) - 1),
  );
  const photo = photos?.[clampedIndex];
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canDelete =
    params.edit === '1' &&
    item !== undefined &&
    item !== null &&
    ledger !== undefined &&
    canEditEntry(ledger, item, user?.userId);
  const detach = useMutation(api.photos.mutations.detach);

  useEffect(() => {
    if (item !== null) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/(root)/timeline');
  }, [item, router]);

  useEffect(() => {
    if (photos === undefined || photos.length === 0) return;
    if (activeIndex < photos.length) return;
    const next = photos.length - 1;
    const timer = setTimeout(() => {
      setActiveIndex(next);
      pager.current?.setPageWithoutAnimation(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeIndex, photos]);

  useEffect(() => {
    if (
      photos === undefined ||
      params.photoId === undefined ||
      positionedPhotoId.current === params.photoId
    )
      return;
    const next = photos.findIndex(
      (candidate) => String(candidate.id) === params.photoId,
    );
    if (next < 0) return;
    positionedPhotoId.current = params.photoId;
    const timer = setTimeout(() => {
      setActiveIndex(next);
      pager.current?.setPageWithoutAnimation(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [params.photoId, photos]);

  useEffect(() => {
    if (item === undefined || item === null || photos?.length !== 0) return;
    if (router.canGoBack()) router.back();
    else
      router.replace({pathname: '/entry/[itemId]', params: {itemId: item.id}});
  }, [item, photos, router]);

  const downloadOriginal = async (): Promise<File> => {
    const origin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
    if (photo === undefined || token === null || origin === undefined)
      throw new Error('Photo unavailable');
    const destination = new File(Paths.cache, `${photo.id}-${Date.now()}.jpg`);
    return File.downloadFileAsync(
      `${origin}/media/photo/${encodeURIComponent(String(photo.id))}/original`,
      destination,
      {headers: {Authorization: `Bearer ${token}`}, idempotent: true},
    );
  };

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    let downloaded: File | null = null;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true, [
        'photo',
      ]);
      if (!permission.granted) {
        Alert.alert(t('permission.photosDenied'), undefined, [
          {style: 'cancel', text: t('common.cancel')},
          {
            text: t('permission.openSettings'),
            onPress: () => void Linking.openSettings(),
          },
        ]);
        return;
      }
      downloaded = await downloadOriginal();
      await MediaLibrary.Asset.create(downloaded.uri);
      showNotice(t('release.photoSaved'));
    } catch {
      showNotice(t('common.warning'), t('error.upload.invalid'));
    } finally {
      try {
        downloaded?.delete();
      } catch {
        // The OS or a previous idempotent download may already have removed it.
      }
      setSaving(false);
    }
  };

  const share = async (): Promise<void> => {
    if (sharing) return;
    setSharing(true);
    let downloaded: File | null = null;
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('Sharing unavailable');
      downloaded = await downloadOriginal();
      await Sharing.shareAsync(downloaded.uri, {
        dialogTitle: t('release.sharePhoto'),
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
      });
    } catch {
      showNotice(t('common.warning'), t('release.sharePhotoUnavailable'));
    } finally {
      try {
        downloaded?.delete();
      } catch {
        // The platform share sheet can move or release the temporary file.
      }
      setSharing(false);
    }
  };

  const setZoom = (scale: number): void => {
    if (photo === undefined) return;
    const next = Math.max(1, Math.min(4, scale));
    zooms.current.get(String(photo.id))?.setValues({scale: next});
    setActiveScale(next);
    setPagingEnabled(next <= 1);
  };
  const closeViewer = (): void => {
    if (router.canGoBack()) router.back();
    else if (item !== undefined && item !== null)
      router.replace({pathname: '/entry/[itemId]', params: {itemId: item.id}});
  };
  if (
    item === undefined ||
    item === null ||
    photos === undefined ||
    ledger === undefined
  )
    return (
      <AppScreen>
        <ScreenSkeleton rows={1} />
      </AppScreen>
    );
  if (photo === undefined)
    return (
      <AppScreen>
        <ScreenState icon="Image" title={t('release.noPhotos')} />
      </AppScreen>
    );
  return (
    <AppScreen
      backgroundColor="#000000"
      bottomInsetColor="#000000"
      statusBarBackgroundColor="#000000"
      statusBarStyle="light-content"
    >
      <View style={styles.viewer}>
        <View style={styles.photoHeader}>
          <CustomPressable
            accessibilityLabel={t('a11y.close')}
            accessibilityRole="button"
            onPress={closeViewer}
            style={styles.photoIconButton}
            testID="photo-viewer-close"
          >
            <Icon color="#FFFFFF" name="X" size={22} />
          </CustomPressable>
          <Typography.Body3 $fontWeight="bold" style={styles.photoTitle}>
            {t('release.receiptPhotoPosition', {
              current: clampedIndex + 1,
              total: photos.length,
            })}
          </Typography.Body3>
          <View style={styles.photoActions}>
            <PhotoAction
              accessibilityLabel={t('release.zoomOut')}
              icon="Minus"
              onPress={() => setZoom(activeScale - 1)}
            />
            <PhotoAction
              accessibilityLabel={t('release.zoomIn')}
              icon="Plus"
              onPress={() => setZoom(activeScale + 1)}
            />
          </View>
        </View>
        <PagerView
          initialPage={clampedIndex}
          onPageSelected={({nativeEvent}) => {
            const prior = photos[clampedIndex];
            if (prior !== undefined)
              zooms.current
                .get(String(prior.id))
                ?.setValues({scale: 1, translate: {x: 0, y: 0}});
            setActiveIndex(nativeEvent.position);
            setActiveScale(1);
            setPagingEnabled(true);
          }}
          ref={pager}
          scrollEnabled={pagingEnabled}
          style={styles.pager}
          testID="photo-viewer-pager"
        >
          {photos.map((row, rowIndex) => (
            <View key={row.id} style={styles.page}>
              <PinchZoom
                onInteractionStart={() => {
                  if (rowIndex === clampedIndex) setPagingEnabled(false);
                }}
                onScaleChanged={(scale) => {
                  if (rowIndex !== clampedIndex) return;
                  setActiveScale(scale);
                  setPagingEnabled(scale <= 1);
                }}
                ref={(instance) => {
                  if (instance === null) zooms.current.delete(String(row.id));
                  else zooms.current.set(String(row.id), instance);
                }}
                style={styles.zoom}
              >
                <PrivateImage
                  accessibilityLabel={t('release.receiptPhotoPosition', {
                    current: rowIndex + 1,
                    total: photos.length,
                  })}
                  contentFit="contain"
                  photoId={row.id}
                  style={styles.original}
                  variant="original"
                />
              </PinchZoom>
            </View>
          ))}
        </PagerView>
        <View
          style={[
            styles.photoBottomBar,
            {paddingBottom: Math.max(14, insets.bottom + 8)},
          ]}
        >
          <PhotoBottomAction
            icon="DownloadSimple"
            label={t('screen.save')}
            loading={saving}
            onPress={() => void save()}
            testID="photo-viewer-save"
          />
          <PhotoBottomAction
            icon="ShareNetwork"
            label={t('release.sharePhoto')}
            loading={sharing}
            onPress={() => void share()}
            testID="photo-viewer-share"
          />
          {canDelete ? (
            <PhotoBottomAction
              danger
              icon="TrashSimple"
              label={t('release.deletePhoto')}
              onPress={() =>
                dialog.confirm({
                  body: t('release.deletePhotoConfirm'),
                  confirmText: t('release.deletePhoto'),
                  icon: 'TrashSimple',
                  onConfirm: () => void detach({photoId: photo.id}),
                  title: t('release.deletePhoto'),
                  tone: 'danger',
                })
              }
              testID="photo-viewer-delete"
            />
          ) : null}
        </View>
      </View>
    </AppScreen>
  );
}

export function LedgerPhotosScreen({
  ledgerId,
}: {
  ledgerId: string;
}): ReactElement {
  const router = useRouter();
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
  const photos = usePaginatedQuery(
    api.photos.queries.listByLedger,
    ledger === undefined || ledger === null ? 'skip' : {ledgerId: ledger.id},
    // Three-column gallery pages are fixed at PHOTO_GALLERY_PAGE_SIZE (40),
    // which fills the viewport without widening beyond one indexed page.
    {initialNumItems: 40},
  );
  const openPhoto = useCallback(
    (photo: LedgerPhoto): void => {
      router.navigate({
        pathname: '/photo/[itemId]',
        params: {itemId: photo.itemId, photoId: photo.id},
      });
    },
    [router],
  );
  const renderPhoto = useCallback(
    ({item}: {item: LedgerPhoto}): ReactElement => (
      <LedgerPhotoTile onOpen={openPhoto} photo={item} />
    ),
    [openPhoto],
  );
  if (ledger === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={5} />
      </AppScreen>
    );
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  return (
    <AppScreen>
      <FlashList
        contentContainerStyle={styles.listContent}
        data={photos.results}
        keyExtractor={(photo) => String(photo.id)}
        ListEmptyComponent={
          photos.status === 'LoadingFirstPage' ? (
            <ScreenSkeleton rows={3} />
          ) : (
            <ScreenState icon="Image" title={t('release.noPhotos')} />
          )
        }
        numColumns={3}
        onEndReached={() => {
          // Match PHOTO_GALLERY_PAGE_SIZE on the indexed server query.
          if (photos.status === 'CanLoadMore') photos.loadMore(40);
        }}
        onEndReachedThreshold={0.6}
        renderItem={renderPhoto}
      />
    </AppScreen>
  );
}

const LedgerPhotoTile = memo(function LedgerPhotoTile({
  onOpen,
  photo,
}: {
  readonly onOpen: (photo: LedgerPhoto) => void;
  readonly photo: LedgerPhoto;
}): ReactElement {
  return (
    <CustomPressable
      accessibilityLabel={t('release.receiptPhoto')}
      accessibilityRole="button"
      onPress={() => onOpen(photo)}
      style={styles.galleryTile}
    >
      <PrivateImage
        accessibilityLabel={t('release.receiptPhoto')}
        photoId={photo.id}
        style={styles.galleryImage}
      />
    </CustomPressable>
  );
});

function PhotoAction({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
}: {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly icon: 'DownloadSimple' | 'Minus' | 'Plus' | 'TrashSimple';
  readonly onPress: () => void;
}): ReactElement {
  return (
    <CustomPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.photoIconButton, disabled && styles.photoActionDisabled]}
    >
      <Icon color="#FFFFFF" name={icon} size={20} />
    </CustomPressable>
  );
}

function PhotoBottomAction({
  danger = false,
  icon,
  label,
  loading = false,
  onPress,
  testID,
}: {
  readonly danger?: boolean;
  readonly icon: 'DownloadSimple' | 'ShareNetwork' | 'TrashSimple';
  readonly label: string;
  readonly loading?: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}): ReactElement {
  const color = danger ? '#FF879C' : '#FFFFFF';
  return (
    <CustomPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{busy: loading, disabled: loading}}
      disabled={loading}
      onPress={onPress}
      style={styles.photoBottomAction}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Icon color={color} name={icon} size={23} />
      )}
      <Typography.Body4 $fontWeight="bold" style={{color}}>
        {label}
      </Typography.Body4>
    </CustomPressable>
  );
}

const styles = StyleSheet.create({
  listContent: {padding: 12},
  galleryImage: {height: '100%', width: '100%'},
  galleryTile: {
    aspectRatio: 1,
    borderRadius: 6,
    flex: 1,
    margin: 2,
    overflow: 'hidden',
  },
  original: {height: '100%', width: '100%'},
  page: {backgroundColor: '#000000', flex: 1},
  pager: {flex: 1},
  photoActionDisabled: {opacity: 0.45},
  photoActions: {flexDirection: 'row', gap: 6},
  photoBottomAction: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 58,
  },
  photoBottomBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.94)',
    borderTopColor: 'rgba(255,255,255,0.12)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  photoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 8,
  },
  photoIconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  photoTitle: {color: '#FFFFFF', flex: 1, paddingHorizontal: 8},
  viewer: {backgroundColor: '#000000', flex: 1},
  zoom: {flex: 1},
});
