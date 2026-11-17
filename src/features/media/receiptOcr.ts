import {requireOptionalNativeModule} from 'expo';
import {deleteAsync} from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import {
  receiptSuggestions,
  type ReceiptSuggestions,
} from '@shared/receiptSuggestions';
import type {PendingItemPhoto} from './itemPhotoUpload';

interface ReceiptOcrModule {
  readonly recognize: (uri: string, language: string) => Promise<string[]>;
}

export function isReceiptOcrAvailable(): boolean {
  return (
    requireOptionalNativeModule<ReceiptOcrModule>('BookooReceiptOcr') !== null
  );
}

export async function readReceipt(
  photo: PendingItemPhoto,
  currency: string,
  locale: string,
): Promise<ReceiptSuggestions> {
  const native =
    requireOptionalNativeModule<ReceiptOcrModule>('BookooReceiptOcr');
  if (native === null) throw new Error('Receipt recognition unavailable');
  const largest = Math.max(photo.width, photo.height);
  const resized = await ImageManipulator.manipulateAsync(
    photo.uri,
    largest > 2400
      ? [
          photo.width >= photo.height
            ? {resize: {width: 2400}}
            : {resize: {height: 2400}},
        ]
      : [],
    {compress: 0.95, format: ImageManipulator.SaveFormat.JPEG},
  );
  try {
    const lines = await native.recognize(resized.uri, locale);
    return receiptSuggestions(lines, currency, locale);
  } finally {
    if (resized.uri !== photo.uri)
      await deleteAsync(resized.uri, {idempotent: true}).catch(() => undefined);
  }
}
