import { sanitizeCssColor } from './color.js';
import type { EntityConfig, HaMapEntity, HassEntity } from './types.js';
import {
  ENTITY_COLORS,
  colorForEntity,
  isZoneEntity,
  normalizeEntityConfigs,
} from './utils.js';

export function assignEntityColors(
  entities: Array<EntityConfig | string>
): Map<string, string> {
  const configs = normalizeEntityConfigs(entities);
  const map = new Map<string, string>();
  configs.forEach((c, i) => {
    const fallback = ENTITY_COLORS[i % ENTITY_COLORS.length];
    map.set(c.entity, sanitizeCssColor(c.color ?? fallback, fallback));
  });
  return map;
}

export function historyEntityIds(configs: EntityConfig[]): string[] {
  return configs
    .map((c) => c.entity)
    .filter((id) => id.length > 0 && !isZoneEntity(id));
}

export function buildHaMapEntities(options: {
  configs: EntityConfig[];
  showLiveEntities: boolean;
  colorMap: Map<string, string>;
  states?: Record<string, HassEntity>;
}): HaMapEntity[] {
  const { configs, showLiveEntities, colorMap, states } = options;
  return configs
    .filter((c) => c.entity)
    .filter((c) => showLiveEntities || isZoneEntity(c.entity))
    .map((c) => ({
      entity_id: c.entity,
      color: sanitizeCssColor(
        colorMap.get(c.entity) ?? colorForEntity(c.entity, configs),
        ENTITY_COLORS[0]
      ),
      name: c.name ?? states?.[c.entity]?.attributes?.friendly_name,
      focus: c.focus,
      label_mode: c.label_mode,
    }));
}

export function legendItems(options: {
  configs: EntityConfig[];
  colorMap: Map<string, string>;
  states?: Record<string, HassEntity>;
}): Array<{ entity: string; name: string; color: string }> {
  return options.configs
    .filter((c) => c.entity && !isZoneEntity(c.entity))
    .map((c) => ({
      entity: c.entity,
      name:
        c.name ??
        options.states?.[c.entity]?.attributes?.friendly_name ??
        c.entity,
      color: sanitizeCssColor(
        options.colorMap.get(c.entity) ??
          colorForEntity(c.entity, options.configs),
        ENTITY_COLORS[0]
      ),
    }));
}
