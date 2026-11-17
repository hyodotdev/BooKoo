/**
 * Day/month bucket keys and the repo-wide timezone rule, implemented ONCE.
 *
 * PURE TypeScript — see `shared/AGENTS.md`. date-fns only; moment is gone and
 * must not come back.
 *
 * Design source: `.notes/design/money-categories-i18n.md` §4.3.
 *
 * ============================================================================
 * THE RULE
 * ============================================================================
 * A ledger owns a fixed IANA timezone. Every date bucket is computed in THAT
 * timezone, on the server. Devices never decide what day or month an entry
 * belongs to.
 *
 * This is not a preference. A shared ledger's month total must be the same
 * number for every member. If `monthKey` came from each device's zone, an entry
 * made at 2026-08-31 23:30 KST would be August for the member in Seoul and July
 * for the member in Los Angeles — and since `monthlyRollups` is keyed by
 * `monthKey`, the two members would be reading DIFFERENT ROWS that can never be
 * reconciled. The rollup would be correct for nobody.
 *
 * `occurredAt` (epoch ms, UTC) is the truth. `dayKey` / `monthKey` are derived
 * and stored by the mutation. The client computes them with these same
 * functions for optimistic updates, so the optimistic value and the server
 * value agree by construction.
 *
 * ============================================================================
 * WHY Intl AND NOT `@date-fns/tz`
 * ============================================================================
 * `@date-fns/tz`'s `TZDate` is itself backed by `Intl.DateTimeFormat`'s
 * `timeZone` support. It is not a dependency of this repo, so the two functions
 * we need from it are implemented here directly against the same primitive.
 * `Intl.DateTimeFormat` with `timeZone` is present in Hermes on both platforms
 * and in the Convex V8 runtime (full ICU); `intlCaps().timeZone` is the probe
 * that lets the client degrade to "wait for the server" rather than be wrong.
 *
 * Everything that is pure CALENDAR arithmetic (add days, add months, week
 * boundaries) goes through date-fns, anchored at LOCAL NOON so no DST
 * transition can shift the result by a day.
 */

import {addDays, addMonths, startOfWeek} from 'date-fns';

/** `0` = Sunday … `6` = Saturday, matching date-fns' `weekStartsOn`. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Wall-clock day in a ledger's timezone as an integer `YYYYMMDD` (20260824).
 * An integer, not a string: it sorts correctly as a number, indexes as a
 * number, and a range scan over a month is `>= 20260801 && <= 20260831`.
 */
export type DayKey = number;

/** Wall-clock month as an integer `YYYYMM` (202608). */
export type MonthKey = number;

/**
 * Last-resort zone when nothing else is known. Deliberately UTC and not
 * `Asia/Seoul`: a ledger's timezone is a required field set from the creator's
 * device, and a silent 9-hour default is a bug that only shows up at month end.
 */
export const FALLBACK_TIME_ZONE = 'UTC';

/**
 * Ledger-wide, defaulted from the creator's `getCalendars()[0].firstWeekday`.
 * The legacy calendar hard-coded `weekStart={0}` while `moment.startOf('week')`
 * was locale-global — two sources of truth that disagreed.
 */
export const DEFAULT_WEEK_STARTS_ON: WeekDay = 0;

// ---------------------------------------------------------------------------
// Zoned wall-clock fields
// ---------------------------------------------------------------------------

interface ZonedFields {
  year: number;
  /** 1-based, like the key format — NOT the 0-based `Date#getMonth`. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * One `Intl.DateTimeFormat` per timezone, memoized. Constructing one is
 * expensive on Hermes and this runs per row when a list is bucketed, so the
 * cache is the difference between "instant" and "janky".
 *
 * A pure memo: same input, same output, no observable effect.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

const zonedFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const hit = formatterCache.get(timeZone);

  if (hit) return hit;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `hour12: false` still yields hour "24" on some engines; `h23` does not.
    hourCycle: 'h23',
  });

  formatterCache.set(timeZone, formatter);

  return formatter;
};

/** Test-only escape hatch: forget every memoized formatter. */
export const resetTimeZoneCache = (): void => {
  formatterCache.clear();
};

/** True when the runtime accepts `timeZone` as an IANA zone. */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    zonedFormatter(timeZone).format(0);

    return true;
  } catch {
    formatterCache.delete(timeZone);

    return false;
  }
};

