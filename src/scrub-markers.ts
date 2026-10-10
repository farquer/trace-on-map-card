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

/** Match HA ha-entity-marker floating geometry (frontend ha-entity-marker.ts). */
export const FLOATING_MARKER_SIZE = 48;
const FLOATING_TAIL_SIZE = 12;
const FLOATING_TAIL_REACH = Math.round((FLOATING_TAIL_SIZE * Math.SQRT2) / 2);
const FLOATING_GAP = 4;
const FLOATING_DOT_SIZE = 10;
export const FLOATING_LIFT = FLOATING_GAP + FLOATING_DOT_SIZE / 2;

/** Match HA ha-map cluster bubble for a single avatar. */
export const CLUSTER_AVATAR_SIZE = 32;
const CLUSTER_BUBBLE_PADDING = 6;
const CLUSTER_TAIL_SIZE = 10;
const CLUSTER_TAIL_HEIGHT = Math.round((CLUSTER_TAIL_SIZE * Math.SQRT2) / 2);

export type ScrubMarkerStyle = 'cluster' | 'floating';

/**
 * ha-map editableLocations only pass `size` (center-anchored). Live entity
 * markers use a custom tip anchor. Pad the wrapper so the tip lands on the
 * lat/lng with center anchoring — avatar stays above the path origin.
 */
export function centerAnchoredPinSize(
  contentWidth: number,
  contentHeight: number,
  tipFromTop: number
): [number, number] {
  return [contentWidth, Math.max(contentHeight, tipFromTop * 2)];
}

export function floatingPinGeometry(markerSize = FLOATING_MARKER_SIZE): {
  contentSize: [number, number];
  elementSize: [number, number];
  tipFromTop: number;
} {
  const height =
    markerSize + FLOATING_TAIL_REACH + FLOATING_GAP + FLOATING_DOT_SIZE;
  const tipFromTop = height - FLOATING_DOT_SIZE / 2;
  return {
    contentSize: [markerSize, height],
    tipFromTop,
    elementSize: centerAnchoredPinSize(markerSize, height, tipFromTop),
  };
}

