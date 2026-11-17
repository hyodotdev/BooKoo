import {
  addDaysToDayKey,
  addMonthsToDayKey,
  addMonthsToMonthKey,
  calendarKeyToDayKey,
  calendarKeyToMonthKey,
  dayKeyDifference,
  dayKeyRangeOfPeriod,
  dayKeyParts,
  dayKeyRange,
  dayKeyToCalendarKey,
  dayKeyToEpochMs,
  dayKeyToISO,
  dayKeyToLocalNoon,
  dayOfWeek,
  daysInMonth,
  DEFAULT_WEEK_STARTS_ON,
  endOfDayMs,
  endOfMonthMs,
  FALLBACK_TIME_ZONE,
  isoToDayKey,
  isValidDayKey,
  isValidMonthKey,
  isValidTimeZone,
  makeDayKey,
  monthDayKeyBounds,
  monthKeyOfDayKey,
  monthKeyToCalendarKey,
  monthKeyToISO,
  offsetMinutesAt,
  startOfDayMs,
  startOfMonthMs,
  startOfWeekDayKey,
  timeZoneOffsetMs,
  toDayKey,
  toMonthKey,
  wallClockToEpochMs,
  zonedFields,
} from '@shared/date';

const SEOUL = 'Asia/Seoul';
const NEW_YORK = 'America/New_York';
const LOS_ANGELES = 'America/Los_Angeles';
const UTC = 'UTC';
/** Half-hour offset, southern-hemisphere DST — the awkward one. */
const LORD_HOWE = 'Australia/Lord_Howe';

const ms = (iso: string): number => Date.parse(iso);

const HOUR = 3_600_000;

