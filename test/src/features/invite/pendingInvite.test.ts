import * as SecureStore from 'expo-secure-store';

import {
  clearJoinedInviteContinuation,
  clearPendingInvite,
  pendingInviteConstants,
  readJoinedInviteContinuation,
  readPendingInvite,
  saveJoinedInviteContinuation,
  savePendingInvite,
} from '../../../../src/features/invite/pendingInvite';
import {shouldResumePendingInvite} from '../../../../src/features/invite/pendingInviteResume';

describe('pending invite continuation', () => {
  const inviteCode = 'BK1000G40R40M30E209185GR38E1W';
  const otherInviteCode = 'BK1040G40R40M30E209185GR38E1W';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  });

  it('resumes after an existing sign-in or the ledger onboarding step', () => {
    expect(shouldResumePendingInvite('ready', 'done', '/')).toBe(true);
    expect(shouldResumePendingInvite('onboarding', 'ledger', '/ledger')).toBe(
      true,
    );
    expect(shouldResumePendingInvite('onboarding', 'profile', '/profile')).toBe(
      false,
    );
    expect(shouldResumePendingInvite('signed-out', null, '/sign-in')).toBe(
      false,
    );
    expect(
      shouldResumePendingInvite('ready', 'done', '/invite/BOOKOO-1234'),
    ).toBe(false);
  });

  it('normalizes and securely persists a valid invite', async () => {
    await savePendingInvite(' bk1-ooog-4or4-om3o-e2o9-185g-r38e-1w ');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      pendingInviteConstants.key,
      expect.stringContaining(inviteCode),
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  });

  it('clears malformed persisted codes instead of retrying forever', async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce(
        JSON.stringify({code: 'not-an-invite', savedAt: Date.now()}),
      );

    await expect(readPendingInvite()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      pendingInviteConstants.key,
      expect.any(Object),
    );
  });

  it('only clears the invite that reached a terminal state', async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValue(
        JSON.stringify({code: inviteCode, savedAt: Date.now()}),
      );

    await clearPendingInvite(otherInviteCode);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();

    await clearPendingInvite(inviteCode);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
  });

  it('scopes a joined-invite continuation to the accepting account', async () => {
    await saveJoinedInviteContinuation(inviteCode, 'user-invitee', 'ledger');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      pendingInviteConstants.joinedKey,
      expect.stringContaining('user-invitee'),
      expect.any(Object),
    );

    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(
      JSON.stringify({
        code: inviteCode,
        userId: 'user-invitee',
        ledgerId: 'ledger',
        savedAt: Date.now(),
      }),
    );
    await expect(readJoinedInviteContinuation('user-invitee')).resolves.toEqual(
      {
        code: inviteCode,
        ledgerId: 'ledger',
        pendingCode: inviteCode,
      },
    );
    await expect(
      readJoinedInviteContinuation('user-other'),
    ).resolves.toBeNull();

    await clearJoinedInviteContinuation();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      pendingInviteConstants.joinedKey,
      expect.any(Object),
    );
  });

  it('can still clean up a continuation written before a destination was saved', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
      JSON.stringify({
        code: inviteCode,
        userId: 'user-invitee',
        savedAt: Date.now(),
      }),
    );

    await expect(readJoinedInviteContinuation('user-invitee')).resolves.toEqual(
      {
        code: inviteCode,
        ledgerId: null,
        pendingCode: inviteCode,
      },
    );
  });

  it('continues onboarding for the accepting account if secure storage is unavailable', async () => {
    jest
      .mocked(SecureStore.setItemAsync)
      .mockRejectedValueOnce(new Error('unavailable keychain'));
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);

    await saveJoinedInviteContinuation(inviteCode, 'user-invitee', 'ledger');
    jest.mocked(SecureStore.getItemAsync).mockClear();

    await expect(
      readJoinedInviteContinuation('user-other'),
    ).resolves.toBeNull();
    await expect(readJoinedInviteContinuation('user-invitee')).resolves.toEqual(
      {code: inviteCode, ledgerId: 'ledger', pendingCode: inviteCode},
    );
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    await clearJoinedInviteContinuation();
    await expect(
      readJoinedInviteContinuation('user-invitee'),
    ).resolves.toBeNull();
  });

  it('keeps the original signup code when a different invite is accepted', async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce(
        JSON.stringify({code: inviteCode, savedAt: Date.now()}),
      );
    await saveJoinedInviteContinuation(
      otherInviteCode,
      'user-invitee',
      'ledger',
    );

    await expect(readJoinedInviteContinuation('user-invitee')).resolves.toEqual(
      {code: otherInviteCode, ledgerId: 'ledger', pendingCode: inviteCode},
    );
    await clearJoinedInviteContinuation();
  });
});
