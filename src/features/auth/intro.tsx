import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {BOOKOO_PALETTE} from '~/theme/bookooPalette';
import {SignInScreen} from './screens';
import {TutorialScreen} from './tutorial';

export type AuthIntroStep = 'tutorial' | 'handoff' | 'sign-in';

let introFinishedThisSession = false;

export function nextAuthIntroStep(step: AuthIntroStep): AuthIntroStep {
  if (step === 'tutorial') return 'handoff';
  return 'sign-in';
}

export function authIntroStartsOnSignIn(): boolean {
  return introFinishedThisSession;
}

export function markAuthIntroFinished(): void {
  introFinishedThisSession = true;
}

export function resetAuthIntroFinishedForTests(): void {
  introFinishedThisSession = false;
}

export function AuthIntroScreen(): ReactElement {
  const [step, setStep] = useState<AuthIntroStep>(
    introFinishedThisSession ? 'sign-in' : 'tutorial',
  );

  useEffect(() => {
    if (step !== 'handoff') return;
    const frame = requestAnimationFrame(() => {
      setStep('sign-in');
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const finishTutorial = (): void => {
    markAuthIntroFinished();
    setStep(nextAuthIntroStep('tutorial'));
  };

  return (
    <View collapsable={false} style={styles.shell}>
      {step === 'sign-in' ? (
        <SignInScreen />
      ) : step === 'handoff' ? null : (
        <TutorialScreen onFinished={finishTutorial} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {backgroundColor: BOOKOO_PALETTE.dusk, flex: 1},
});
