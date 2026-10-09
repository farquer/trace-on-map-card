import type { TraceOnMapCardConfig } from './types.js';
import {
  DEFAULT_HOURS_TO_SHOW,
  DEFAULT_ZOOM,
} from './types.js';
import {
  clampHours,
  clampZoom,
  parseAspectRatio,
} from './utils.js';

export function assertEntitiesPresent(
  config: TraceOnMapCardConfig | null | undefined
): void {
  if (!config || !config.entities || config.entities.length === 0) {
    throw new Error('trace-on-map-card: "entities" list is required');
  }
}

/** Normalize Lovelace config with defaults and clamps. */
export function normalizeCardConfig(
  config: TraceOnMapCardConfig
): TraceOnMapCardConfig {
  assertEntitiesPresent(config);
  return {
    ...config,
    auto_fit: config.auto_fit ?? true,
    fit_zones: config.fit_zones ?? false,
    cluster: config.cluster ?? true,
    theme_mode: config.theme_mode ?? (config.dark_mode ? 'dark' : 'auto'),
    hours_to_show: clampHours(config.hours_to_show ?? DEFAULT_HOURS_TO_SHOW),
    default_zoom: clampZoom(config.default_zoom ?? DEFAULT_ZOOM),
  };
}

export function getCardSizeFromConfig(
  config: TraceOnMapCardConfig | null | undefined
): number {
  const ratio = parseAspectRatio(config?.aspect_ratio);
  if (!ratio) return 6;
  const ar = (100 * ratio.h) / ratio.w;
  return 1 + Math.floor(ar / 25) || 3;
}

export function stubCardConfig(): Record<string, unknown> {
  return {
    type: 'custom:trace-on-map-card',
    entities: [{ entity: 'device_tracker.example' }],
    hours_to_show: DEFAULT_HOURS_TO_SHOW,
    auto_fit: true,
    cluster: true,
  };
}
