import { describe, expect, it } from 'vitest';
import {
  canGoNext,
  canGoPrev,
  clampRangeOffset,
  getDayWindow,
  getRecentWindow,
  getWeekWindow,
  parseRangeMode,
  resolveHaTimeZone,
  resolveRangeWindow,
  zonedWallTimeToUtcMs,
} from '../range-window';

describe('parseRangeMode / clamp / canGo', () => {
  it('parses modes', () => {
    expect(parseRangeMode('day')).toBe('day');
    expect(parseRangeMode('week')).toBe('week');
    expect(parseRangeMode('recent')).toBe('recent');
    expect(parseRangeMode('nope')).toBeUndefined();
  });

  it('clamps offset to <= 0', () => {
    expect(clampRangeOffset(0)).toBe(0);
    expect(clampRangeOffset(-3)).toBe(-3);
    expect(clampRangeOffset(5)).toBe(0);
  });

  it('canGoNext only when day/week and offset < 0', () => {
    expect(canGoNext('recent', -1)).toBe(false);
    expect(canGoNext('day', 0)).toBe(false);
    expect(canGoNext('day', -1)).toBe(true);
    expect(canGoNext('week', -2)).toBe(true);
  });

  it('canGoPrev for day/week', () => {
    expect(canGoPrev('recent')).toBe(false);
    expect(canGoPrev('day')).toBe(true);
    expect(canGoPrev('week')).toBe(true);
  });
});

describe('resolveHaTimeZone', () => {
  it('uses provided zone', () => {
    expect(resolveHaTimeZone('Asia/Shanghai')).toBe('Asia/Shanghai');
  });

  it('falls back when empty', () => {
    const tz = resolveHaTimeZone('');
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
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
