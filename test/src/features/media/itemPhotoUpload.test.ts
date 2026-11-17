import type {Id} from '@convex/_generated/dataModel';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  pickItemPhotos,
  uploadItemPhoto,
} from '../../../../src/features/media/itemPhotoUpload';
import {uploadFile} from '../../../../src/features/media/upload';
import {hasPhotoPickerAccess} from '../../../../src/features/media/photoPickerPermission';

jest.mock('../../../../src/features/media/photoPickerPermission', () => ({
  hasPhotoPickerAccess: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('../../../../src/features/media/upload', () => ({
  uploadFile: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {JPEG: 'jpeg'},
  manipulateAsync: jest.fn(),
}));

describe('item photo upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the system gallery directly and enforces the remaining limit', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: Array.from({length: 6}, (_, index) => ({
        assetId: null,
        base64: null,
        duration: null,
        exif: null,
        fileName: `photo-${index}.jpg`,
        fileSize: 100,
        height: 800,
        mimeType: 'image/jpeg',
        type: 'image',
        uri: `file:///photo-${index}.jpg`,
        width: 1200,
      })),
    });

    const photos = await pickItemPhotos(5);

    expect(hasPhotoPickerAccess).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.92,
    });
    expect(photos).toHaveLength(5);
    expect(photos.map((photo) => photo.uri)).toEqual([
      'file:///photo-0.jpg',
      'file:///photo-1.jpg',
      'file:///photo-2.jpg',
      'file:///photo-3.jpg',
      'file:///photo-4.jpg',
    ]);
  });

  it('claims original and thumbnail before attaching the photo', async () => {
    jest.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({
      height: 213,
      uri: 'file:///thumb.jpg',
      width: 320,
    });
    jest
      .mocked(uploadFile)
      .mockResolvedValueOnce('original-storage' as Id<'_storage'>)
      .mockResolvedValueOnce('thumb-storage' as Id<'_storage'>);
    const generateUrl = jest
      .fn()
      .mockResolvedValueOnce('https://upload.test/original')
      .mockResolvedValueOnce('https://upload.test/thumb');
    const claim = jest.fn(() => Promise.resolve(null));
    const attach = jest.fn(() =>
      Promise.resolve({photoId: 'photo-id' as Id<'itemPhotos'>}),
    );

    await uploadItemPhoto({
      attach,
      claim,
      generateUrl,
      itemId: 'item-id' as Id<'ledgerItems'>,
      photo: {
        height: 800,
        key: 'pending',
        mimeType: 'image/jpeg',
        uri: 'file:///original.jpg',
        width: 1200,
      },
    });

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///original.jpg',
      [{resize: {width: 320}}],
      {compress: 0.8, format: 'jpeg'},
    );
    expect(uploadFile).toHaveBeenNthCalledWith(
      1,
      'https://upload.test/original',
      'file:///original.jpg',
      'image/jpeg',
    );
    expect(uploadFile).toHaveBeenNthCalledWith(
      2,
      'https://upload.test/thumb',
      'file:///thumb.jpg',
      'image/jpeg',
    );
    expect(claim).toHaveBeenCalledTimes(2);
    expect(attach).toHaveBeenCalledWith({
      height: 800,
      itemId: 'item-id',
      storageId: 'original-storage',
      thumbStorageId: 'thumb-storage',
      width: 1200,
    });
  });
});
