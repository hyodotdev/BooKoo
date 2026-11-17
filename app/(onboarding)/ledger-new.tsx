import type {ReactElement} from 'react';
import {Redirect} from 'expo-router';

export default function LedgerCreateOnboardingRoute(): ReactElement {
  return <Redirect href="/ledgers/new" />;
}
