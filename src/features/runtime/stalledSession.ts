import {useEffect, useState} from 'react';

/**
 * How long the branded loading surface may stay up before the app admits it is
 * stuck and offers a way out.
 *
 * Long enough that a slow cold start on a bad connection does not flash a
 * recovery screen at someone who was about to succeed; short enough that a
 * person — an app-store reviewer, say — does not conclude the app is broken and
 * close it. `BootGate` uses 1.5s for its own much narrower check.
 */
export const SESSION_STALL_MS = 15_000;

/**
 * True once the session has been settling for longer than {@link SESSION_STALL_MS}.
 *
 * `resolveSessionStage` has two sinks that return `'loading'` with no timer of
 * their own: the profile query sitting at `undefined`, and app lock never
 * becoming `ready`. Neither is guaranteed to resolve — a Convex watch that is
 * already subscribed does not re-invoke `onUpdate` until its result *changes*,
 * so a query that was re-run while the socket was paused for a new auth token
 * can stay `undefined` indefinitely. Before this existed the only escape was
 * force-quitting the app, and `app/_layout.tsx` offered its recovery screen
 * only while signed *out*, which is exactly the state this is not.
 *
 * This does not fix the underlying stall; it makes it recoverable.
 */
export function useSessionStalled(isSettling: boolean): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!isSettling) return;

    const timer = setTimeout(() => setStalled(true), SESSION_STALL_MS);

    // Reset on the way out rather than on the way in: clearing state in the
    // effect body is what cascades renders, and this runs exactly when the
    // settling window ends, so a stall recorded against one sign-in can never
    // be read as belonging to the next.
    return () => {
      clearTimeout(timer);
      setStalled(false);
    };
  }, [isSettling]);

  return stalled;
}
