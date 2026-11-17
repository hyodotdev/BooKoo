import type {ReactElement} from 'react';
import {useEffect} from 'react';
import {useRouter} from 'expo-router';

import {RouteLoadingScreen} from '~/features/runtime/routeLoading';

export default function AppIndex(): ReactElement {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(app)/(tabs)/(root)');
  }, [router]);

  return <RouteLoadingScreen />;
}
