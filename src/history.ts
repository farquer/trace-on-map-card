import { toCoordNumber } from './coords.js';
import type {
  EntityConfig,
  HaMapPaths,
  HistoryState,
  TimelinePoint,
} from './types.js';
import { colorForEntity } from './utils.js';
import { sanitizeCssColor } from './color.js';

export function normalizeHistories(
  data: HistoryState[][] | Record<string, HistoryState[]>
): HistoryState[][] {
  return Array.isArray(data)
    ? data
    : Object.values(data as Record<string, HistoryState[]>);
}

export function extractTimelinePoints(
  data: HistoryState[][] | Record<string, HistoryState[]>,
  entityConfigs: EntityConfig[]
): TimelinePoint[] {
  const histories = normalizeHistories(data);
  const points: TimelinePoint[] = [];

  histories.forEach((entityHistory, index) => {
    if (!entityHistory || entityHistory.length === 0) return;

    const entityId =
      entityHistory.find((s) => s.entity_id)?.entity_id ??
      entityConfigs[index]?.entity;
    if (!entityId) return;

    entityHistory.forEach((state) => {
      const lat = toCoordNumber(state.attributes?.latitude);
      const lng = toCoordNumber(state.attributes?.longitude);
      if (lat == null || lng == null) return;
      const ts = new Date(state.last_updated ?? state.last_changed).getTime();
      if (!Number.isFinite(ts)) return;
      points.push({ timestamp: ts, entityId, lat, lng });
    });
  });

  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

export function buildHaPaths(
  points: TimelinePoint[],
  entityConfigs: EntityConfig[],
  hoursToShow: number,
  colorMap?: Map<string, string>
): HaMapPaths[] {
  const byEntity = new Map<string, TimelinePoint[]>();
  for (const p of points) {
    if (!byEntity.has(p.entityId)) byEntity.set(p.entityId, []);
    byEntity.get(p.entityId)!.push(p);
  }

  const paths: HaMapPaths[] = [];
  for (const [entityId, entityPoints] of byEntity) {
    if (entityPoints.length === 0) continue;
    const cfg = entityConfigs.find((c) => c.entity === entityId);
    const rawColor = colorForEntity(entityId, entityConfigs, colorMap);
    paths.push({
      points: entityPoints.map((p) => ({
        point: [p.lat, p.lng],
        timestamp: new Date(p.timestamp),
      })),
      name: cfg?.name ?? entityId,
      color: sanitizeCssColor(rawColor),
      gradualOpacity: 0.8,
      fullDatetime: hoursToShow > 144,
    });
  }
  return paths;
}

/** Keep points with timestamp <= t (inclusive). */
export function clipPointsToTime(
  points: TimelinePoint[],
  t: number
): TimelinePoint[] {
  return points.filter((p) => p.timestamp <= t);
}

/** Keep timeline points with index <= upToIndex. */
export function clipTimelineToIndex(
  points: TimelinePoint[],
  upToIndex: number
): TimelinePoint[] {
  if (points.length === 0 || upToIndex < 0) return [];
  const end = Math.min(upToIndex, points.length - 1);
  return points.slice(0, end + 1);
}

export function timestampAtIndex(
  points: TimelinePoint[],
  index: number
): number | null {
  if (points.length === 0) return null;
  const i = Math.min(Math.max(0, index), points.length - 1);
  return points[i].timestamp;
}
