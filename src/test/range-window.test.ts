import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RANGE_MODE,
  canGoNext,
  canGoPrev,
  clampRangeOffset,
  dayOffsetFromYmd,
  getDayWindow,
  getRecentWindow,
  getWeekWindow,
  parseRangeMode,
  parseYmd,
  resolveHaTimeZone,
  resolveRangeWindow,
  todayYmd,
  zonedWallTimeToUtcMs,
} from '../range-window';

describe('parseRangeMode / clamp / canGo', () => {
  it('parses modes', () => {
    expect(parseRangeMode('day')).toBe('day');
    expect(parseRangeMode('week')).toBe('week');
    expect(parseRangeMode('recent')).toBe('recent');
    expect(parseRangeMode('nope')).toBeUndefined();
    expect(parseRangeMode(null)).toBeUndefined();
    expect(DEFAULT_RANGE_MODE).toBe('day');
  });

  it('clamps offset to <= 0 integer', () => {
    expect(clampRangeOffset(0)).toBe(0);
    expect(clampRangeOffset(-3)).toBe(-3);
    expect(clampRangeOffset(5)).toBe(0);
    expect(clampRangeOffset(-1.9)).toBe(-2);
    expect(clampRangeOffset(Number.NaN)).toBe(0);
    expect(clampRangeOffset(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('canGoNext only when day/week and offset < 0', () => {
    expect(canGoNext('recent', -1)).toBe(false);
    expect(canGoNext('day', 0)).toBe(false);
    expect(canGoNext('day', -1)).toBe(true);
    expect(canGoNext('week', -2)).toBe(true);
    expect(canGoNext('week', 3)).toBe(false);
  });

  it('canGoPrev for day/week', () => {
    expect(canGoPrev('recent')).toBe(false);
    expect(canGoPrev('day')).toBe(true);
    expect(canGoPrev('week')).toBe(true);
  });
});

describe('resolveHaTimeZone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses provided zone and trims', () => {
    expect(resolveHaTimeZone('Asia/Shanghai')).toBe('Asia/Shanghai');
    expect(resolveHaTimeZone('  UTC  ')).toBe('UTC');
  });

  it('falls back when empty', () => {
    const tz = resolveHaTimeZone('');
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
    expect(resolveHaTimeZone(null).length).toBeGreaterThan(0);
  });

  it('falls back to UTC when Intl throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no intl');
    });
    expect(resolveHaTimeZone(undefined)).toBe('UTC');
  });
});

