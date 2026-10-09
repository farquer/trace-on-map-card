import type { HaMapEntity, HaMapPaths, HomeAssistant, ThemeMode } from './types.js';

export interface HaMapProps {
  hass: HomeAssistant | null;
  entities: HaMapEntity[];
  paths: HaMapPaths[];
  autoFit: boolean;
  fitZones: boolean;
  cluster: boolean;
  themeMode: ThemeMode;
  zoom: number;
}

export function isHaMapAvailable(): boolean {
  return typeof customElements !== 'undefined' && !!customElements.get('ha-map');
}

export async function whenHaMapDefined(timeoutMs = 10000): Promise<boolean> {
  if (isHaMapAvailable()) return true;
  if (typeof customElements === 'undefined') return false;
  try {
    await Promise.race([
      customElements.whenDefined('ha-map'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return isHaMapAvailable();
  }
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

  // Older HA versions accept .hass; newer ha-map uses Lit contexts from the app tree.
  if ('hass' in map || props.hass) {
    try {
      map.hass = props.hass;
    } catch {
      /* ignore */
    }
  }

  map.entities = props.entities;
  map.paths = props.paths;
  map.autoFit = props.autoFit;
  map.fitZones = props.fitZones;
  map.clusterMarkers = props.cluster;
  map.themeMode = props.themeMode;
  map.zoom = props.zoom;

  // Attribute mirrors for boolean/string props used by some HA builds
  if (props.autoFit) el.setAttribute('auto-fit', '');
  else el.removeAttribute('auto-fit');
  if (props.fitZones) el.setAttribute('fit-zones', '');
  else el.removeAttribute('fit-zones');
  if (props.cluster) el.setAttribute('cluster-markers', '');
  else el.removeAttribute('cluster-markers');
  el.setAttribute('theme-mode', props.themeMode);
}
