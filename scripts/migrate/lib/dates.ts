import {offsetMinutesAt, toDayKey, toMonthKey} from '../../../shared/date';
import {pushIdToMillis} from './keys';

export {offsetMinutesAt as offsetOf, toDayKey, toMonthKey};

export type LegacyDateSource =
  'SELECTED_DATE' | 'CREATED' | 'UPDATED' | 'PUSH_ID';

export interface ResolvedDate {
  occurredAt: number;
  source: LegacyDateSource;
  selectedDate?: string;
  writerOffsetMinutes: number;
  anomalies: ('SELECTED_DATE_LOST' | 'NON_KST_OFFSET')[];
}

const finiteMillis = (value: unknown): number | undefined => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0
    ? number
    : undefined;
};

const OFFSET = /([+-])(\d{2}):(\d{2})$/;
export const writtenOffsetMinutes = (value: string): number | undefined => {
  const match = OFFSET.exec(value);
  if (match === null) return undefined;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
};

export function resolveOccurredAt(
  itemKey: string,
  item: Record<string, unknown>,
): ResolvedDate {
  const anomalies: ResolvedDate['anomalies'] = [];
  let writerOffsetMinutes: number | undefined;
  for (const field of ['selectedDate', 'created', 'updated'] as const) {
    const value = item[field];
    if (typeof value !== 'string') continue;
    writerOffsetMinutes = writtenOffsetMinutes(value);
    if (writerOffsetMinutes !== undefined) break;
  }
  writerOffsetMinutes ??= 540;
  if (writerOffsetMinutes !== 540) anomalies.push('NON_KST_OFFSET');

  for (const [field, source] of [
    ['selectedDate', 'SELECTED_DATE'],
    ['created', 'CREATED'],
    ['updated', 'UPDATED'],
  ] as const) {
    const value = item[field];
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed))
        return {
          occurredAt: parsed,
          source,
          selectedDate:
            typeof item.selectedDate === 'string'
              ? item.selectedDate
              : undefined,
          writerOffsetMinutes,
          anomalies,
        };
    } else if (
      field === 'selectedDate' &&
      value !== undefined &&
      value !== null
    ) {
      anomalies.push('SELECTED_DATE_LOST');
    }
  }
  const created = finiteMillis(item.created);
  if (created !== undefined)
    return {
      occurredAt: created,
      source: 'CREATED',
      writerOffsetMinutes,
      anomalies,
    };
  const updated = finiteMillis(item.updated);
  if (updated !== undefined)
    return {
      occurredAt: updated,
      source: 'UPDATED',
      writerOffsetMinutes,
      anomalies,
    };
  const pushed = pushIdToMillis(itemKey);
  if (pushed !== undefined) {
    anomalies.push('SELECTED_DATE_LOST');
    return {
      occurredAt: pushed,
      source: 'PUSH_ID',
      writerOffsetMinutes,
      anomalies,
    };
  }
  throw new Error('item has no recoverable date');
}