/** The wall-clock fields an observer in `timeZone` reads at `epochMs`. */
export const zonedFields = (epochMs: number, timeZone: string): ZonedFields => {
  const parts = zonedFormatter(timeZone).formatToParts(epochMs);
  const fields: ZonedFields = {
    year: 0,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  };

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        fields.year = Number(part.value);
        break;
      case 'month':
        fields.month = Number(part.value);
        break;
      case 'day':
        fields.day = Number(part.value);
        break;
      case 'hour':
        // Defensive: an engine that ignores `hourCycle` can emit '24' at midnight.
        fields.hour = Number(part.value) % 24;
        break;
      case 'minute':
        fields.minute = Number(part.value);
        break;
      case 'second':
        fields.second = Number(part.value);
        break;
      default:
        break;
    }
  }

  return fields;
};

/** `Date.UTC` maps years 0..99 to 1900+y; this does not. */
const utcFromFields = (fields: ZonedFields): number => {
  const date = new Date(0);

  date.setUTCFullYear(fields.year, fields.month - 1, fields.day);
  date.setUTCHours(fields.hour, fields.minute, fields.second, 0);

  return date.getTime();
};

/**
 * `zonedTime - utcTime` at `epochMs`, in ms. Positive east of Greenwich.
 * DST-aware, because it is derived from the zone's own rendering of that
 * instant rather than from a fixed offset table.
 */
export const timeZoneOffsetMs = (epochMs: number, timeZone: string): number => {
  const truncated = epochMs - (((epochMs % 1000) + 1000) % 1000);

  return utcFromFields(zonedFields(epochMs, timeZone)) - truncated;
};

/** DST-aware UTC offset at an instant, in whole minutes for `occurredOffsetMinutes`. */
export const offsetMinutesAt = (
  epochMs: number,
  timeZone: string,
): number => Math.round(timeZoneOffsetMs(epochMs, timeZone) / 60_000);

// ---------------------------------------------------------------------------
// The keys
// ---------------------------------------------------------------------------

/** Wall-clock day in `timeZone`, as an integer `YYYYMMDD`. */
export const toDayKey = (occurredAtMs: number, timeZone: string): DayKey => {
  const fields = zonedFields(occurredAtMs, timeZone);

  return fields.year * 10000 + fields.month * 100 + fields.day;
};

/** Wall-clock month in `timeZone`, as an integer `YYYYMM`. */
export const toMonthKey = (occurredAtMs: number, timeZone: string): MonthKey =>
  Math.floor(toDayKey(occurredAtMs, timeZone) / 100);

/** `20260824 -> 202608`. Cheaper than re-deriving from the timestamp. */
export const monthKeyOfDayKey = (dayKey: DayKey): MonthKey =>
  Math.floor(dayKey / 100);

export interface DayKeyParts {
  year: number;
  /** 1-based. */
  month: number;
  day: number;
}

export const dayKeyParts = (dayKey: DayKey): DayKeyParts => ({
  year: Math.floor(dayKey / 10000),
  month: Math.floor(dayKey / 100) % 100,
  day: dayKey % 100,
});

export const makeDayKey = (year: number, month: number, day: number): DayKey =>
  year * 10000 + month * 100 + day;

export const makeMonthKey = (year: number, month: number): MonthKey =>
  year * 100 + month;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** `20260824 -> '2026-08-24'`. For URLs, CSV export and debug output. */
export const dayKeyToISO = (dayKey: DayKey): string => {
  const {year, month, day} = dayKeyParts(dayKey);

  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
};

/** `'2026-08-24' -> 20260824`. Returns `undefined` for anything malformed. */
export const isoToDayKey = (iso: string): DayKey | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  if (!match) return undefined;

  const dayKey = makeDayKey(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );

  return isValidDayKey(dayKey) ? dayKey : undefined;
};

/** `202608 -> '2026-08'`. */
export const monthKeyToISO = (monthKey: MonthKey): string => {
  const year = Math.floor(monthKey / 100);
  const month = monthKey % 100;

  return `${String(year).padStart(4, '0')}-${pad2(month)}`;
};

/** Structural check: shape, month range, and that the day exists in that month. */
export const isValidDayKey = (dayKey: DayKey): boolean => {
  if (!Number.isInteger(dayKey) || dayKey < 10101 || dayKey > 99991231) {
    return false;
  }

  const {year, month, day} = dayKeyParts(dayKey);

  if (month < 1 || month > 12 || day < 1) return false;

  return day <= daysInMonth(year, month);
};

