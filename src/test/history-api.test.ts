import { describe, expect, it } from 'vitest';
import { buildHistoryApiPath, shouldAutoRefetchHistory } from '../history-api';

describe('buildHistoryApiPath', () => {
  it('encodes entity ids and disables significant_changes_only', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const path = buildHistoryApiPath(start, [
      'device_tracker.phone',
      'person.alice/test',
    ]);
    expect(path).toContain('history/period/2026-01-01T00:00:00.000Z');
    expect(path).toContain('significant_changes_only=0');
    expect(path).toContain(
      `filter_entity_id=${encodeURIComponent('device_tracker.phone')},${encodeURIComponent('person.alice/test')}`
    );
  });

  it('skips empty ids', () => {
    const path = buildHistoryApiPath(new Date('2026-01-01T00:00:00.000Z'), [
      '',
      'device_tracker.a',
    ]);
    expect(path).toContain(encodeURIComponent('device_tracker.a'));
    expect(path).not.toContain('filter_entity_id=,');
  });
});

describe('shouldAutoRefetchHistory', () => {
  it('never refetches while playing', () => {
    expect(
      shouldAutoRefetchHistory({
        playing: true,
        lastFetchedAt: 0,
        now: 100_000,
      })
    ).toBe(false);
  });

  it('refetches when interval elapsed and idle', () => {
    expect(
      shouldAutoRefetchHistory({
        playing: false,
        lastFetchedAt: 1000,
        now: 62_000,
        intervalMs: 60_000,
      })
    ).toBe(true);
  });

  it('does not refetch before interval', () => {
    expect(
      shouldAutoRefetchHistory({
        playing: false,
        lastFetchedAt: 1000,
        now: 30_000,
        intervalMs: 60_000,
      })
    ).toBe(false);
  });
});
