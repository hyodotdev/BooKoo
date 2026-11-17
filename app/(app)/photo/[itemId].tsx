import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {PhotoViewerScreen} from '~/features/media/screens';

export default function PhotoRoute(): ReactElement {
  const {itemId, commentId, index, photoId} = useLocalSearchParams<{
    itemId: string;
    commentId?: string;
    index?: string;
    photoId?: string;
  }>();
  // Keep a single route, but reset the pager and zoom for a new selection.
  return (
    <PhotoViewerScreen
      key={JSON.stringify([itemId, commentId, index, photoId])}
    />
  );
}
