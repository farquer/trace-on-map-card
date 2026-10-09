import { notifyHaMapResize } from './ha-map-loader.js';
import type { ScrubEditableLocation } from './scrub-markers.js';
import type { HaMapEntity, HaMapPaths, HomeAssistant, ThemeMode } from './types.js';

export interface HaMapProps {
  hass: HomeAssistant | null;
  entities: HaMapEntity[];
  paths: HaMapPaths[];
  /** Historical scrub/play avatars at timeline positions (ha-map editableLocations). */
  editableLocations?: ScrubEditableLocation[];
  autoFit: boolean;
  fitZones: boolean;
  cluster: boolean;
  themeMode: ThemeMode;
  zoom: number;
}

export function createHaMapElement(): HTMLElement {
  const el = document.createElement('ha-map');
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.display = 'block';
  return el;
}

export function applyMapProps(el: HTMLElement, props: HaMapProps): void {
  const map = el as HTMLElement & Record<string, unknown>;

  // HA 2026.9+ ha-map uses Lit contexts for states; still set .hass when accepted.
  if (props.hass) {
    try {
      map.hass = props.hass;
    } catch {
      /* ignore */
    }
  }

  map.entities = props.entities;
  map.paths = props.paths;
  map.editableLocations = props.editableLocations ?? [];
  map.autoFit = props.autoFit;
  map.fitZones = props.fitZones;
  map.clusterMarkers = props.cluster;
  map.themeMode = props.themeMode;
  map.zoom = props.zoom;

  if (props.autoFit) el.setAttribute('auto-fit', '');
  else el.removeAttribute('auto-fit');
  if (props.fitZones) el.setAttribute('fit-zones', '');
  else el.removeAttribute('fit-zones');
  if (props.cluster) el.setAttribute('cluster-markers', '');
  else el.removeAttribute('cluster-markers');
  el.setAttribute('theme-mode', props.themeMode);
}

export function resizeHaMap(el: HTMLElement | null | undefined): void {
  notifyHaMapResize(el);
}