export function clusterPinGeometry(): {
  contentSize: [number, number];
  elementSize: [number, number];
  tipFromTop: number;
} {
  const width = CLUSTER_AVATAR_SIZE + 2 * CLUSTER_BUBBLE_PADDING;
  const height =
    CLUSTER_AVATAR_SIZE + 2 * CLUSTER_BUBBLE_PADDING + CLUSTER_TAIL_HEIGHT;
  // Live cluster tip sits FLOATING_LIFT below the bubble (ha-map _createClusterBubble).
  const tipFromTop = height + FLOATING_LIFT;
  return {
    contentSize: [width, height],
    tipFromTop,
    elementSize: centerAnchoredPinSize(width, height, tipFromTop),
  };
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

function applyEntityMarkerProps(
  marker: HTMLElement,
  options: {
    entityId: string;
    name: string;
    color: string;
    pictureUrl: string;
    floating: boolean;
    markerSizePx: number;
  }
): void {
  const m = marker as HTMLElement & Record<string, unknown>;
  m.entityId = options.entityId;
  marker.setAttribute('entity-id', options.entityId);
  m.entityName = initialsFromName(options.name) || '?';
  m.entityPicture = options.pictureUrl;
  m.entityColor = options.color;
  m.floating = options.floating;
  m.showIcon = false;
  m.selected = false;
  marker.style.setProperty('--ha-marker-size', `${options.markerSizePx}px`);
  marker.style.setProperty('--ha-marker-color', options.color);
  marker.style.setProperty('--ha-marker-border-width', '2px');
  if (!options.floating) {
    marker.style.setProperty('--ha-marker-border-radius', '10px');
  }
}

function createEntityMarkerOrFallback(): {
  marker: HTMLElement;
  isHaMarker: boolean;
} {
  if (
    typeof customElements !== 'undefined' &&
    customElements.get('ha-entity-marker')
  ) {
    return {
      marker: document.createElement('ha-entity-marker'),
      isHaMarker: true,
    };
  }
  const marker = document.createElement('div');
  marker.className = 'trace-scrub-avatar';
  return { marker, isHaMarker: false };
}

function styleFallbackAvatar(
  el: HTMLElement,
  options: { name: string; color: string; pictureUrl: string; size: number }
): void {
  el.style.cssText = [
    `width:${options.size}px`,
    `height:${options.size}px`,
    'border-radius:10px',
    `border:2px solid ${options.color}`,
    'box-sizing:border-box',
    'background-size:cover',
    'background-position:center',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font:600 12px/1 sans-serif',
    'color:var(--primary-text-color,#212121)',
    'background-color:var(--card-background-color,#fff)',
  ].join(';');
  if (options.pictureUrl) {
    el.style.backgroundImage = `url("${options.pictureUrl.replace(/"/g, '\\"')}")`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = initialsFromName(options.name) || '?';
  }
}

/**
 * Build / update a scrub pin that matches HA live markers.
 * editableLocations are center-anchored, so the wrapper is padded until the
 * tip (path origin) sits at the box center — avatar stays above the dot.
 */
export function ensureAvatarMarkerElement(
  cache: Map<string, HTMLElement>,
  options: {
    entityId: string;
    name: string;
    color: string;
    pictureUrl: string;
    style: ScrubMarkerStyle;
  }
): { element: HTMLElement; elementSize: [number, number] } {
  const styleKey = options.style;
  const cacheKey = `${styleKey}:${options.entityId}`;
  let wrap = cache.get(cacheKey);
  const geometry =
    styleKey === 'cluster' ? clusterPinGeometry() : floatingPinGeometry();

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className =
      styleKey === 'cluster' ? 'trace-scrub-cluster' : 'trace-scrub-floating';
    wrap.style.cssText = [
      `width:${geometry.elementSize[0]}px`,
      `height:${geometry.elementSize[1]}px`,
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'pointer-events:none',
      'box-sizing:border-box',
    ].join(';');

    if (styleKey === 'cluster') {
      const bubble = document.createElement('div');
      bubble.className = 'trace-scrub-cluster-bubble';
      bubble.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `padding:${CLUSTER_BUBBLE_PADDING}px`,
        'box-sizing:border-box',
        'background:var(--card-background-color,#fff)',
        'border-radius:14px',
        'filter:drop-shadow(0 1px 2px rgba(0,0,0,.08)) drop-shadow(0 1px 3px rgba(0,0,0,.12))',
      ].join(';');

      const { marker, isHaMarker } = createEntityMarkerOrFallback();
      marker.style.pointerEvents = 'auto';
      if (isHaMarker) {
        applyEntityMarkerProps(marker, {
          ...options,
          floating: false,
          markerSizePx: CLUSTER_AVATAR_SIZE,
        });
      } else {
        styleFallbackAvatar(marker, {
          name: options.name,
          color: options.color,
          pictureUrl: options.pictureUrl,
          size: CLUSTER_AVATAR_SIZE,
        });
      }
      bubble.appendChild(marker);

      const tail = document.createElement('div');
      tail.className = 'trace-scrub-cluster-tail';
      tail.style.cssText = [
        `width:${CLUSTER_TAIL_SIZE}px`,
        `height:${CLUSTER_TAIL_SIZE}px`,
        `margin-top:${-CLUSTER_TAIL_SIZE / 2}px`,
        'border-radius:2px',
        'background:var(--card-background-color,#fff)',
        'transform:rotate(45deg)',
        'position:relative',
        'z-index:-1',
      ].join(';');

      wrap.append(bubble, tail);
    } else {
      const { marker, isHaMarker } = createEntityMarkerOrFallback();
      marker.style.pointerEvents = 'auto';
      if (isHaMarker) {
        applyEntityMarkerProps(marker, {
          ...options,
          floating: true,
          markerSizePx: FLOATING_MARKER_SIZE,
        });
      } else {
        styleFallbackAvatar(marker, {
          name: options.name,
          color: options.color,
          pictureUrl: options.pictureUrl,
          size: FLOATING_MARKER_SIZE,
        });
      }
      wrap.appendChild(marker);
    }

    cache.set(cacheKey, wrap);
  }

  const marker =
    wrap.querySelector('ha-entity-marker') ??
    wrap.querySelector('.trace-scrub-avatar');
  if (marker instanceof HTMLElement) {
    if (marker.localName === 'ha-entity-marker') {
      applyEntityMarkerProps(marker, {
        ...options,
        floating: styleKey === 'floating',
        markerSizePx:
          styleKey === 'cluster' ? CLUSTER_AVATAR_SIZE : FLOATING_MARKER_SIZE,
      });
    } else {
      styleFallbackAvatar(marker, {
        name: options.name,
        color: options.color,
        pictureUrl: options.pictureUrl,
        size:
          styleKey === 'cluster' ? CLUSTER_AVATAR_SIZE : FLOATING_MARKER_SIZE,
      });
    }
  }

  return { element: wrap, elementSize: geometry.elementSize };
}

export function buildScrubEditableLocations(options: {
  positions: Map<string, LatLng>;
  names: Map<string, string>;
  colors: Map<string, string>;
  states?: Record<string, HassEntity>;
  hassUrl?: (path: string) => string;
  elementCache: Map<string, HTMLElement>;
  /** When true (default), match HA cluster-bubble pin; else floating pin. */
  cluster?: boolean;
}): ScrubEditableLocation[] {
  const style: ScrubMarkerStyle =
    options.cluster === false ? 'floating' : 'cluster';
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
    const { element, elementSize } = ensureAvatarMarkerElement(
      options.elementCache,
      {
        entityId,
        name,
        color,
        pictureUrl,
        style,
      }
    );
    result.push({
      id: `scrub:${entityId}`,
      location: [pos.lat, pos.lng],
      element,
      elementSize,
      title: name,
      color,
      locationEditable: false,
      radiusEditable: false,
      fit: false,
    });
  }
  return result;
}
