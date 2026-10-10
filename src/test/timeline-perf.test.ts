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
});

describe('buildHistoryWindows', () => {
  it('covers range with 24h windows', () => {
    const start = Date.UTC(2026, 0, 1);
    const end = start + 3 * HISTORY_WINDOW_MS + 3600_000;
    const windows = buildHistoryWindows(start, end);
    expect(windows.length).toBe(4);
    expect(windows[0]!.startMs).toBe(start);
    expect(windows[windows.length - 1]!.endMs).toBe(end);
    // contiguous
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i]!.startMs).toBe(windows[i - 1]!.endMs);
    }
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
});

describe('indexAtOrBeforeTime / windows', () => {
  it('finds last point at or before t', () => {
    const points = [pt(10), pt(20), pt(30)];
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
});
