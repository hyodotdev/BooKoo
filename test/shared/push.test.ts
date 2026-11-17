import {
  INBOX_PUSH_KINDS,
  PUSH_LOCALES,
  isInboxPushKind,
  isQuietMinute,
  pushChannelForKind,
  renderInboxPush,
  renderItemAddedPush,
} from '@shared/push';

describe('push delivery rules', () => {
  it('handles same-day and overnight quiet hours', () => {
    expect(isQuietMinute(60, 60, 120)).toBe(true);
    expect(isQuietMinute(120, 60, 120)).toBe(false);
    expect(isQuietMinute(23 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(isQuietMinute(6 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(isQuietMinute(12 * 60, 22 * 60, 7 * 60)).toBe(false);
    expect(isQuietMinute(60, undefined, undefined)).toBe(false);
  });

  it('renders every inbox kind in every supported locale', () => {
    for (const locale of PUSH_LOCALES)
      for (const kind of INBOX_PUSH_KINDS) {
        const rendered = renderInboxPush(locale, kind);
        expect(rendered.title.length).toBeGreaterThan(0);
        expect(rendered.body.length).toBeGreaterThan(0);
        expect(/[\u0000-\u001f\u007f]/.test(rendered.title)).toBe(false);
        expect(isInboxPushKind(kind)).toBe(true);
      }
    expect(isInboxPushKind('JOIN_REJECTED')).toBe(false);
  });

  it('maps activity, social, and governance channels exhaustively', () => {
    expect(pushChannelForKind('COMMENT_ADDED')).toBe('ledger-activity');
    expect(pushChannelForKind('LEDGER_INVITE')).toBe('ledger-social');
    expect(pushChannelForKind('ROLE_CHANGED')).toBe('ledger-governance');
  });

  it('formats item activity without leaking control characters', () => {
    const rendered = renderItemAddedPush({
      locale: 'ko',
      ledgerTitle: '가족\n가계부',
      categoryLabel: '식비\u0000',
      amountMinor: 12_300,
      currency: 'KRW',
    });
    expect(rendered.title).toContain('가족 가계부');
    expect(rendered.body).toContain('₩12,300');
    expect(/[\u0000-\u001f\u007f]/.test(rendered.body)).toBe(false);
  });
});
