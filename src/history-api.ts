/** Build HA history/period path with encoded entity ids. */
export function buildHistoryApiPath(
  startTime: Date,
  entityIds: string[]
): string {
  const filtered = entityIds.filter((id) => id.length > 0);
  const encoded = filtered.map((id) => encodeURIComponent(id)).join(',');
  return (
    `history/period/${startTime.toISOString()}` +
    `?filter_entity_id=${encoded}` +
    `&significant_changes_only=0`
  );
}

export function shouldAutoRefetchHistory(options: {
  playing: boolean;
  lastFetchedAt: number;
  now: number;
  intervalMs?: number;
}): boolean {
  if (options.playing) return false;
  const interval = options.intervalMs ?? 60_000;
  if (options.lastFetchedAt <= 0) return true;
  return options.now - options.lastFetchedAt >= interval;
}
