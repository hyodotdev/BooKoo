import {renderHook, act} from '@testing-library/react-native';

import {
  SESSION_STALL_MS,
  useSessionStalled,
} from '~/features/runtime/stalledSession';

describe('useSessionStalled', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stays quiet while the session settles within the budget', () => {
    const {result} = renderHook(() => useSessionStalled(true));
    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(SESSION_STALL_MS - 1);
    });
    expect(result.current).toBe(false);
  });

  it('reports a stall so the loading screen can offer a way out', () => {
    // Before this existed, an authenticated session stuck at `loading` had no
    // exit at all: the recovery screen was gated on being signed OUT, and
    // neither the unresolved-profile sink nor the app-lock sink has a timer.
    const {result} = renderHook(() => useSessionStalled(true));

    act(() => {
      jest.advanceTimersByTime(SESSION_STALL_MS);
    });
    expect(result.current).toBe(true);
  });

  it('clears once the session settles, so a later sign-in starts fresh', () => {
    const {result, rerender} = renderHook(
      ({settling}: {settling: boolean}) => useSessionStalled(settling),
      {initialProps: {settling: true}},
    );

    act(() => {
      jest.advanceTimersByTime(SESSION_STALL_MS);
    });
    expect(result.current).toBe(true);

    rerender({settling: false});
    expect(result.current).toBe(false);
  });

  it('does not arm while nothing is settling', () => {
    const {result} = renderHook(() => useSessionStalled(false));

    act(() => {
      jest.advanceTimersByTime(SESSION_STALL_MS * 3);
    });
    expect(result.current).toBe(false);
  });
});