export const isValidMonthKey = (monthKey: MonthKey): boolean => {
  if (!Number.isInteger(monthKey) || monthKey < 101 || monthKey > 999912) {
    return false;
  }

  const month = monthKey % 100;

  return month >= 1 && month <= 12;
};

/** Days in a 1-based month. Proleptic Gregorian, same rule every runtime uses. */
export const daysInMonth = (year: number, month: number): number => {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

    return leap ? 29 : 28;
  }

  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
};

// ---------------------------------------------------------------------------
// Calendar component codecs
// ---------------------------------------------------------------------------

/** Integer database key -> the calendar component's strict `YYYY-MM-DD`. */
export const dayKeyToCalendarKey = (dayKey: DayKey): string => {
  if (!isValidDayKey(dayKey)) throw new RangeError(`Invalid dayKey: ${dayKey}`);

  return dayKeyToISO(dayKey);
};

/** Calendar component `YYYY-MM-DD` -> integer database key; malformed input throws. */
export const calendarKeyToDayKey = (calendarKey: string): DayKey => {
  const dayKey = isoToDayKey(calendarKey);

  if (dayKey === undefined) {
    throw new RangeError(`Invalid calendar day key: ${calendarKey}`);
  }

  return dayKey;
};

/** Integer database key -> the calendar component's strict `YYYY-MM`. */
export const monthKeyToCalendarKey = (monthKey: MonthKey): string => {
  if (!isValidMonthKey(monthKey)) {
    throw new RangeError(`Invalid monthKey: ${monthKey}`);
  }

  return monthKeyToISO(monthKey);
};

/** Calendar component `YYYY-MM` -> integer database key; malformed input throws. */
export const calendarKeyToMonthKey = (calendarKey: string): MonthKey => {
  const match = /^(\d{4})-(\d{2})$/.exec(calendarKey);
  const monthKey = match
    ? makeMonthKey(Number(match[1]), Number(match[2]))
    : Number.NaN;

  if (!isValidMonthKey(monthKey)) {
    throw new RangeError(`Invalid calendar month key: ${calendarKey}`);
  }

  return monthKey;
};

// ---------------------------------------------------------------------------
// Wall clock -> epoch
// ---------------------------------------------------------------------------

/**
 * A user-picked wall-clock date (+ optional time) in `timeZone`, as epoch ms.
 *
 * The default time is 12:00 LOCAL, never 00:00. A DST spring-forward that skips
 * midnight (Brazil, Chile, Cuba, Iran, Lebanon…) would otherwise land the entry
 * on the previous day — the exact class of bug this whole module exists to
 * prevent.
 *
 * The two-pass offset correction is the standard algorithm: guess the instant
 * as if the zone were UTC, measure the zone's real offset at that guess, apply
 * it, then re-measure once in case the correction crossed a transition.
 */
export const wallClockToEpochMs = (
  year: number,
  month: number,
  day: number,
  timeZone: string,
  hour = 12,
  minute = 0,
  second = 0,
): number => {
  const asUtc = utcFromFields({year, month, day, hour, minute, second});
  const firstOffset = timeZoneOffsetMs(asUtc, timeZone);
  const firstGuess = asUtc - firstOffset;
  const secondOffset = timeZoneOffsetMs(firstGuess, timeZone);

  if (secondOffset === firstOffset) return firstGuess;

  const corrected = asUtc - secondOffset;
  const rendered = zonedFields(corrected, timeZone);

  // The correction crossed a transition. If it round-trips, it is the answer.
  // If it does NOT, the requested wall clock never existed (a spring-forward
  // gap), and the conventional answer is the first instant after the gap —
  // which is exactly `firstGuess`.
  return rendered.year === year &&
    rendered.month === month &&
    rendered.day === day &&
    rendered.hour === hour &&
    rendered.minute === minute
    ? corrected
    : firstGuess;
};

/** Epoch ms of a `dayKey`'s noon in `timeZone`. The DST-safe anchor for that day. */
export const dayKeyToEpochMs = (dayKey: DayKey, timeZone: string): number => {
  const {year, month, day} = dayKeyParts(dayKey);

  return wallClockToEpochMs(year, month, day, timeZone);
};

/**
 * First instant of `dayKey` in `timeZone`.
 *
 * Derived by walking back from noon rather than by asking for 00:00 directly:
 * on a spring-forward day midnight may not exist, and the first instant of the
 * day is then 01:00. Anchoring at noon and stepping down to the previous day's
 * end + 1 ms is correct in every zone, including the half-hour ones.
 */
