import {
  addDaysToDayKey,
  addMonthsToMonthKey,
  dayKeyRange,
  dayOfWeek,
  makeDayKey,
  monthDayKeyBounds,
  type DayKey,
  type MonthKey,
  type WeekDay,
} from '@shared/date';

export interface CalendarCell {
  readonly dayKey: DayKey;
  readonly day: number;
  readonly inMonth: boolean;
}

export const calendarWindow = (
  monthKey: MonthKey,
  weekStartsOn: WeekDay,
): readonly CalendarCell[] => {
  const {first: firstOfMonth, last: lastOfMonth} = monthDayKeyBounds(monthKey);
  const before = (dayOfWeek(firstOfMonth) - weekStartsOn + 7) % 7;
  const first = addDaysToDayKey(firstOfMonth, -before);
  const after = 41 - before - (lastOfMonth % 100) + 1;
  const last = addDaysToDayKey(lastOfMonth, after);

  return dayKeyRange(first, last).map((dayKey) => ({
    dayKey,
    day: dayKey % 100,
    inMonth: Math.floor(dayKey / 100) === monthKey,
  }));
};

export const threeMonthWindow = (
  monthKey: MonthKey,
  weekStartsOn: WeekDay,
): {readonly fromDayKey: DayKey; readonly toDayKey: DayKey} => {
  const previous = calendarWindow(
    addMonthsToMonthKey(monthKey, -1),
    weekStartsOn,
  );
  const next = calendarWindow(addMonthsToMonthKey(monthKey, 1), weekStartsOn);
  return {
    fromDayKey: previous[0]?.dayKey ?? makeDayKey(1970, 1, 1),
    toDayKey: next.at(-1)?.dayKey ?? makeDayKey(1970, 1, 1),
  };
};

export const selectedDayForMonth = (
  monthKey: MonthKey,
  today: DayKey,
): DayKey =>
  monthKey === Math.floor(today / 100)
    ? today
    : monthDayKeyBounds(monthKey).first;

export const monthLabel = (monthKey: MonthKey): string => {
  const year = Math.floor(monthKey / 100);
  const month = monthKey % 100;
  return `${year}.${String(month).padStart(2, '0')}`;
};

export const toCalendarDayKey = (dayKey: DayKey): string => {
  const value = String(dayKey).padStart(8, '0');

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};

export const fromCalendarDayKey = (key: string): DayKey =>
  Number(key.replaceAll('-', '')) as DayKey;

export const toCalendarMonthKey = (monthKey: MonthKey): string => {
  const value = String(monthKey).padStart(6, '0');

  return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
};

export const fromCalendarMonthKey = (key: string): MonthKey =>
  Number(key.slice(0, 7).replace('-', '')) as MonthKey;