describe('Shanghai calendar windows', () => {
  const tz = 'Asia/Shanghai';

  it('day window for 2026-10-13 15:30 CST is that civil day', () => {
    // 2026-10-13 15:30 CST = 2026-10-13 07:30 UTC
    const nowMs = Date.UTC(2026, 9, 13, 7, 30, 0);
    const w = getDayWindow(nowMs, tz, 0);
    expect(w.label).toBe('2026-10-13');
    expect(w.startMs).toBe(zonedWallTimeToUtcMs(2026, 10, 13, 0, 0, 0, tz));
    expect(w.endMs).toBe(zonedWallTimeToUtcMs(2026, 10, 14, 0, 0, 0, tz));
    expect(w.endMs - w.startMs).toBe(24 * 3600 * 1000);
  });

  it('day offset -1 is previous civil day', () => {
    const nowMs = Date.UTC(2026, 9, 13, 7, 30, 0);
    const w = getDayWindow(nowMs, tz, -1);
    expect(w.label).toBe('2026-10-12');
    expect(w.startMs).toBe(zonedWallTimeToUtcMs(2026, 10, 12, 0, 0, 0, tz));
    expect(w.endMs).toBe(zonedWallTimeToUtcMs(2026, 10, 13, 0, 0, 0, tz));
  });

  it('week window Mon–Sun containing 2026-10-13 (Tue)', () => {
    // 2026-10-13 is Tuesday → week Mon 10-12 .. Sun 10-18
    const nowMs = Date.UTC(2026, 9, 13, 7, 30, 0);
    const w = getWeekWindow(nowMs, tz, 0);
    expect(w.label).toBe('10-12 ~ 10-18');
    expect(w.startMs).toBe(zonedWallTimeToUtcMs(2026, 10, 12, 0, 0, 0, tz));
    expect(w.endMs).toBe(zonedWallTimeToUtcMs(2026, 10, 19, 0, 0, 0, tz));
  });

  it('week offset -1 is previous Mon–Sun', () => {
    const nowMs = Date.UTC(2026, 9, 13, 7, 30, 0);
    const w = getWeekWindow(nowMs, tz, -1);
    expect(w.label).toBe('10-05 ~ 10-11');
    expect(w.startMs).toBe(zonedWallTimeToUtcMs(2026, 10, 5, 0, 0, 0, tz));
    expect(w.endMs).toBe(zonedWallTimeToUtcMs(2026, 10, 12, 0, 0, 0, tz));
  });

  it('recent window is rolling hours ending at now', () => {
    const nowMs = Date.UTC(2026, 9, 13, 7, 30, 0);
    const w = getRecentWindow(nowMs, 24);
    expect(w.label).toBe('最近 24 小时');
    expect(w.endMs).toBe(nowMs);
    expect(w.startMs).toBe(nowMs - 24 * 3600 * 1000);
  });

  it('recent floors hours and clamps minimum to 1', () => {
    const nowMs = 1_000_000;
    expect(getRecentWindow(nowMs, 24.9).label).toBe('最近 24 小时');
    expect(getRecentWindow(nowMs, 0).startMs).toBe(nowMs - 3600_000);
  });

  it('week starting on Monday stays that week', () => {
    // 2026-10-12 is Monday in Shanghai
    const nowMs = zonedWallTimeToUtcMs(2026, 10, 12, 9, 0, 0, tz);
    const w = getWeekWindow(nowMs, tz, 0);
    expect(w.label).toBe('10-12 ~ 10-18');
  });

  it('week containing Sunday includes prior Monday', () => {
    // 2026-10-18 is Sunday → still 10-12 ~ 10-18
    const nowMs = zonedWallTimeToUtcMs(2026, 10, 18, 18, 0, 0, tz);
    const w = getWeekWindow(nowMs, tz, 0);
    expect(w.label).toBe('10-12 ~ 10-18');
    expect(w.startMs).toBe(zonedWallTimeToUtcMs(2026, 10, 12, 0, 0, 0, tz));
  });

  it('resolveRangeWindow dispatches by mode', () => {
    const nowMs = Date.UTC(2026, 9, 13, 7, 30, 0);
    expect(
      resolveRangeWindow({
        mode: 'day',
        nowMs,
        timeZone: tz,
        offset: 0,
        hoursToShow: 24,
      }).label
    ).toBe('2026-10-13');
    expect(
      resolveRangeWindow({
        mode: 'week',
        nowMs,
        timeZone: tz,
        offset: 0,
        hoursToShow: 24,
      }).label
    ).toBe('10-12 ~ 10-18');
    expect(
      resolveRangeWindow({
        mode: 'recent',
        nowMs,
        timeZone: tz,
        offset: -5,
        hoursToShow: 48,
      }).label
    ).toBe('最近 48 小时');
  });
});

describe('YMD helpers / dayOffsetFromYmd', () => {
  const tz = 'Asia/Shanghai';
  // 2026-10-13 15:30 CST
  const nowMs = Date.UTC(2026, 9, 13, 7, 30, 0);

  it('parseYmd accepts valid dates and rejects invalid', () => {
    expect(parseYmd('2026-10-13')).toEqual({
      year: 2026,
      month: 10,
      day: 13,
    });
    expect(parseYmd('2026-02-30')).toBeUndefined();
    expect(parseYmd('10-13')).toBeUndefined();
    expect(parseYmd('')).toBeUndefined();
  });

  it('todayYmd uses HA timezone civil date', () => {
    expect(todayYmd(nowMs, tz)).toBe('2026-10-13');
  });

  it('dayOffsetFromYmd: today=0, yesterday=-1, future clamps to 0', () => {
    expect(dayOffsetFromYmd(nowMs, tz, '2026-10-13')).toBe(0);
    expect(dayOffsetFromYmd(nowMs, tz, '2026-10-12')).toBe(-1);
    expect(dayOffsetFromYmd(nowMs, tz, '2026-10-01')).toBe(-12);
    expect(dayOffsetFromYmd(nowMs, tz, '2026-10-20')).toBe(0);
    expect(dayOffsetFromYmd(nowMs, tz, 'nope')).toBeUndefined();
  });
});

describe('DST-aware day length (US/Eastern)', () => {
  it('2026-03-08 spring-forward day is 23h', () => {
    const tz = 'America/New_York';
    // 2026-03-08 12:00 EDT/EST wall — use noon UTC-ish via wall
    const noon = zonedWallTimeToUtcMs(2026, 3, 8, 12, 0, 0, tz);
    const w = getDayWindow(noon, tz, 0);
    expect(w.label).toBe('2026-03-08');
    expect(w.endMs - w.startMs).toBe(23 * 3600 * 1000);
  });

  it('2026-11-01 fall-back day is 25h', () => {
    const tz = 'America/New_York';
    const noon = zonedWallTimeToUtcMs(2026, 11, 1, 12, 0, 0, tz);
    const w = getDayWindow(noon, tz, 0);
    expect(w.label).toBe('2026-11-01');
    expect(w.endMs - w.startMs).toBe(25 * 3600 * 1000);
  });
});
