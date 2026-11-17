import type {ReactElement} from 'react';
import {Stack} from 'expo-router';

export default function OnboardingLayout(): ReactElement {
  return <Stack screenOptions={{headerShown: false, gestureEnabled: false}} />;
}
