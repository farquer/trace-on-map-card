/** Build HA history/period path with encoded entity ids.
 *
 * HA defaults `end_time` to start+1 day when omitted — week/multi-day
 * ranges MUST pass `endTime` or only the first day is returned.
 */
export function buildHistoryApiPath(
  startTime: Date,
  entityIds: string[],
  endTime?: Date
): string {
  const filtered = entityIds.filter((id) => id.length > 0);
  const encoded = filtered.map((id) => encodeURIComponent(id)).join(',');
  let path =
    `history/period/${startTime.toISOString()}` +
    `?filter_entity_id=${encoded}` +
    `&significant_changes_only=0`;
  if (endTime) {
    path += `&end_time=${encodeURIComponent(endTime.toISOString())}`;
  }
  return path;
}

export function shouldAutoRefetchHistory(options: {
  playing: boolean;
  lastFetchedAt: number;
  now: number;
  intervalMs?: number;
  /** Skip while a History request is already in flight (avoids cancel storms). */
  inFlight?: boolean;
  /**
   * When true, skip periodic refetch (stable past day/week windows).
   * Recent mode and current day/week (offset 0) should leave this false/omit.
   */
  skipForStableRange?: boolean;
}): boolean {
  if (options.playing) return false;
  if (options.inFlight) return false;
  if (options.skipForStableRange) return false;
  const interval = options.intervalMs ?? 60_000;
  if (options.lastFetchedAt <= 0) return true;
  return options.now - options.lastFetchedAt >= interval;
}
