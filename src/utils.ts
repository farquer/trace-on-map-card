import type {
  EntityConfig,
  ThemeMode,
  TraceOnMapCardConfig,
} from './types.js';
import {
  DEFAULT_HOURS_TO_SHOW,
  DEFAULT_ZOOM,
  MAX_HOURS_TO_SHOW,
  MIN_HA_VERSION,
  MIN_HOURS_TO_SHOW,
} from './types.js';

export const ENTITY_COLORS = [
  '#0288d1',
  '#e53935',
  '#43a047',
  '#8e24aa',
  '#fb8c00',
  '#00acc1',
  '#3949ab',
  '#d81b60',
];

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(date: Date): string {
  return (
    date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    formatTime(date)
  );
}

export function clampHours(raw: number | string | undefined | null): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_HOURS_TO_SHOW;
  }
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_HOURS_TO_SHOW;
  return Math.min(
    MAX_HOURS_TO_SHOW,
    Math.max(MIN_HOURS_TO_SHOW, Math.round(parsed))
  );
}

export function clampZoom(raw: number | string | undefined): number {
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_ZOOM;
  return Math.min(20, Math.max(1, Math.round(parsed)));
}

export function normalizeEntityConfigs(
  entities: Array<EntityConfig | string>
): EntityConfig[] {
  return entities.map((e) => (typeof e === 'string' ? { entity: e } : { ...e }));
}

export function resolveThemeMode(config: TraceOnMapCardConfig): ThemeMode {
  if (config.theme_mode) return config.theme_mode;
  if (config.dark_mode) return 'dark';
  return 'auto';
}

export function isZoneEntity(entityId: string): boolean {
  return entityId.startsWith('zone.');
}

export function colorForEntity(
  entityId: string,
  configs: EntityConfig[],
  colorMap?: Map<string, string>
): string {
  if (colorMap?.has(entityId)) return colorMap.get(entityId)!;
  const fromConfig = configs.find((c) => c.entity === entityId)?.color;
  if (fromConfig) return fromConfig;
  const idx = Math.abs(hashString(entityId)) % ENTITY_COLORS.length;
  return ENTITY_COLORS[idx];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export function parseAspectRatio(
  ratio: string | undefined
): { w: number; h: number } | null {
  if (!ratio) return null;
  const m = String(ratio)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

/** Parse HA version strings like "2026.9.3" or "2026.9.3b0" into [y,m,p]. */
export function parseHaVersion(
  version: string | undefined | null
): [number, number, number] | null {
  if (!version) return null;
  const m = String(version)
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Compare HA versions.
 * Invalid `a` → -1; invalid `b` → 1; both invalid → 0.
 */
export function compareHaVersions(a: string, b: string): number {
  const pa = parseHaVersion(a);
  const pb = parseHaVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** True when version is >= MIN_HA_VERSION (2026.9.0). */
export function isHaVersionSupported(
  version: string | undefined | null,
  minimum: string = MIN_HA_VERSION
): boolean {
  if (!parseHaVersion(version ?? undefined)) return false;
  return compareHaVersions(String(version), minimum) >= 0;
}