export const startOfDayMs = (dayKey: DayKey, timeZone: string): number => {
  const {year, month, day} = dayKeyParts(dayKey);
  let candidate = wallClockToEpochMs(year, month, day, timeZone, 0, 0, 0);
  // A transition can leave the candidate a few minutes off the true boundary
  // (or, in a spring-forward gap, on the hour after it). 180 minutes of slack
  // covers every offset change any IANA zone has ever made in one step.
  const STEP_MS = 60_000;
  const MAX_STEPS = 180;

  for (
    let step = 0;
    step < MAX_STEPS && toDayKey(candidate, timeZone) < dayKey;
    step++
  ) {
    candidate += STEP_MS;
  }

  for (
    let step = 0;
    step < MAX_STEPS && toDayKey(candidate - STEP_MS, timeZone) === dayKey;
    step++
  ) {
    candidate -= STEP_MS;
  }

  return candidate;
};

/** Last instant (inclusive, ms resolution) of `dayKey` in `timeZone`. */
export const endOfDayMs = (dayKey: DayKey, timeZone: string): number =>
  startOfDayMs(addDaysToDayKey(dayKey, 1), timeZone) - 1;

/** First instant of `monthKey` in `timeZone`. */
export const startOfMonthMs = (monthKey: MonthKey, timeZone: string): number =>
  startOfDayMs(
    makeDayKey(Math.floor(monthKey / 100), monthKey % 100, 1),
    timeZone,
  );

/** Last instant (inclusive) of `monthKey` in `timeZone`. */
export const endOfMonthMs = (monthKey: MonthKey, timeZone: string): number =>
  startOfMonthMs(addMonthsToMonthKey(monthKey, 1), timeZone) - 1;

// ---------------------------------------------------------------------------
// Calendar arithmetic (date-fns, timezone-free)
// ---------------------------------------------------------------------------

/**
 * Anchoring at LOCAL noon is what makes date-fns safe here. `addDays` works in
 * the runtime's local zone; from noon, no DST shift of ±1h (or Lord Howe's
 * ±30m) can move the calendar day, so the arithmetic is the pure Gregorian
 * answer regardless of what zone the device or the CI box is in.
 */
/**
 * A device-local noon carrying only the calendar fields encoded by `dayKey`.
 *
 * Use this for localized labels and calendar arithmetic, never for ledger
 * timestamps. Noon avoids DST midnight edges while preserving the shared
 * ledger's wall-clock day on every device.
 */
export const dayKeyToLocalNoon = (dayKey: DayKey): Date => {
  const {year, month, day} = dayKeyParts(dayKey);
  const date = new Date(2000, 0, 1, 12, 0, 0, 0);

  date.setFullYear(year, month - 1, day);

  return date;
};

/**
 * A device-local `Date` carrying the wall clock the LEDGER saw at `occurredAt`.
 *
 * `dayKey` is derived server-side in `ledgers.timeZone`, because a shared
 * ledger needs one day boundary for everyone — the rollups are keyed by it and
 * cannot be recomputed per viewer. Rendering `occurredAt` with a device-local
 * formatter therefore disagrees with the day the entry is filed under whenever
 * the reader is not in the ledger's zone: an entry in the 16th's bucket shows
 * as the 17th to a reader nine hours east.
 *
 * `occurredOffsetMinutes` is the ledger's UTC offset at that instant, stored on
 * the row precisely so a page of entries can render its wall clock without an
 * IANA lookup each (`schema/ledgerItems.ts`). Shifting by it puts the ledger's
 * wall clock in the UTC fields, which are then copied onto local fields the way
 * `dayKeyToLocalNoon` does — so no device offset arithmetic is involved.
 *
 * One bounded caveat, stated rather than hidden: `setHours` lands on a local
 * wall clock, and a reader whose OWN zone skips that hour for DST has it
 * normalized forward by the gap. The calendar day — the half that has to agree
 * with `dayKey` — is unaffected, because every real transition happens inside a
 * day rather than across its boundary; only the rendered hour moves, for one
 * hour a year, for a reader not in the ledger's zone. Fixing that costs an IANA
 * lookup per row, which is the thing `occurredOffsetMinutes` exists to avoid.
 */
export const occurredAtToLocalWallClock = (
  occurredAt: number,
  occurredOffsetMinutes: number,
): Date => {
  const shifted = new Date(occurredAt + occurredOffsetMinutes * 60_000);
  const date = new Date(2000, 0, 1, 12, 0, 0, 0);

  date.setFullYear(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  date.setHours(shifted.getUTCHours(), shifted.getUTCMinutes(), 0, 0);

  return date;
};

const localDateToDayKey = (date: Date): DayKey =>
  makeDayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());

