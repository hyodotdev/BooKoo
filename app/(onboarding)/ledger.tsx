import type {ReactElement} from 'react';
import {Redirect} from 'expo-router';

export default function LedgerOnboardingRoute(): ReactElement {
  return <Redirect href="/" />;
}
