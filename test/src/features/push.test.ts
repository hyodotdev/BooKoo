import {
  parsePushRouteData,
  routeForNotification,
  shouldPresentForeground,
} from '~/features/push/routeForNotification';

describe('notification routing', () => {
  it('accepts only the closed payload shape and ignores arbitrary URLs', () => {
    const parsed = parsePushRouteData({
      kind: 'COMMENT_ADDED',
      ledgerId: 'ledger',
      itemId: 'item',
      url: 'https://attacker.invalid',
    });
    expect(parsed).toEqual({
      kind: 'COMMENT_ADDED',
      ledgerId: 'ledger',
      itemId: 'item',
    });
    expect(routeForNotification(parsed!)).toBe('/entry/item');
    expect(parsePushRouteData({kind: 'UNKNOWN', url: '/settings'})).toBeNull();
    const invite = parsePushRouteData({
      kind: 'LEDGER_INVITE',
      code: 'one-time-secret',
    });
    expect(invite).toEqual({kind: 'LEDGER_INVITE', ledgerId: undefined, itemId: undefined});
    expect(routeForNotification(invite!)).toBe('/notifications');
  });

  it('suppresses only same-ledger item activity in the foreground', () => {
    const item = parsePushRouteData({kind: 'ITEM_ADDED', ledgerId: 'a', itemId: 'i'});
    expect(shouldPresentForeground(item, 'a')).toBe(false);
    expect(shouldPresentForeground(item, 'b')).toBe(true);
    expect(
      shouldPresentForeground(
        parsePushRouteData({kind: 'ROLE_CHANGED', ledgerId: 'a'}),
        'a',
      ),
    ).toBe(true);
  });
});
