import * as Expo from 'expo';
import {deleteAsync} from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import {readReceipt} from '../../../../src/features/media/receiptOcr';

const mockRecognize = jest.fn(() =>
  Promise.resolve(['TOTAL USD 185.00', '2026-10-06']),
);
jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(() => ({recognize: mockRecognize})),
}));
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {JPEG: 'jpeg'},
  manipulateAsync: jest.fn(),
}));
const photo = {
  key: 'synthetic',
  uri: 'file:///original.jpg',
  width: 3200,
  height: 4800,
  mimeType: 'image/jpeg',
};

describe('on-device receipt processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecognize.mockResolvedValue(['TOTAL USD 185.00', '2026-10-06']);
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockResolvedValue({uri: 'file:///ocr.jpg', width: 1600, height: 2400});
  });
  it('bounds the native image and removes its private derivative after recognition', async () => {
    await expect(readReceipt(photo, 'USD', 'en')).resolves.toEqual({
      amountMinor: 18500,
      dayKey: 20261006,
      currencyMismatch: false,
    });
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      photo.uri,
      [{resize: {height: 2400}}],
      {compress: 0.95, format: 'jpeg'},
    );
    expect(mockRecognize).toHaveBeenCalledWith('file:///ocr.jpg', 'en');
    expect(deleteAsync).toHaveBeenCalledWith('file:///ocr.jpg', {
      idempotent: true,
    });
  });
  it('removes the derivative even when native recognition fails', async () => {
    mockRecognize.mockRejectedValueOnce(new Error('native failure'));
    await expect(readReceipt(photo, 'USD', 'en')).rejects.toThrow(
      'native failure',
    );
    expect(deleteAsync).toHaveBeenCalledWith('file:///ocr.jpg', {
      idempotent: true,
    });
  });
  it('never removes the selected original if the manipulator returns its URI', async () => {
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockResolvedValue({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      });
    await readReceipt(photo, 'USD', 'en');
    expect(deleteAsync).not.toHaveBeenCalled();
  });
  it('fails before processing when the native module is unavailable', async () => {
    jest.mocked(Expo.requireOptionalNativeModule).mockReturnValueOnce(null);
    await expect(readReceipt(photo, 'USD', 'en')).rejects.toThrow(
      'Receipt recognition unavailable',
    );
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
  });
});
