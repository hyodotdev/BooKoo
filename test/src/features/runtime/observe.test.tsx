import type {ReactElement} from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {Observe} from 'expo-observe';

import type {SessionStage} from '~/features/auth/session';
import {
  OBSERVE_ENVIRONMENT,
  OBSERVE_SAMPLE_RATE,
  useObserveReadiness,
} from '~/features/runtime/observe';

jest.mock('expo', () => {
  const actual = jest.requireActual<typeof import('expo')>('expo');
  return {
    ...actual,
    requireOptionalNativeModule: jest.fn(() => ({})),
  };
});

function Harness({stage}: {stage: SessionStage}): ReactElement | null {
  useObserveReadiness(stage);
  return null;
}

describe('privacy-safe EAS Observe lifecycle', () => {
  const configure = Observe.configure as jest.MockedFunction<
    typeof Observe.configure
  >;
  const markInteractive = Observe.markInteractive as jest.MockedFunction<
    typeof Observe.markInteractive
  >;

  beforeEach(() => {
    markInteractive.mockClear();
  });

  it('configures sampled performance without router or debug telemetry', () => {
    expect(OBSERVE_ENVIRONMENT).toBe('development');
    expect(OBSERVE_SAMPLE_RATE).toBe(0.25);
    expect(configure).toHaveBeenCalledWith({
      dispatchingEnabled: false,
      dispatchInDebug: false,
      environment: 'development',
      integrations: {},
      sampleRate: 0.25,
    });
  });

  it.each(['loading', 'profile-missing'] as const)(
    'does not mark %s as interactive',
    async (stage) => {
      render(<Harness stage={stage} />);
      await Promise.resolve();
      expect(markInteractive).not.toHaveBeenCalled();
    },
  );

  it.each([
    'signed-out',
    'suspended',
    'pending-deletion',
    'onboarding',
    'locked',
    'ready',
  ] as const)(
    'marks the settled %s entry surface interactive',
    async (stage) => {
      render(<Harness stage={stage} />);
      await waitFor(() => expect(markInteractive).toHaveBeenCalledTimes(1));
    },
  );
});
