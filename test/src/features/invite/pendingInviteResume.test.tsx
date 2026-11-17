import 'react-native';

import {render, waitFor} from '@testing-library/react-native';
import {router, usePathname} from 'expo-router';

import {useSession} from '../../../../src/features/auth/session';
import {
  clearJoinedInviteContinuation,
  clearPendingInvite,
  readJoinedInviteContinuation,
  readPendingInvite,
} from '../../../../src/features/invite/pendingInvite';
import {
  PendingInviteResume,
  shouldLeaveCompletedOnboardingPath,
} from '../../../../src/features/invite/pendingInviteResume';

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../../../src/features/invite/pendingInvite', () => ({
  clearJoinedInviteContinuation: jest.fn(),
  clearPendingInvite: jest.fn(),
  readJoinedInviteContinuation: jest.fn(),
  readPendingInvite: jest.fn(),
}));

describe('PendingInviteResume', () => {
  const inviteCode = 'BK1000G40R40M30E209185GR38E1W';
  const differentInviteCode = 'BK1040G40R40M30E209185GR38E1W';
  const joined = {
    code: inviteCode,
    ledgerId: 'ledger-joined',
    pendingCode: inviteCode,
  };
  const joinedDestination = {
    pathname: '/ledger/[ledgerId]',
    params: {ledgerId: joined.ledgerId, joined: '1'},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(usePathname).mockReturnValue('/ledger');
    jest.mocked(readJoinedInviteContinuation).mockResolvedValue(null);
    jest.mocked(readPendingInvite).mockResolvedValue(inviteCode);
  });

  it('returns a fresh account to the invite at ledger onboarding', async () => {
    jest.mocked(useSession).mockReturnValue({
      appLock: {} as ReturnType<typeof useSession>['appLock'],
      isAuthenticated: true,
      onboardingStep: 'ledger',
      stage: 'onboarding',
      user: {userId: 'user-new'} as ReturnType<typeof useSession>['user'],
    });

    render(<PendingInviteResume />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/invite/[code]',
        params: {code: inviteCode},
      }),
    );
  });

  it('waits until profile onboarding is complete', async () => {
    jest.mocked(usePathname).mockReturnValue('/');
    jest.mocked(useSession).mockReturnValue({
      appLock: {} as ReturnType<typeof useSession>['appLock'],
      isAuthenticated: true,
      onboardingStep: 'profile',
      stage: 'onboarding',
      user: {userId: 'user-new'} as ReturnType<typeof useSession>['user'],
    });

    render(<PendingInviteResume />);

    await waitFor(() => expect(readPendingInvite).not.toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('finishes a joined invite only after the ready stack exists', async () => {
    jest.mocked(usePathname).mockReturnValue('/invite/code');
    jest.mocked(readJoinedInviteContinuation).mockResolvedValue(joined);
    jest.mocked(useSession).mockReturnValue({
      appLock: {} as ReturnType<typeof useSession>['appLock'],
      isAuthenticated: true,
      onboardingStep: 'done',
      stage: 'ready',
      user: {userId: 'user-new'} as ReturnType<typeof useSession>['user'],
    });

    render(<PendingInviteResume />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(joinedDestination),
    );
    expect(readJoinedInviteContinuation).toHaveBeenCalledWith('user-new');
    expect(clearPendingInvite).toHaveBeenCalledWith(inviteCode);
    expect(clearJoinedInviteContinuation).toHaveBeenCalled();
  });

  it('does not strand a joined account when secure cleanup fails', async () => {
    jest.mocked(readJoinedInviteContinuation).mockResolvedValue(joined);
    jest.mocked(clearPendingInvite).mockRejectedValue(new Error('keychain'));
    jest
      .mocked(clearJoinedInviteContinuation)
      .mockRejectedValue(new Error('keychain'));
    jest.mocked(useSession).mockReturnValue({
      appLock: {} as ReturnType<typeof useSession>['appLock'],
      isAuthenticated: true,
      onboardingStep: 'done',
      stage: 'ready',
      user: {userId: 'user-new'} as ReturnType<typeof useSession>['user'],
    });

    render(<PendingInviteResume />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(joinedDestination),
    );
  });

  it('does not open a different sign-in invite after accepting a newer link', async () => {
    jest
      .mocked(readJoinedInviteContinuation)
      .mockResolvedValueOnce({...joined, pendingCode: differentInviteCode})
      .mockResolvedValue(null);
    jest.mocked(clearPendingInvite).mockRejectedValue(new Error('keychain'));
    jest.mocked(readPendingInvite).mockResolvedValue(differentInviteCode);
    jest.mocked(useSession).mockReturnValue({
      appLock: {} as ReturnType<typeof useSession>['appLock'],
      isAuthenticated: true,
      onboardingStep: 'done',
      stage: 'ready',
      user: {userId: 'user-new'} as ReturnType<typeof useSession>['user'],
    });
    jest.mocked(usePathname).mockReturnValue('/invite/code');
    const screen = render(<PendingInviteResume />);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(joinedDestination),
    );

    jest.mocked(usePathname).mockReturnValue('/ledger/ledger-joined');
    screen.rerender(<PendingInviteResume />);
    await waitFor(() =>
      expect(readJoinedInviteContinuation).toHaveBeenCalledTimes(2),
    );
    expect(clearPendingInvite).toHaveBeenCalledWith(differentInviteCode);
    expect(readPendingInvite).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);

    // A later invite is still eligible even if cleanup of the older one failed.
    jest.mocked(readPendingInvite).mockResolvedValue(inviteCode);
    jest.mocked(usePathname).mockReturnValue('/');
    screen.rerender(<PendingInviteResume />);
    await waitFor(() =>
      expect(router.replace).toHaveBeenLastCalledWith({
        pathname: '/invite/[code]',
        params: {code: inviteCode},
      }),
    );
  });

  it('leaves an onboarding-only route as soon as the session is ready', async () => {
    jest.mocked(usePathname).mockReturnValue('/profile');
    jest.mocked(readJoinedInviteContinuation).mockResolvedValue(joined);
    jest.mocked(useSession).mockReturnValue({
      appLock: {} as ReturnType<typeof useSession>['appLock'],
      isAuthenticated: true,
      onboardingStep: 'done',
      stage: 'ready',
      user: {userId: 'user-new'} as ReturnType<typeof useSession>['user'],
    });

    render(<PendingInviteResume />);

    expect(router.replace).toHaveBeenCalledWith('/');
    await waitFor(() =>
      expect(router.replace).toHaveBeenLastCalledWith(joinedDestination),
    );
  });

  it('does not leave public invite routes for an onboarded account', () => {
    expect(shouldLeaveCompletedOnboardingPath('ready', '/invite/code')).toBe(
      false,
    );
    expect(shouldLeaveCompletedOnboardingPath('ready', '/profile')).toBe(true);
    expect(shouldLeaveCompletedOnboardingPath('onboarding', '/ledger')).toBe(
      true,
    );
    expect(
      shouldLeaveCompletedOnboardingPath('onboarding', '/legacy-claim'),
    ).toBe(false);
  });
});
