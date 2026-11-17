import {
  occurredAtToLocalWallClock,
  offsetMinutesAt,
  toDayKey,
} from '../../shared/date';

/**
 * `dayKey` is derived server-side in `ledgers.timeZone`, because a shared
 * ledger needs one day boundary for every member — the rollups are keyed by it
 * and cannot be recomputed per viewer. The client rendered `occurredAt` with a
 * device-local formatter, so the time shown next to an entry disagreed with the
 * day it was filed under whenever the reader was not in the ledger's zone.
 *
 * These lock the two halves agreeing: whatever `occurredAtToLocalWallClock`
 * renders must name the same calendar day as `toDayKey`, which is what the
 * list groups by.
 */

/** 2026-09-16T16:00:00Z — 01:00 on the 17th in Seoul, 16:00 on the 16th in UTC. */
const ACROSS_MIDNIGHT = Date.UTC(2026, 8, 16, 16, 0, 0);

const asDayKey = (date: Date): number =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

describe('an entry rendered beside the day it is filed under', () => {
  it.each([
    ['UTC', 'UTC'],
    ['Asia/Seoul', 'Asia/Seoul'],
    ['America/New_York', 'America/New_York'],
  ])('agrees with its dayKey for a %s ledger', (_label, timeZone) => {
    const offset = offsetMinutesAt(ACROSS_MIDNIGHT, timeZone);
    const rendered = occurredAtToLocalWallClock(ACROSS_MIDNIGHT, offset);

    expect(asDayKey(rendered)).toBe(toDayKey(ACROSS_MIDNIGHT, timeZone));
  });

  it('shows the ledger wall clock, not the instant', () => {
    // A UTC ledger: the reader must see 16:00 on the 16th, which is what the
    // entry is filed under — not 01:00 on the 17th.
    const rendered = occurredAtToLocalWallClock(ACROSS_MIDNIGHT, 0);

    expect(asDayKey(rendered)).toBe(20260916);
    expect(rendered.getHours()).toBe(16);
    expect(rendered.getMinutes()).toBe(0);
  });

  it('keeps a Seoul ledger on its own wall clock', () => {
    const rendered = occurredAtToLocalWallClock(ACROSS_MIDNIGHT, 540);

    expect(asDayKey(rendered)).toBe(20260917);
    expect(rendered.getHours()).toBe(1);
  });

  it('handles a ledger behind UTC', () => {
    // New York is -4 in September: 12:00 on the 16th.
    const rendered = occurredAtToLocalWallClock(ACROSS_MIDNIGHT, -240);

    expect(asDayKey(rendered)).toBe(20260916);
    expect(rendered.getHours()).toBe(12);
  });

  it('carries no seconds, so a formatted minute never rounds up', () => {
    const rendered = occurredAtToLocalWallClock(ACROSS_MIDNIGHT + 59_000, 0);

    expect(rendered.getSeconds()).toBe(0);
    expect(rendered.getMilliseconds()).toBe(0);
  });
});

describe('the two screens that render an entry time', () => {
  const read = (path: string): string =>
    require('fs').readFileSync(require('path').join(__dirname, path), 'utf8');

  it.each([
    ['the list row', '../../src/features/ledger/ui.tsx'],
    ['the detail screen', '../../src/features/ledger/screens/entryDetail.tsx'],
  ])('routes %s through the ledger wall clock', (_label, path) => {
    const source = read(path);

    expect(source).toContain('occurredAtToLocalWallClock(');
    // A bare `occurredAt` handed to the formatter is the defect itself.
    expect(source).not.toMatch(/formatDate\(\s*item\.occurredAt/);
  });
});