describe('the timezone rule', () => {
  it('buckets one instant differently in two zones — which is the whole point', () => {
    // 2026-09-01 00:30 KST is still 2026-08-31 08:30 in Los Angeles.
    const occurredAt = ms('2026-08-31T15:30:00Z');

    expect(toDayKey(occurredAt, SEOUL)).toBe(20260901);
    expect(toMonthKey(occurredAt, SEOUL)).toBe(202609);

    expect(toDayKey(occurredAt, LOS_ANGELES)).toBe(20260831);
    expect(toMonthKey(occurredAt, LOS_ANGELES)).toBe(202608);
  });

  it('is stable across a year boundary', () => {
    const occurredAt = ms('2026-12-31T15:30:00Z'); // 2027-01-01 00:30 KST

    expect(toDayKey(occurredAt, SEOUL)).toBe(20270101);
    expect(toMonthKey(occurredAt, SEOUL)).toBe(202701);
    expect(toDayKey(occurredAt, UTC)).toBe(20261231);
    expect(toMonthKey(occurredAt, UTC)).toBe(202612);
  });

  it('lands the last second of a month in that month', () => {
    expect(toDayKey(ms('2026-08-31T14:59:59.999Z'), SEOUL)).toBe(20260831);
    expect(toMonthKey(ms('2026-08-31T14:59:59.999Z'), SEOUL)).toBe(202608);
    expect(toDayKey(ms('2026-08-31T15:00:00.000Z'), SEOUL)).toBe(20260901);
    expect(toMonthKey(ms('2026-08-31T15:00:00.000Z'), SEOUL)).toBe(202609);
  });

  it('agrees with itself: monthKeyOfDayKey === toMonthKey', () => {
    for (const iso of [
      '2026-01-01T00:00:00Z',
      '2026-02-28T23:59:59Z',
      '2026-08-31T15:30:00Z',
      '2026-12-31T23:59:59Z',
    ]) {
      const at = ms(iso);

      for (const zone of [SEOUL, NEW_YORK, UTC]) {
        expect(monthKeyOfDayKey(toDayKey(at, zone))).toBe(toMonthKey(at, zone));
      }
    }
  });

  it('reports the zone offset, DST included', () => {
    expect(timeZoneOffsetMs(ms('2026-01-15T00:00:00Z'), SEOUL)).toBe(9 * HOUR);
    expect(timeZoneOffsetMs(ms('2026-01-15T00:00:00Z'), NEW_YORK)).toBe(
      -5 * HOUR,
    );
    expect(timeZoneOffsetMs(ms('2026-07-15T00:00:00Z'), NEW_YORK)).toBe(
      -4 * HOUR,
    );
    expect(timeZoneOffsetMs(ms('2026-07-15T00:00:00Z'), UTC)).toBe(0);
    expect(offsetMinutesAt(ms('2026-01-15T00:00:00Z'), SEOUL)).toBe(540);
    expect(offsetMinutesAt(ms('2026-01-15T00:00:00Z'), NEW_YORK)).toBe(-300);
    expect(offsetMinutesAt(ms('2026-07-15T00:00:00Z'), NEW_YORK)).toBe(-240);
    expect(offsetMinutesAt(ms('2026-01-15T00:00:00Z'), 'Asia/Kathmandu')).toBe(345);
  });

  it('validates a zone instead of throwing deep in a mutation', () => {
    expect(isValidTimeZone(SEOUL)).toBe(true);
    expect(isValidTimeZone(FALLBACK_TIME_ZONE)).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('reads the wall clock, not the UTC clock', () => {
    expect(zonedFields(ms('2026-08-24T01:00:00Z'), SEOUL)).toEqual({
      year: 2026,
      month: 8,
      day: 24,
      hour: 10,
      minute: 0,
      second: 0,
    });
  });
});

describe('DST — spring forward (America/New_York, 2026-03-08)', () => {
  const DAY = 20260308;

  it('keeps both sides of the 02:00 -> 03:00 jump on the same day', () => {
    expect(toDayKey(ms('2026-03-08T06:59:00Z'), NEW_YORK)).toBe(DAY); // 01:59 EST
    expect(toDayKey(ms('2026-03-08T07:00:00Z'), NEW_YORK)).toBe(DAY); // 03:00 EDT
  });

  it('starts the day at local midnight in the PRE-transition offset', () => {
    expect(startOfDayMs(DAY, NEW_YORK)).toBe(ms('2026-03-08T05:00:00Z'));
  });

  it('makes the day 23 hours long', () => {
    const length = endOfDayMs(DAY, NEW_YORK) + 1 - startOfDayMs(DAY, NEW_YORK);

    expect(length).toBe(23 * HOUR);
  });

  it('anchors a date-only entry at local noon, so the gap cannot move the day', () => {
    const at = wallClockToEpochMs(2026, 3, 8, NEW_YORK);

    expect(at).toBe(ms('2026-03-08T16:00:00Z')); // 12:00 EDT
    expect(toDayKey(at, NEW_YORK)).toBe(DAY);
  });

  it('resolves a wall clock inside the gap to the first instant after it', () => {
    // 02:30 never happened on this day.
    const at = wallClockToEpochMs(2026, 3, 8, NEW_YORK, 2, 30);

    expect(at).toBe(ms('2026-03-08T07:30:00Z')); // 03:30 EDT
    expect(toDayKey(at, NEW_YORK)).toBe(DAY);
  });
});

describe('DST — fall back (America/New_York, 2026-11-01)', () => {
  const DAY = 20261101;

  it('makes the day 25 hours long', () => {
    const length = endOfDayMs(DAY, NEW_YORK) + 1 - startOfDayMs(DAY, NEW_YORK);

    expect(length).toBe(25 * HOUR);
  });

  it('starts and ends the day on the right instants', () => {
    expect(startOfDayMs(DAY, NEW_YORK)).toBe(ms('2026-11-01T04:00:00Z'));
    expect(endOfDayMs(DAY, NEW_YORK)).toBe(ms('2026-11-02T04:59:59.999Z'));
  });

  it('keeps both passes of the repeated 01:30 on the same day', () => {
    expect(toDayKey(ms('2026-11-01T05:30:00Z'), NEW_YORK)).toBe(DAY); // 01:30 EDT
    expect(toDayKey(ms('2026-11-01T06:30:00Z'), NEW_YORK)).toBe(DAY); // 01:30 EST
  });

  it('resolves an ambiguous wall clock to the FIRST occurrence, deterministically', () => {
    const at = wallClockToEpochMs(2026, 11, 1, NEW_YORK, 1, 30);

    expect(at).toBe(ms('2026-11-01T05:30:00Z'));
    expect(wallClockToEpochMs(2026, 11, 1, NEW_YORK, 1, 30)).toBe(at);
  });
});

describe('DST — half-hour offsets (Australia/Lord_Howe)', () => {
  it('handles a 30-minute transition without moving the day', () => {
    const dayKey = 20261004; // +10:30 -> +11:00 at 02:00 local

    expect(startOfDayMs(dayKey, LORD_HOWE)).toBe(ms('2026-10-03T13:30:00Z'));

    const length =
      endOfDayMs(dayKey, LORD_HOWE) + 1 - startOfDayMs(dayKey, LORD_HOWE);

    expect(length).toBe(23.5 * HOUR);
    expect(toDayKey(dayKeyToEpochMs(dayKey, LORD_HOWE), LORD_HOWE)).toBe(
      dayKey,
    );
  });
});

describe('day boundaries round-trip in every zone', () => {
  const zones = [
    SEOUL,
    NEW_YORK,
    LOS_ANGELES,
    UTC,
    LORD_HOWE,
    'Asia/Kathmandu',
  ];

  it('startOfDayMs and endOfDayMs both land inside the day', () => {
    for (const zone of zones) {
      for (const dayKey of [20260101, 20260308, 20260629, 20261101, 20261231]) {
        expect(toDayKey(startOfDayMs(dayKey, zone), zone)).toBe(dayKey);
        expect(toDayKey(endOfDayMs(dayKey, zone), zone)).toBe(dayKey);
        expect(toDayKey(startOfDayMs(dayKey, zone) - 1, zone)).toBe(
          addDaysToDayKey(dayKey, -1),
        );
        expect(toDayKey(endOfDayMs(dayKey, zone) + 1, zone)).toBe(
          addDaysToDayKey(dayKey, 1),
        );
      }
    }
  });

  it('month boundaries line up with the first and last day', () => {
    for (const zone of zones) {
      for (const monthKey of [202601, 202602, 202603, 202611, 202612]) {
        const {first, last} = monthDayKeyBounds(monthKey);

        expect(startOfMonthMs(monthKey, zone)).toBe(startOfDayMs(first, zone));
        expect(endOfMonthMs(monthKey, zone)).toBe(endOfDayMs(last, zone));
        expect(toMonthKey(startOfMonthMs(monthKey, zone), zone)).toBe(monthKey);
        expect(toMonthKey(endOfMonthMs(monthKey, zone), zone)).toBe(monthKey);
      }
    }
  });
});

describe('key encoding', () => {
  it('splits and rebuilds', () => {
    expect(dayKeyParts(20260824)).toEqual({year: 2026, month: 8, day: 24});
    expect(makeDayKey(2026, 8, 24)).toBe(20260824);
    expect(monthKeyOfDayKey(20260824)).toBe(202608);
  });

  it('sorts as a number, which is why it is a number', () => {
    const keys = [20261231, 20260101, 20260901, 20250101];

    expect([...keys].sort((a, b) => a - b)).toEqual([
      20250101, 20260101, 20260901, 20261231,
    ]);
  });

  it('converts to and from ISO', () => {
    expect(dayKeyToISO(20260824)).toBe('2026-08-24');
    expect(dayKeyToISO(20260101)).toBe('2026-01-01');
    expect(monthKeyToISO(202608)).toBe('2026-08');
    expect(isoToDayKey('2026-08-24')).toBe(20260824);
    expect(isoToDayKey('2026-02-30')).toBeUndefined();
    expect(isoToDayKey('20260824')).toBeUndefined();
    expect(isoToDayKey('nope')).toBeUndefined();
  });

  it('converts the calendar component keys in both directions', () => {
    expect(dayKeyToCalendarKey(20260824)).toBe('2026-08-24');
    expect(calendarKeyToDayKey('2026-08-24')).toBe(20260824);
    expect(monthKeyToCalendarKey(202608)).toBe('2026-08');
    expect(calendarKeyToMonthKey('2026-08')).toBe(202608);

    expect(() => dayKeyToCalendarKey(20260230)).toThrow(RangeError);
    expect(() => calendarKeyToDayKey('2026-02-30')).toThrow(RangeError);
    expect(() => monthKeyToCalendarKey(202613)).toThrow(RangeError);
    expect(() => calendarKeyToMonthKey('2026-13')).toThrow(RangeError);
    expect(() => calendarKeyToMonthKey('202608')).toThrow(RangeError);
  });

  it('validates', () => {
    expect(isValidDayKey(20260824)).toBe(true);
    expect(isValidDayKey(20260229)).toBe(false); // 2026 is not a leap year
    expect(isValidDayKey(20240229)).toBe(true);
    expect(isValidDayKey(20261301)).toBe(false);
    expect(isValidDayKey(20260832)).toBe(false);
    expect(isValidDayKey(20260800)).toBe(false);
    expect(isValidDayKey(2026.5)).toBe(false);

    expect(isValidMonthKey(202608)).toBe(true);
    expect(isValidMonthKey(202613)).toBe(false);
    expect(isValidMonthKey(202600)).toBe(false);
  });

  it('knows how long a month is', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('calendar arithmetic', () => {
  it('preserves the encoded day at a DST-safe local time', () => {
    const date = dayKeyToLocalNoon(20260829);

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(29);
    expect(date.getHours()).toBe(12);
  });

  it('crosses a month boundary', () => {
    expect(addDaysToDayKey(20260831, 1)).toBe(20260901);
    expect(addDaysToDayKey(20260901, -1)).toBe(20260831);
    expect(addDaysToDayKey(20260228, 1)).toBe(20260301);
    expect(addDaysToDayKey(20240228, 1)).toBe(20240229);
    expect(addDaysToDayKey(20240229, 1)).toBe(20240301);
  });

  it('crosses a year boundary', () => {
    expect(addDaysToDayKey(20261231, 1)).toBe(20270101);
    expect(addDaysToDayKey(20270101, -1)).toBe(20261231);
    expect(addDaysToDayKey(20261231, 366)).toBe(20280101);
  });

  it('adds months to a monthKey without producing month 13', () => {
    expect(addMonthsToMonthKey(202612, 1)).toBe(202701);
    expect(addMonthsToMonthKey(202601, -1)).toBe(202512);
    expect(addMonthsToMonthKey(202608, 12)).toBe(202708);
    expect(addMonthsToMonthKey(202608, -12)).toBe(202508);
    expect(addMonthsToMonthKey(202601, -13)).toBe(202412);
  });

  it('clamps a month add to the target month s last day', () => {
    expect(addMonthsToDayKey(20260131, 1)).toBe(20260228);
    expect(addMonthsToDayKey(20240131, 1)).toBe(20240229);
    expect(addMonthsToDayKey(20261231, 1)).toBe(20270131);
  });

  it('measures a difference in whole days across boundaries', () => {
    expect(dayKeyDifference(20260101, 20260101)).toBe(0);
    expect(dayKeyDifference(20261231, 20270101)).toBe(1);
    expect(dayKeyDifference(20270101, 20261231)).toBe(-1);
    expect(dayKeyDifference(20260101, 20270101)).toBe(365);
  });

  it('enumerates an inclusive range', () => {
    expect(dayKeyRange(20260830, 20260902)).toEqual([
      20260830, 20260831, 20260901, 20260902,
    ]);
    expect(dayKeyRange(20260101, 20260101)).toEqual([20260101]);
    expect(dayKeyRange(20260102, 20260101)).toEqual([]);
  });

  it('builds calendar and salary-cycle period bounds', () => {
    expect(dayKeyRangeOfPeriod(202608, 1)).toEqual({
      from: 20260801,
      to: 20260831,
    });
    expect(dayKeyRangeOfPeriod(202608, 25)).toEqual({
      from: 20260725,
      to: 20260824,
    });
    expect(dayKeyRangeOfPeriod(202601, 28)).toEqual({
      from: 20251228,
      to: 20260127,
    });
    expect(() => dayKeyRangeOfPeriod(202613, 1)).toThrow(RangeError);
    expect(() => dayKeyRangeOfPeriod(202608, 0)).toThrow(RangeError);
    expect(() => dayKeyRangeOfPeriod(202608, 29)).toThrow(RangeError);
  });

  it('starts a week from the LEDGER s weekStartsOn, not a global locale', () => {
    // 2026-08-24 is a Monday.
    expect(dayOfWeek(20260824)).toBe(1);
    expect(startOfWeekDayKey(20260824, 0)).toBe(20260823);
    expect(startOfWeekDayKey(20260824, 1)).toBe(20260824);
    expect(startOfWeekDayKey(20260824, 6)).toBe(20260822);
    expect(startOfWeekDayKey(20260824)).toBe(
      startOfWeekDayKey(20260824, DEFAULT_WEEK_STARTS_ON),
    );
  });

  it('starts a week across a month boundary', () => {
    // 2026-09-01 is a Tuesday; the Sunday-start week began 2026-08-30.
    expect(startOfWeekDayKey(20260901, 0)).toBe(20260830);
  });
});
