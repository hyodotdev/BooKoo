import {
  groupTimelineRows,
  TIMELINE_STICKY_HEADER_CONFIG,
  timelineDayKeys,
  timelineRouteKey,
  timelineRowKey,
  timelineRowType,
} from '../../../../src/features/ledger/screens/timeline';
import type {ItemRow} from '../../../../src/features/ledger/types';
import {MAX_TIMELINE_DAY_KEYS} from '../../../../shared/ledgerLimits';
import {addDaysToDayKey} from '../../../../shared/date';

const item = (id: string, dayKey: number, ledgerId = 'ledger-a'): ItemRow =>
  ({id, dayKey, ledgerId}) as ItemRow;

describe('timeline day sections', () => {
  it('requests only distinct displayed days across sparse years', () => {
    expect(
      timelineDayKeys([
        item('new', 20260906),
        item('same', 20260906),
        item('old', 20170101),
      ]),
    ).toEqual([20170101, 20260906]);
  });

  it('bounds sidecar reads without dropping reactively inserted entries', () => {
    const items = Array.from({length: MAX_TIMELINE_DAY_KEYS + 1}, (_, index) =>
      item(String(index), addDaysToDayKey(20260906, -index)),
    );
    const keys = timelineDayKeys(items);
    expect(keys).toHaveLength(MAX_TIMELINE_DAY_KEYS);
    expect(keys).not.toContain(items.at(-1)?.dayKey);
    expect(
      groupTimelineRows(items).rows.filter((row) => row.kind === 'ITEM'),
    ).toHaveLength(items.length);
  });

  it('creates one sticky header for each contiguous day', () => {
    const grouped = groupTimelineRows([
      item('coffee', 20260830),
      item('subway', 20260830),
      item('book', 20260829),
    ]);

    expect(grouped.stickyHeaderIndices).toEqual([0, 3]);
    expect(grouped.rows.map(timelineRowType)).toEqual([
      'DAY',
      'ITEM',
      'ITEM',
      'DAY',
      'ITEM',
    ]);
    expect(grouped.rows.map(timelineRowKey)).toEqual([
      'day:20260830',
      'coffee',
      'subway',
      'day:20260829',
      'book',
    ]);
  });

  it('keeps an empty page free of synthetic headers', () => {
    expect(groupTimelineRows([])).toEqual({
      rows: [],
      stickyHeaderIndices: [],
    });
  });

  it('hides the source cell while its date header is pinned', () => {
    expect(TIMELINE_STICKY_HEADER_CONFIG).toEqual({hideRelatedCell: true});
  });

  it('gives every ledger window a distinct React key', () => {
    const firstLedger = item('coffee', 20260830).ledgerId;
    const nextLedger = item('tea', 20260830, 'ledger-b').ledgerId;

    expect(timelineRouteKey(firstLedger)).not.toBe(
      timelineRouteKey(nextLedger),
    );
    expect(timelineRouteKey(undefined)).toBe('ledger-loading');
    expect(timelineRouteKey(null)).toBe('ledger-empty');
  });
});
