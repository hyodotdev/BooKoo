import type {PropsWithChildren, ReactElement} from 'react';

import {useLocale} from '~/hooks/useLocale';

export function LocaleProvider({children}: PropsWithChildren): ReactElement {
  useLocale();
  return <>{children}</>;
}
