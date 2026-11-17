import {
  DELETION_GRACE_MS,
  HANDLE_RELEASE_COOLDOWN_MS,
} from '../../convex/lib/constants';

describe('auth lifecycle constants', () => {
  test('restore grace ends before another user may recycle a handle', () => {
    expect(DELETION_GRACE_MS).toBeLessThan(HANDLE_RELEASE_COOLDOWN_MS);
  });
});
