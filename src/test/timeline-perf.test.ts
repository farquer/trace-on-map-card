import { describe, expect, it } from 'vitest';
import type { TimelinePoint } from '../types';
import {
  HISTORY_WINDOW_MS,
  TIME_SLIDER_MAX,
  buildHistoryWindows,
  clampMaxTimelinePoints,
  downsampleTimeline,
  filterPointsInWindow,
  findWindowIndexForTime,
  indexAtOrBeforeTime,
  mergeTimelinePoints,
  sliderValueToTimestamp,
  timestampToSliderValue,
} from '../timeline-perf';

function pt(
  ts: number,
  entityId = 'person.a',
  lat = 1,
  lng = 2
): TimelinePoint {
  return { timestamp: ts, entityId, lat, lng };
}

describe('clampMaxTimelinePoints', () => {
  it('returns undefined for omit/invalid', () => {
    expect(clampMaxTimelinePoints(undefined)).toBeUndefined();
    expect(clampMaxTimelinePoints(null)).toBeUndefined();
    expect(clampMaxTimelinePoints('')).toBeUndefined();
    expect(clampMaxTimelinePoints('abc')).toBeUndefined();
    expect(clampMaxTimelinePoints(0)).toBeUndefined();
    expect(clampMaxTimelinePoints(-1)).toBeUndefined();
    expect(clampMaxTimelinePoints(NaN)).toBeUndefined();
    expect(clampMaxTimelinePoints(Infinity)).toBeUndefined();
  });

  it('floors valid values to ≥ 1', () => {
    expect(clampMaxTimelinePoints(1)).toBe(1);
    expect(clampMaxTimelinePoints(3000)).toBe(3000);
    expect(clampMaxTimelinePoints('1500.9')).toBe(1500);
  });
});

