import {File} from 'expo-file-system';

import type {Id} from '@convex/_generated/dataModel';

export async function uploadFile(
  url: string,
  uri: string,
  contentType: string,
): Promise<Id<'_storage'>> {
  const file = new File(uri);
  if (!file.exists || file.size === null || file.size < 1)
    throw new Error('Upload source missing');
  const response = await file.upload(url, {
    headers: {'Content-Type': contentType},
    httpMethod: 'POST',
    mimeType: contentType,
    sessionType: 'foreground',
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Upload failed (${response.status})`);
  const value: unknown = JSON.parse(response.body);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('storageId' in value) ||
    typeof value.storageId !== 'string'
  )
    throw new Error('Upload response invalid');
  return value.storageId as Id<'_storage'>;
}
