export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: {
    latitude?: number;
    longitude?: number;
    gps_accuracy?: number;
    friendly_name?: string;
    icon?: string;
    source?: string;
    radius?: number;
    [key: string]: unknown;
  };
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  config?: {
    version?: string;
    [key: string]: unknown;
  };
  callApi: <T>(
    method: 'GET' | 'POST',
    path: string,
    parameters?: Record<string, unknown>
  ) => Promise<T>;
}

/** Minimum Home Assistant Core version (inclusive). */
export const MIN_HA_VERSION = '2026.9.0';

export interface EntityConfig {
  entity: string;
  name?: string;
  color?: string;
  focus?: boolean;
  label_mode?: string;
}

export type ThemeMode = 'auto' | 'light' | 'dark';

export interface TraceOnMapCardConfig {
  type: string;
  entities: Array<EntityConfig | string>;
  hours_to_show?: number;
  default_zoom?: number;
  auto_fit?: boolean;
  fit_zones?: boolean;
  aspect_ratio?: string;
  theme_mode?: ThemeMode;
  dark_mode?: boolean;
  cluster?: boolean;
  title?: string;
}

export interface HistoryState {
  entity_id?: string;
  state: string;
  attributes?: {
    latitude?: number;
    longitude?: number;
    friendly_name?: string;
    [key: string]: unknown;
  };
  last_changed: string;
  last_updated?: string;
}

export interface TimelinePoint {
  timestamp: number;
  entityId: string;
  lat: number;
  lng: number;
}

export interface HaMapPathPoint {
  point: [number, number];
  timestamp: Date;
}

export interface HaMapPaths {
  points: HaMapPathPoint[];
  color?: string;
  name?: string;
  gradualOpacity?: number;
  fullDatetime?: boolean;
}

export interface HaMapEntity {
  entity_id: string;
  color: string;
  name?: string;
  focus?: boolean;
  label_mode?: string;
}

export const DEFAULT_HOURS_TO_SHOW = 24;
export const MAX_HOURS_TO_SHOW = 720;
export const MIN_HOURS_TO_SHOW = 1;
export const DEFAULT_ZOOM = 14;
export const ANIMATION_TOTAL_MS = 30_000;
