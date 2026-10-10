import type { TimelinePoint } from './types.js';

export const HISTORY_WINDOW_MS = 24 * 3600 * 1000;
export const TIME_SLIDER_MAX = 1000;

/** Omit / invalid → undefined (unlimited). Else integer ≥ 1. */
export function clampMaxTimelinePoints(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.floor(n);
}

/**
 * Uniform-in-time downsample. Always keeps first and last.
 * No-op when points.length ≤ maxPoints or maxPoints < 2 with length > 0
 * (still keep ends when maxPoints === 1 → single last? Spec: max ≥ 1;
 * if maxPoints === 1 return [last] only after keeping semantic — keep first if one point).
 */
export function downsampleTimeline(
  points: TimelinePoint[],
  maxPoints: number
): TimelinePoint[] {
  if (points.length <= maxPoints || maxPoints < 1) return points.slice();
  if (maxPoints === 1) return [points[points.length - 1]!];

  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (maxPoints === 2) return [first, last];

  const t0 = first.timestamp;
  const t1 = last.timestamp;
  const span = t1 - t0;
  if (span <= 0) {
    // All same timestamp — take evenly by index
    const out: TimelinePoint[] = [first];
    for (let i = 1; i < maxPoints - 1; i++) {
      const idx = Math.round((i / (maxPoints - 1)) * (points.length - 1));
      out.push(points[idx]!);
    }
    out.push(last);
    return dedupeAdjacent(out);
  }

  const out: TimelinePoint[] = [first];
  let cursor = 0;
  for (let i = 1; i < maxPoints - 1; i++) {
    const targetT = t0 + (span * i) / (maxPoints - 1);
    while (
      cursor < points.length - 1 &&
      points[cursor + 1]!.timestamp <= targetT
    ) {
      cursor++;
    }
    out.push(points[cursor]!);
  }
  out.push(last);
  return dedupeAdjacent(out);
}

function dedupeAdjacent(points: TimelinePoint[]): TimelinePoint[] {
  const out: TimelinePoint[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.entityId === p.entityId &&
      prev.timestamp === p.timestamp &&
      prev.lat === p.lat &&
      prev.lng === p.lng
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

export interface HistoryWindow {
  id: string;
  startMs: number;
  endMs: number;
}

/** Half-open windows [start, end) except last includes endMs. */
export function buildHistoryWindows(
  startMs: number,
  endMs: number,
  windowMs: number = HISTORY_WINDOW_MS
): HistoryWindow[] {
  if (!(endMs > startMs) || windowMs <= 0) {
    return [{ id: `${startMs}-${endMs}`, startMs, endMs }];
  }
  const windows: HistoryWindow[] = [];
  let t = startMs;
  while (t < endMs) {
    const next = Math.min(t + windowMs, endMs);
    windows.push({
      id: `${t}-${next}`,
      startMs: t,
      endMs: next,
    });
    t = next;
  }
  return windows;
}

export function mergeTimelinePoints(
  a: TimelinePoint[],
  b: TimelinePoint[]
): TimelinePoint[] {
  const key = (p: TimelinePoint) => `${p.entityId}|${p.timestamp}`;
  const map = new Map<string, TimelinePoint>();
  for (const p of [...a, ...b]) {
    map.set(key(p), p);
  }
  return [...map.values()].sort((x, y) => x.timestamp - y.timestamp);
}

export function sliderValueToTimestamp(
  value: number,
  min: number,
  max: number,
  startMs: number,
  endMs: number
): number {
  if (max <= min) return startMs;
  const ratio = (value - min) / (max - min);
  return startMs + ratio * (endMs - startMs);
}

export function timestampToSliderValue(
  t: number,
  min: number,
  max: number,
  startMs: number,
  endMs: number
): number {
  if (endMs <= startMs) return min;
  const ratio = (t - startMs) / (endMs - startMs);
  const clamped = Math.min(1, Math.max(0, ratio));
  return min + clamped * (max - min);
}

/** Largest index with timestamp ≤ t; -1 if none. */
export function indexAtOrBeforeTime(
  points: TimelinePoint[],
  t: number
): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.timestamp <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function filterPointsInWindow(
  points: TimelinePoint[],
  startMs: number,
  endMs: number,
  isLastWindow: boolean
): TimelinePoint[] {
  return points.filter((p) =>
    isLastWindow
      ? p.timestamp >= startMs && p.timestamp <= endMs
      : p.timestamp >= startMs && p.timestamp < endMs
  );
}

export function findWindowIndexForTime(
  windows: HistoryWindow[],
  t: number
): number {
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    const last = i === windows.length - 1;
    if (last) {
      if (t >= w.startMs && t <= w.endMs) return i;
    } else if (t >= w.startMs && t < w.endMs) {
      return i;
    }
  }
  if (windows.length === 0) return -1;
  if (t < windows[0]!.startMs) return 0;
  return windows.length - 1;
}