describe('downsampleTimeline', () => {
  it('no-ops when under or equal max', () => {
    const points = [pt(1), pt(2), pt(3)];
    expect(downsampleTimeline(points, 3)).toEqual(points);
    expect(downsampleTimeline(points, 10)).toEqual(points);
  });

  it('keeps first and last when reducing', () => {
    const points = Array.from({ length: 100 }, (_, i) => pt(i * 1000));
    const out = downsampleTimeline(points, 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  it('maxPoints 2 returns ends only', () => {
    const points = [pt(1), pt(2), pt(3), pt(4)];
    expect(downsampleTimeline(points, 2)).toEqual([pt(1), pt(4)]);
  });

  it('maxPoints 1 returns last point only', () => {
    const points = [pt(1), pt(2), pt(3)];
    expect(downsampleTimeline(points, 1)).toEqual([pt(3)]);
  });

  it('handles identical timestamps via index sampling', () => {
    // Same timestamp, different coords — span≤0 path; adjacent-identical dedupe
    // only collapses fully equal rows.
    const points = [
      pt(5, 'person.a', 0, 0),
      pt(5, 'person.a', 1, 1),
      pt(5, 'person.a', 2, 2),
      pt(5, 'person.a', 3, 3),
      pt(5, 'person.a', 4, 4),
    ];
    const out = downsampleTimeline(points, 3);
    expect(out.every((p) => p.timestamp === 5)).toBe(true);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('no-ops when maxPoints < 1', () => {
    const points = [pt(1), pt(2)];
    expect(downsampleTimeline(points, 0)).toEqual(points);
  });
});

describe('buildHistoryWindows', () => {
  it('covers range with 24h windows', () => {
    const start = Date.UTC(2026, 0, 1);
    const end = start + 3 * HISTORY_WINDOW_MS + 3600_000;
    const windows = buildHistoryWindows(start, end);
    expect(windows.length).toBe(4);
    expect(windows[0]!.startMs).toBe(start);
    expect(windows[windows.length - 1]!.endMs).toBe(end);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i]!.startMs).toBe(windows[i - 1]!.endMs);
    }
  });

  it('returns single window when end ≤ start or windowMs ≤ 0', () => {
    expect(buildHistoryWindows(100, 100)).toEqual([
      { id: '100-100', startMs: 100, endMs: 100 },
    ]);
    expect(buildHistoryWindows(0, 1000, 0)).toEqual([
      { id: '0-1000', startMs: 0, endMs: 1000 },
    ]);
    expect(buildHistoryWindows(500, 100, HISTORY_WINDOW_MS)).toEqual([
      { id: '500-100', startMs: 500, endMs: 100 },
    ]);
  });
});

describe('mergeTimelinePoints', () => {
  it('sorts and dedupes by entity+timestamp', () => {
    const a = [pt(3), pt(1)];
    const b = [pt(1), pt(2, 'person.b')];
    const m = mergeTimelinePoints(a, b);
    expect(m.map((p) => `${p.entityId}:${p.timestamp}`)).toEqual([
      'person.a:1',
      'person.b:2',
      'person.a:3',
    ]);
  });

  it('later duplicate overwrites earlier for same key', () => {
    const a = [pt(1, 'person.a', 1, 1)];
    const b = [pt(1, 'person.a', 9, 9)];
    expect(mergeTimelinePoints(a, b)[0]).toEqual(pt(1, 'person.a', 9, 9));
  });
});

describe('slider time mapping', () => {
  it('round-trips endpoints', () => {
    const start = 1_000;
    const end = 2_000;
    expect(
      sliderValueToTimestamp(0, 0, TIME_SLIDER_MAX, start, end)
    ).toBe(start);
    expect(
      sliderValueToTimestamp(TIME_SLIDER_MAX, 0, TIME_SLIDER_MAX, start, end)
    ).toBe(end);
    expect(
      timestampToSliderValue(start, 0, TIME_SLIDER_MAX, start, end)
    ).toBe(0);
    expect(
      timestampToSliderValue(end, 0, TIME_SLIDER_MAX, start, end)
    ).toBe(TIME_SLIDER_MAX);
  });

  it('clamps out-of-range timestamps and handles degenerate span', () => {
    expect(timestampToSliderValue(-100, 0, 100, 0, 1000)).toBe(0);
    expect(timestampToSliderValue(9999, 0, 100, 0, 1000)).toBe(100);
    expect(sliderValueToTimestamp(50, 0, 0, 10, 20)).toBe(10);
    expect(timestampToSliderValue(15, 0, 100, 10, 10)).toBe(0);
  });

  it('maps midpoint', () => {
    expect(sliderValueToTimestamp(500, 0, 1000, 0, 1000)).toBe(500);
  });
});

describe('indexAtOrBeforeTime / windows', () => {
  it('finds last point at or before t', () => {
    const points = [pt(10), pt(20), pt(30)];
    expect(indexAtOrBeforeTime([], 10)).toBe(-1);
    expect(indexAtOrBeforeTime(points, 5)).toBe(-1);
    expect(indexAtOrBeforeTime(points, 20)).toBe(1);
    expect(indexAtOrBeforeTime(points, 35)).toBe(2);
  });

  it('filters and finds window index', () => {
    const start = 0;
    const end = HISTORY_WINDOW_MS * 2;
    const windows = buildHistoryWindows(start, end);
    expect(findWindowIndexForTime(windows, 100)).toBe(0);
    expect(findWindowIndexForTime(windows, HISTORY_WINDOW_MS)).toBe(1);
    const pts = [pt(10), pt(HISTORY_WINDOW_MS + 5), pt(end)];
    expect(filterPointsInWindow(pts, 0, HISTORY_WINDOW_MS, false)).toEqual([
      pt(10),
    ]);
    expect(
      filterPointsInWindow(pts, HISTORY_WINDOW_MS, end, true).map(
        (p) => p.timestamp
      )
    ).toEqual([HISTORY_WINDOW_MS + 5, end]);
  });

  it('clamps findWindowIndexForTime outside range and empty', () => {
    expect(findWindowIndexForTime([], 1)).toBe(-1);
    const windows = buildHistoryWindows(1000, 1000 + HISTORY_WINDOW_MS);
    expect(findWindowIndexForTime(windows, 0)).toBe(0);
    expect(findWindowIndexForTime(windows, 1e15)).toBe(windows.length - 1);
  });
});
