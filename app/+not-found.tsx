import type {ReactElement} from 'react';
import {useRouter} from 'expo-router';

import {BookooRecoveryScreen} from '~/components/uis/BookooRecoveryScreen';
import {t} from '~/utils/i18n';

export default function NotFoundScreen(): ReactElement {
  const router = useRouter();
  const canGoBack = router.canGoBack();
  const goBack = () => (canGoBack ? router.back() : router.replace('/'));

  return (
    <BookooRecoveryScreen
      body={t('error.pageNotFoundBody')}
      code="404"
      icon="MapTrifold"
      primaryAction={{
        label: canGoBack ? t('a11y.back') : t('common.goHome'),
        onPress: goBack,
      }}
      secondaryAction={
        canGoBack
          ? {label: t('common.goHome'), onPress: () => router.replace('/')}
          : undefined
      }
      testID="not-found-screen"
      title={t('error.notFound')}
    />
  );
}
