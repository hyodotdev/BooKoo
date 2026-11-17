import type {ReactElement} from 'react';
import {Redirect, useLocalSearchParams} from 'expo-router';

import {isLegalDocument, LegalDetailScreen} from '~/features/settings/legal';

export default function LegalDocumentRoute(): ReactElement {
  const params = useLocalSearchParams<{document?: string | string[]}>();
  const value = Array.isArray(params.document)
    ? params.document[0]
    : params.document;

  if (value === undefined || !isLegalDocument(value))
    return <Redirect href="/settings/about" />;

  return <LegalDetailScreen document={value} />;
}
