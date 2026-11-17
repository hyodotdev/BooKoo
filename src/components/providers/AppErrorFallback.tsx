import type {ReactElement} from 'react';
import {router} from 'expo-router';
import type {Props as ErrorFallbackProps} from 'react-native-error-boundary/lib/ErrorBoundary/FallbackComponent';

import {BookooRecoveryScreen} from '../uis/BookooRecoveryScreen';
import {t} from '../../utils/i18n';

export function AppErrorFallback({
  resetError,
}: ErrorFallbackProps): ReactElement {
  const leaveFailedScreen = (): void => {
    const canGoBack = router.canGoBack();
    resetError();
    if (canGoBack) router.back();
    else router.replace('/(app)/(tabs)/(root)/me');
  };

  return (
    <BookooRecoveryScreen
      body={t('error.serverError')}
      code={t('common.error')}
      icon="WarningCircle"
      primaryAction={{label: t('common.tryAgain'), onPress: resetError}}
      secondaryAction={{label: t('a11y.back'), onPress: leaveFailedScreen}}
      testID="app-error-fallback"
      title={t('error.generic')}
      tone="danger"
    />
  );
}
