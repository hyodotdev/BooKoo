import type {ReactElement} from 'react';
import {useLocalSearchParams} from 'expo-router';

import {SignInCodeScreen} from '~/features/auth/screens';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function SignInCodeRoute(): ReactElement {
  const params = useLocalSearchParams<{email?: string; provider?: string}>();
  return (
    <SignInCodeScreen
      email={first(params.email)}
      provider={first(params.provider)}
    />
  );
}
