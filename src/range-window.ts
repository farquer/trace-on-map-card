import type { RangeMode } from './types.js';

export type { RangeMode };

export interface TimeWindow {
  startMs: number;
  endMs: number;
  label: string;
}

export function parseRangeMode(raw: unknown): RangeMode | undefined {
  if (raw === 'recent' || raw === 'day' || raw === 'week') return raw;
  return undefined;
}

/** Default runtime mode when config omits range_mode. */
export const DEFAULT_RANGE_MODE: RangeMode = 'day';

export function resolveHaTimeZone(
  timeZone: string | undefined | null
): string {
  if (typeof timeZone === 'string' && timeZone.trim()) return timeZone.trim();
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function clampRangeOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(0, Math.floor(offset));
}

export function canGoNext(mode: RangeMode, offset: number): boolean {
  if (mode === 'recent') return false;
  return clampRangeOffset(offset) < 0;
}

export function canGoPrev(mode: RangeMode): boolean {
  return mode === 'day' || mode === 'week';
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(ms: number, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * UTC ms for a wall-clock date/time in `timeZone`.
 * Iteratively corrects using Intl (handles DST).
 */
export function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const p = getZonedParts(utc, timeZone);
    const asUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second
    );
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = target - asUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return utc;
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const utc = Date.UTC(year, month - 1, day + delta);
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Monday=0 … Sunday=6 for the calendar date in TZ. */
function weekdayMondayIndex(
  year: number,
  month: number,
  day: number,
  timeZone: string
): number {
  // Noon avoids DST edge when probing weekday
  const ms = zonedWallTimeToUtcMs(year, month, day, 12, 0, 0, timeZone);
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(new Date(ms));
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[wd] ?? 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatMd(year: number, month: number, day: number): string {
  void year;
  return `${pad2(month)}-${pad2(day)}`;
}

/** Parse `YYYY-MM-DD` (strict digits). */
export function parseYmd(
  raw: string
): { year: number; month: number; day: number } | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Validate calendar date via UTC round-trip
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { year, month, day };
}

/** Civil today as `YYYY-MM-DD` in `timeZone`. */
export function todayYmd(nowMs: number, timeZone: string): string {
  const p = getZonedParts(nowMs, timeZone);
  return formatYmd(p.year, p.month, p.day);
}

/** Day difference as UTC ordinal (no TZ). */
function ymdOrdinal(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Offset for day mode from a picked `YYYY-MM-DD` (HA TZ civil calendar).
 * Future dates clamp to 0 (today). Invalid input → undefined.
 */
export function dayOffsetFromYmd(
  nowMs: number,
  timeZone: string,
  ymd: string
): number | undefined {
  const target = parseYmd(ymd);
  if (!target) return undefined;
  const today = getZonedParts(nowMs, timeZone);
  const offset =
    ymdOrdinal(target.year, target.month, target.day) -
    ymdOrdinal(today.year, today.month, today.day);
  return clampRangeOffset(offset);
}

export function getRecentWindow(
  nowMs: number,
  hours: number
): TimeWindow {
  const h = Math.max(1, Math.floor(hours));
  const endMs = nowMs;
  const startMs = nowMs - h * 3600 * 1000;
  return {
    startMs,
    endMs,
    label: `最近 ${h} 小时`,
  };
}

export function getDayWindow(
  nowMs: number,
  timeZone: string,
  offset: number
): TimeWindow {
  const off = clampRangeOffset(offset);
  const parts = getZonedParts(nowMs, timeZone);
  const target = addCalendarDays(parts.year, parts.month, parts.day, off);
  const startMs = zonedWallTimeToUtcMs(
    target.year,
    target.month,
    target.day,
    0,
    0,
    0,
    timeZone
  );
  const next = addCalendarDays(target.year, target.month, target.day, 1);
  const endMs = zonedWallTimeToUtcMs(
    next.year,
    next.month,
    next.day,
    0,
    0,
    0,
    timeZone
  );
  return {
    startMs,
    endMs,
    label: formatYmd(target.year, target.month, target.day),
  };
}

export function getWeekWindow(
  nowMs: number,
  timeZone: string,
  offset: number
): TimeWindow {
  const off = clampRangeOffset(offset);
  const parts = getZonedParts(nowMs, timeZone);
  // Shift calendar by offset weeks first via day delta
  const shifted = addCalendarDays(
    parts.year,
    parts.month,
    parts.day,
    off * 7
  );
  const monIdx = weekdayMondayIndex(
    shifted.year,
    shifted.month,
    shifted.day,
    timeZone
  );
  const monday = addCalendarDays(
    shifted.year,
    shifted.month,
    shifted.day,
    -monIdx
  );
  const startMs = zonedWallTimeToUtcMs(
    monday.year,
    monday.month,
    monday.day,
    0,
    0,
    0,
    timeZone
  );
  const sundayPlus = addCalendarDays(monday.year, monday.month, monday.day, 7);
  const endMs = zonedWallTimeToUtcMs(
    sundayPlus.year,
    sundayPlus.month,
    sundayPlus.day,
    0,
    0,
    0,
    timeZone
  );
  const sunday = addCalendarDays(monday.year, monday.month, monday.day, 6);
  return {
    startMs,
    endMs,
    label: `${formatMd(monday.year, monday.month, monday.day)} ~ ${formatMd(sunday.year, sunday.month, sunday.day)}`,
  };
}

export function resolveRangeWindow(options: {
  mode: RangeMode;
  nowMs: number;
  timeZone: string;
  offset: number;
  hoursToShow: number;
}): TimeWindow {
  const { mode, nowMs, timeZone, offset, hoursToShow } = options;
  if (mode === 'recent') return getRecentWindow(nowMs, hoursToShow);
  if (mode === 'week') return getWeekWindow(nowMs, timeZone, offset);
  return getDayWindow(nowMs, timeZone, offset);
}
