import {addDaysToDayKey, dayKeyDifference} from '../../../../shared/date';
import {
  calendarWindow,
  fromCalendarDayKey,
  selectedDayForMonth,
  threeMonthWindow,
  toCalendarDayKey,
} from '../../../../src/features/ledger/calendar';

describe('ledger calendar window', () => {
  it('always produces one stable six-week grid', () => {
    const sunday = calendarWindow(202608, 0);
    const monday = calendarWindow(202608, 1);

    expect(sunday).toHaveLength(42);
    expect(monday).toHaveLength(42);
    expect(sunday[0]?.dayKey).toBe(20260726);
    expect(monday[0]?.dayKey).toBe(20260727);
    expect(sunday.at(-1)?.dayKey).toBe(addDaysToDayKey(sunday[0]!.dayKey, 41));
  });

  it('keeps the mounted three-month query inside the 126-day server bound', () => {
    const window = threeMonthWindow(202608, 0);

    expect(dayKeyDifference(window.fromDayKey, window.toDayKey)).toBeLessThan(
      126,
    );
    expect(window.fromDayKey).toBeLessThan(20260801);
    expect(window.toDayKey).toBeGreaterThan(20260831);
  });

  it('moves selection into the displayed month without losing today', () => {
    expect(selectedDayForMonth(202608, 20260825)).toBe(20260825);
    expect(selectedDayForMonth(202609, 20260825)).toBe(20260901);
  });

  it('adapts numeric ledger days to the shared calendar key', () => {
    expect(toCalendarDayKey(20260806)).toBe('2026-08-06');
    expect(fromCalendarDayKey('2026-08-06')).toBe(20260806);
  });
});