/** Calendar day arithmetic. Crosses month and year boundaries correctly. */
export const addDaysToDayKey = (dayKey: DayKey, amount: number): DayKey =>
  localDateToDayKey(addDays(dayKeyToLocalNoon(dayKey), amount));

/**
 * Calendar month arithmetic on a `monthKey`. Pure integer math — 202612 + 1 is
 * 202701, not 202613.
 */
export const addMonthsToMonthKey = (
  monthKey: MonthKey,
  amount: number,
): MonthKey => {
  const total =
    Math.floor(monthKey / 100) * 12 + ((monthKey % 100) - 1) + amount;
  const month = ((total % 12) + 12) % 12;

  return makeMonthKey(Math.floor(total / 12), month + 1);
};

/**
 * Calendar month arithmetic on a `dayKey`, clamped to the target month's last
 * day (2026-01-31 + 1 month = 2026-02-28), which is date-fns' `addMonths`
 * semantics and the only one users expect.
 */
export const addMonthsToDayKey = (dayKey: DayKey, amount: number): DayKey =>
  localDateToDayKey(addMonths(dayKeyToLocalNoon(dayKey), amount));

/** First `dayKey` of the week containing `dayKey`, per the LEDGER's `weekStartsOn`. */
export const startOfWeekDayKey = (
  dayKey: DayKey,
  weekStartsOn: WeekDay = DEFAULT_WEEK_STARTS_ON,
): DayKey =>
  localDateToDayKey(startOfWeek(dayKeyToLocalNoon(dayKey), {weekStartsOn}));

/** `0` = Sunday … `6` = Saturday. */
export const dayOfWeek = (dayKey: DayKey): WeekDay =>
  dayKeyToLocalNoon(dayKey).getDay() as WeekDay;

/** Whole days from `from` to `to`; negative when `to` precedes `from`. */
export const dayKeyDifference = (from: DayKey, to: DayKey): number =>
  Math.round(
    (dayKeyToLocalNoon(to).getTime() - dayKeyToLocalNoon(from).getTime()) /
      86_400_000,
  );

/** Inclusive `[from, to]` as day keys. Empty when `to` precedes `from`. */
export const dayKeyRange = (from: DayKey, to: DayKey): readonly DayKey[] => {
  const keys: DayKey[] = [];

  for (let key = from; key <= to; key = addDaysToDayKey(key, 1)) keys.push(key);

  return keys;
};

/** First and last `dayKey` of a month — the range scan bounds for a rollup read. */
export const monthDayKeyBounds = (
  monthKey: MonthKey,
): {first: DayKey; last: DayKey} => {
  const year = Math.floor(monthKey / 100);
  const month = monthKey % 100;

  return {
    first: makeDayKey(year, month, 1),
    last: makeDayKey(year, month, daysInMonth(year, month)),
  };
};

/**
 * Inclusive salary-cycle bounds labelled by `anchorMonthKey`.
 *
 * A start day of 25 labels August as July 25 through August 24. Day 1 is the
 * ordinary August 1 through August 31 calendar month.
 */
export const dayKeyRangeOfPeriod = (
  anchorMonthKey: MonthKey,
  periodStartDay: number,
): {from: DayKey; to: DayKey} => {
  if (!isValidMonthKey(anchorMonthKey)) {
    throw new RangeError(`Invalid anchorMonthKey: ${anchorMonthKey}`);
  }
  if (
    !Number.isInteger(periodStartDay) ||
    periodStartDay < 1 ||
    periodStartDay > 28
  ) {
    throw new RangeError(`Invalid periodStartDay: ${periodStartDay}`);
  }

  const anchorYear = Math.floor(anchorMonthKey / 100);
  const anchorMonth = anchorMonthKey % 100;

  if (periodStartDay === 1) {
    const {first, last} = monthDayKeyBounds(anchorMonthKey);

    return {from: first, to: last};
  }

  const previousMonthKey = addMonthsToMonthKey(anchorMonthKey, -1);
  const from = makeDayKey(
    Math.floor(previousMonthKey / 100),
    previousMonthKey % 100,
    periodStartDay,
  );
  const nextPeriodStart = makeDayKey(
    anchorYear,
    anchorMonth,
    periodStartDay,
  );

  return {from, to: addDaysToDayKey(nextPeriodStart, -1)};
};
