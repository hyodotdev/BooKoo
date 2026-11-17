import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type {Id} from '@convex/_generated/dataModel';
import {hasPhotoPickerAccess} from './photoPickerPermission';
import {uploadFile} from './upload';

export interface PendingItemPhoto {
  readonly key: string;
  readonly height: number;
  readonly mimeType: string;
  readonly uri: string;
  readonly width: number;
}

export async function pickItemPhotos(
  selectionLimit: number,
): Promise<readonly PendingItemPhoto[]> {
  if (selectionLimit < 1) return [];
  if (!(await hasPhotoPickerAccess())) throw new Error('Permission denied');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: selectionLimit > 1,
    selectionLimit,
    quality: 0.92,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, selectionLimit).map((asset) => ({
    key: Crypto.randomUUID(),
    height: asset.height,
    mimeType: asset.mimeType ?? 'image/jpeg',
    uri: asset.uri,
    width: asset.width,
  }));
}

export async function uploadItemPhoto({
  attach,
  claim,
  generateUrl,
  itemId,
  photo,
}: {
  readonly attach: (args: {
    readonly height: number;
    readonly itemId: Id<'ledgerItems'>;
    readonly storageId: Id<'_storage'>;
    readonly thumbStorageId: Id<'_storage'>;
    readonly width: number;
  }) => Promise<{readonly photoId: Id<'itemPhotos'>}>;
  readonly claim: (args: {
    readonly itemId: Id<'ledgerItems'>;
    readonly purpose: 'ITEM_PHOTO';
    readonly storageId: Id<'_storage'>;
    readonly variant: 'ORIGINAL' | 'THUMB';
  }) => Promise<null>;
  readonly generateUrl: (args: {
    readonly itemId: Id<'ledgerItems'>;
    readonly purpose: 'ITEM_PHOTO';
  }) => Promise<string>;
  readonly itemId: Id<'ledgerItems'>;
  readonly photo: PendingItemPhoto;
}): Promise<void> {
  const thumb = await ImageManipulator.manipulateAsync(
    photo.uri,
    [{resize: {width: Math.min(320, photo.width)}}],
    {compress: 0.8, format: ImageManipulator.SaveFormat.JPEG},
  );
  const [originalUrl, thumbUrl] = await Promise.all([
    generateUrl({purpose: 'ITEM_PHOTO', itemId}),
    generateUrl({purpose: 'ITEM_PHOTO', itemId}),
  ]);
  const [storageId, thumbStorageId] = await Promise.all([
    uploadFile(originalUrl, photo.uri, photo.mimeType),
    uploadFile(thumbUrl, thumb.uri, 'image/jpeg'),
  ]);
  await Promise.all([
    claim({
      storageId,
      purpose: 'ITEM_PHOTO',
      variant: 'ORIGINAL',
      itemId,
    }),
    claim({
      storageId: thumbStorageId,
      purpose: 'ITEM_PHOTO',
      variant: 'THUMB',
      itemId,
    }),
  ]);
  await attach({
    itemId,
    storageId,
    thumbStorageId,
    width: photo.width,
    height: photo.height,
  });
}
