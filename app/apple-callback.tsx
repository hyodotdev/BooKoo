import type {ReactElement} from 'react';
import {View} from 'react-native';
import {Redirect} from 'expo-router';

import {
  onboardingRouteFor,
  sessionShowsAppShell,
} from '~/features/auth/onboardingNavigation';
import {useSession} from '~/features/auth/session';
import {BOOKOO_PALETTE} from '~/theme/bookooPalette';

export default function AppleCallbackScreen(): ReactElement {
  const {onboardingStep, stage} = useSession();
  if (sessionShowsAppShell(stage, onboardingStep)) return <Redirect href="/" />;
  if (stage === 'onboarding') {
    const route = onboardingRouteFor(onboardingStep ?? 'ledger');
    return <Redirect href={route ?? '/'} />;
  }
  if (
    stage === 'locked' ||
    stage === 'suspended' ||
    stage === 'pending-deletion'
  )
    return <Redirect href="/" />;
  return (
    <View
      style={{backgroundColor: BOOKOO_PALETTE.brandNavy, flex: 1}}
      testID="apple-callback-hold"
    />
  );
}
