import { clipTimelineToIndex } from './history.js';
import type { HassEntity, TimelinePoint } from './types.js';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ScrubEditableLocation {
  id: string;
  location: [number, number];
  element: HTMLElement;
  elementSize: [number, number];
  title?: string;
  color?: string;
  locationEditable: false;
  radiusEditable: false;
  fit: false;
}

/** Last known position per entity up to timeline index (inclusive). */
export function positionsAtTimelineIndex(
  points: TimelinePoint[],
  index: number
): Map<string, LatLng> {
  const clipped = clipTimelineToIndex(points, index);
  const map = new Map<string, LatLng>();
  for (const p of clipped) {
    map.set(p.entityId, { lat: p.lat, lng: p.lng });
  }
  return map;
}

export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

export function resolveEntityPictureUrl(
  picture: unknown,
  hassUrl?: (path: string) => string
): string {
  if (typeof picture !== 'string' || !picture) return '';
  try {
    return hassUrl ? hassUrl(picture) : picture;
  } catch {
    return picture;
  }
}

/**
 * Build / update a floating avatar marker element for historical scrub.
 * Prefers HA's ha-entity-marker when available.
 */
export function ensureAvatarMarkerElement(
  cache: Map<string, HTMLElement>,
  options: {
    entityId: string;
    name: string;
    color: string;
    pictureUrl: string;
  }
): HTMLElement {
  let el = cache.get(options.entityId);
  if (!el) {
    if (typeof customElements !== 'undefined' && customElements.get('ha-entity-marker')) {
      el = document.createElement('ha-entity-marker');
    } else {
      el = document.createElement('div');
      el.className = 'trace-scrub-marker';
    }
    cache.set(options.entityId, el);
  }

  if (el.localName === 'ha-entity-marker') {
    const marker = el as HTMLElement & Record<string, unknown>;
    marker.entityId = options.entityId;
    marker.entityName = initialsFromName(options.name) || '?';
    marker.entityPicture = options.pictureUrl;
    marker.entityColor = options.color;
    marker.floating = true;
    marker.showIcon = false;
    return el;
  }

  // Fallback DOM avatar (when ha-entity-marker is not registered yet)
  el.style.cssText = [
    'width:40px',
    'height:40px',
    'border-radius:50%',
    `border:2px solid ${options.color}`,
    'box-shadow:0 1px 4px rgba(0,0,0,.35)',
    'background-size:cover',
    'background-position:center',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font:600 12px/1 sans-serif',
    'color:#fff',
    `background-color:${options.color}`,
  ].join(';');
  if (options.pictureUrl) {
    el.style.backgroundImage = `url("${options.pictureUrl.replace(/"/g, '\\"')}")`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = initialsFromName(options.name) || '?';
  }
  return el;
}

export function buildScrubEditableLocations(options: {
  positions: Map<string, LatLng>;
  names: Map<string, string>;
  colors: Map<string, string>;
  states?: Record<string, HassEntity>;
  hassUrl?: (path: string) => string;
  elementCache: Map<string, HTMLElement>;
}): ScrubEditableLocation[] {
  const result: ScrubEditableLocation[] = [];
  for (const [entityId, pos] of options.positions) {
    const state = options.states?.[entityId];
    const name =
      options.names.get(entityId) ??
      state?.attributes?.friendly_name ??
      entityId;
    const color = options.colors.get(entityId) ?? '#0288d1';
    const pictureUrl = resolveEntityPictureUrl(
      state?.attributes?.entity_picture,
      options.hassUrl
    );
    const element = ensureAvatarMarkerElement(options.elementCache, {
      entityId,
      name,
      color,
      pictureUrl,
    });
    result.push({
      id: `scrub:${entityId}`,
      location: [pos.lat, pos.lng],
      element,
      // Match floating ha-entity-marker footprint roughly
      elementSize: [48, 56],
      title: name,
      color,
      locationEditable: false,
      radiusEditable: false,
      fit: false,
    });
  }
  return result;
}
