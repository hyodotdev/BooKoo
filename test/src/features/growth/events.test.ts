import {bindGrowthTracker, trackPaywallShown} from '~/features/growth/events';
import {handleErrorConsole} from '~/utils/error';
jest.mock('~/utils/error', () => ({handleErrorConsole: jest.fn()}));
afterEach(() => {
  bindGrowthTracker(null);
  jest.clearAllMocks();
});
it('tracks only the bounded paywall placement', () => {
  const tracker = jest.fn();
  bindGrowthTracker(tracker);
  trackPaywallShown('member_limit');
  expect(tracker).toHaveBeenCalledWith('paywall_show', {
    placement: 'member_limit',
  });
});
it('works without a configured tracker', () => {
  expect(() => trackPaywallShown('second_ledger')).not.toThrow();
});
it('isolates analytics failures from purchases', () => {
  bindGrowthTracker(() => {
    throw new Error('offline');
  });
  expect(() => trackPaywallShown('member_limit')).not.toThrow();
  expect(handleErrorConsole).toHaveBeenCalled();
});
