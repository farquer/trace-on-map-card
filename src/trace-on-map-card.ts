import './editor.js';
import {
  buildHaPaths,
  clipTimelineToIndex,
  extractTimelinePoints,
} from './history.js';
import {
  applyMapProps,
  createHaMapElement,
  whenHaMapDefined,
} from './map-host.js';
import { PlaybackController } from './playback.js';
import type {
  EntityConfig,
  HaMapEntity,
  HaMapPaths,
  HassEntity,
  HistoryState,
  HomeAssistant,
  TimelinePoint,
  TraceOnMapCardConfig,
} from './types.js';
import {
  DEFAULT_HOURS_TO_SHOW,
  DEFAULT_ZOOM,
} from './types.js';
import {
  ENTITY_COLORS,
  clampHours,
  clampZoom,
  colorForEntity,
  formatDateTime,
  formatTime,
  isZoneEntity,
  normalizeEntityConfigs,
  parseAspectRatio,
  resolveThemeMode,
} from './utils.js';

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

const CARD_CSS = `
  :host {
    display: block;
    position: relative;
    z-index: 0;
    isolation: isolate;
  }
  ha-card { overflow: hidden; }
  .card-header {
    padding: 12px 16px 0;
    font-weight: 500;
    font-size: 1.1em;
  }
  #map-wrap {
    width: 100%;
    height: 400px;
    position: relative;
    background: var(--secondary-background-color, #f5f5f5);
  }
  #map-wrap.ratio { height: auto; }
  #map-wrap ha-map, #map-wrap .map-el {
    width: 100%;
    height: 100%;
    min-height: 200px;
  }
  #map-wrap.ratio .map-el {
    position: absolute;
    inset: 0;
  }
  .alert {
    padding: 12px 16px;
    color: var(--error-color, #c62828);
    font-size: 0.9em;
  }
  .timeline-container {
    padding: 12px 16px;
    background: var(--card-background-color, #fff);
    border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  .timeline-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .play-pause-btn {
    background: var(--primary-color, #03a9f4);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    min-width: 36px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .timeline-slider-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .timeline-slider {
    width: 100%;
    cursor: pointer;
    accent-color: var(--primary-color, #03a9f4);
  }
  .timeline-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.72em;
    color: var(--secondary-text-color, #727272);
  }
  .timeline-time {
    font-size: 0.8em;
    color: var(--secondary-text-color, #727272);
    white-space: nowrap;
    min-width: 50px;
    text-align: right;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 16px 12px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8em;
    color: var(--primary-text-color, #212121);
  }
  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .loading-msg {
    padding: 8px 16px;
    font-size: 0.85em;
    color: var(--secondary-text-color, #727272);
  }
`;

class TraceOnMapCard extends HTMLElement {
  private _config: TraceOnMapCardConfig | null = null;
  private _hass: HomeAssistant | null = null;
  private _shadow: ShadowRoot;
  private _mapEl: HTMLElement | null = null;
  private _mapWrap: HTMLDivElement | null = null;
  private _sliderEl: HTMLInputElement | null = null;
  private _playBtn: HTMLButtonElement | null = null;
  private _timeLabelEl: HTMLSpanElement | null = null;
  private _loadingEl: HTMLElement | null = null;
  private _alertEl: HTMLElement | null = null;
  private _legendEl: HTMLElement | null = null;

  private _timelinePoints: TimelinePoint[] = [];
  private _fullPaths: HaMapPaths[] = [];
  private _entityColors = new Map<string, string>();
  private _playback = new PlaybackController();
  private _unsubscribePlayback: (() => void) | null = null;
  private _historyFetchedAt = 0;
  private _fetchToken = 0;
  private _built = false;
  private _scrubbingLive = true;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  static getConfigElement(): HTMLElement {
    return document.createElement('trace-on-map-card-editor');
  }

  static getStubConfig(): Record<string, unknown> {
    return {
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'device_tracker.example' }],
      hours_to_show: DEFAULT_HOURS_TO_SHOW,
      auto_fit: true,
      cluster: true,
    };
  }

  getCardSize(): number {
    const ratio = parseAspectRatio(this._config?.aspect_ratio);
    if (!ratio) return 6;
    const ar = (100 * ratio.h) / ratio.w;
    return 1 + Math.floor(ar / 25) || 3;
  }

  setConfig(config: TraceOnMapCardConfig): void {
    if (!config || !config.entities || config.entities.length === 0) {
      throw new Error('trace-on-map-card: "entities" list is required');
    }
    this._config = {
      ...config,
      auto_fit: config.auto_fit ?? true,
      fit_zones: config.fit_zones ?? false,
      cluster: config.cluster ?? true,
      theme_mode: config.theme_mode ?? (config.dark_mode ? 'dark' : 'auto'),
      hours_to_show: clampHours(config.hours_to_show ?? DEFAULT_HOURS_TO_SHOW),
      default_zoom: clampZoom(config.default_zoom ?? DEFAULT_ZOOM),
    };
    this._assignColors();
    if (this._built) {
      this._applyAspectRatio();
      this._renderLegend();
      void this._fetchHistory();
      this._syncMap(true);
    } else if (this.isConnected) {
      void this._build();
    }
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._built && this._config && this.isConnected) {
      void this._build();
      return;
    }
    if (this._built) {
      this._syncMap(this._scrubbingLive);
      const now = Date.now();
      if (now - this._historyFetchedAt > 60_000) {
        void this._fetchHistory();
      }
    }
  }

  get hass(): HomeAssistant | null {
    return this._hass;
  }

  connectedCallback(): void {
    if (this._config && this._hass && !this._built) {
      void this._build();
    }
  }

  disconnectedCallback(): void {
    this._playback.destroy();
    this._unsubscribePlayback?.();
    this._unsubscribePlayback = null;
  }

  private _assignColors(): void {
    if (!this._config) return;
    this._entityColors.clear();
    const configs = normalizeEntityConfigs(this._config.entities);
    configs.forEach((c, i) => {
      this._entityColors.set(
        c.entity,
        c.color ?? ENTITY_COLORS[i % ENTITY_COLORS.length]
      );
    });
  }

  private async _build(): Promise<void> {
    if (this._built || !this._config) return;
    this._built = true;

    this._shadow.innerHTML = `
      <style>${CARD_CSS}</style>
      <ha-card>
        <div class="card-header" id="title"></div>
        <div id="map-wrap"><div class="alert" id="alert" style="display:none"></div></div>
        <div class="loading-msg" id="loading" style="display:none">Loading history…</div>
        <div class="timeline-container">
          <div class="timeline-controls">
            <button type="button" class="play-pause-btn" id="play" title="Play history animation"></button>
            <div class="timeline-slider-wrap">
              <input type="range" class="timeline-slider" id="slider" min="0" max="0" value="0" />
              <div class="timeline-labels">
                <span id="lbl-start"></span>
                <span id="lbl-end"></span>
              </div>
            </div>
            <span class="timeline-time" id="time-label"></span>
          </div>
        </div>
        <div class="legend" id="legend"></div>
      </ha-card>
    `;

    this._mapWrap = this._shadow.getElementById('map-wrap') as HTMLDivElement;
    this._loadingEl = this._shadow.getElementById('loading');
    this._alertEl = this._shadow.getElementById('alert');
    this._legendEl = this._shadow.getElementById('legend');
    this._sliderEl = this._shadow.getElementById('slider') as HTMLInputElement;
    this._playBtn = this._shadow.getElementById('play') as HTMLButtonElement;
    this._timeLabelEl = this._shadow.getElementById('time-label') as HTMLSpanElement;

    const titleEl = this._shadow.getElementById('title');
    if (titleEl) {
      titleEl.textContent = this._config.title ?? '';
      titleEl.style.display = this._config.title ? '' : 'none';
    }

    this._playBtn.innerHTML = playIcon();
    this._playBtn.addEventListener('click', () => this._playback.toggle());
    this._sliderEl.addEventListener('input', () => {
      this._playback.scrub(Number(this._sliderEl!.value));
    });

    this._unsubscribePlayback = this._playback.subscribe((index, playing) => {
      this._onPlayback(index, playing);
    });

    this._applyAspectRatio();
    this._renderLegend();
    this._updatePlayBtn(false);

    const ok = await whenHaMapDefined();
    if (!ok) {
      this._showAlert(
        'ha-map is not available. Update Home Assistant frontend or ensure the default Map card works.'
      );
      return;
    }

    this._mapEl = createHaMapElement();
    this._mapEl.classList.add('map-el');
    this._mapWrap.appendChild(this._mapEl);
    this._syncMap(true);
    await this._fetchHistory();
  }

  private _applyAspectRatio(): void {
    if (!this._mapWrap || !this._config) return;
    const ratio = parseAspectRatio(this._config.aspect_ratio);
    if (!ratio) {
      this._mapWrap.classList.remove('ratio');
      this._mapWrap.style.paddingBottom = '';
      this._mapWrap.style.height = '400px';
      return;
    }
    this._mapWrap.classList.add('ratio');
    this._mapWrap.style.height = '0';
    this._mapWrap.style.paddingBottom = `${(100 * ratio.h) / ratio.w}%`;
  }

  private _showAlert(msg: string): void {
    if (!this._alertEl) return;
    this._alertEl.style.display = '';
    this._alertEl.textContent = msg;
  }

  private _getEntityConfigs(): EntityConfig[] {
    return normalizeEntityConfigs(this._config?.entities ?? []);
  }

  private async _fetchHistory(): Promise<void> {
    if (!this._hass || !this._config) return;
    const token = ++this._fetchToken;
    if (this._loadingEl) this._loadingEl.style.display = '';

    const hoursToShow = clampHours(this._config.hours_to_show);
    const startTime = new Date(Date.now() - hoursToShow * 3600 * 1000);
    const entityIds = this._getEntityConfigs()
      .map((e) => e.entity)
      .filter((id) => id && !isZoneEntity(id))
      .join(',');

    if (!entityIds) {
      if (this._loadingEl) this._loadingEl.style.display = 'none';
      this._timelinePoints = [];
      this._fullPaths = [];
      this._playback.setPoints([]);
      this._syncMap(true);
      return;
    }

    try {
      const path =
        `history/period/${startTime.toISOString()}` +
        `?filter_entity_id=${entityIds}` +
        `&significant_changes_only=0`;
      const data: HistoryState[][] | Record<string, HistoryState[]> =
        await this._hass.callApi('GET', path);
      if (token !== this._fetchToken) return;

      const configs = this._getEntityConfigs();
      this._timelinePoints = extractTimelinePoints(data, configs);
      this._fullPaths = buildHaPaths(
        this._timelinePoints,
        configs,
        hoursToShow,
        this._entityColors
      );
      this._historyFetchedAt = Date.now();
      this._playback.setPoints(this._timelinePoints);

      const lastIdx = Math.max(0, this._timelinePoints.length - 1);
      if (this._sliderEl) {
        this._sliderEl.max = String(lastIdx);
      }
      const startLbl = this._shadow.getElementById('lbl-start');
      const endLbl = this._shadow.getElementById('lbl-end');
      if (startLbl) startLbl.textContent = formatDateTime(startTime);
      if (endLbl) endLbl.textContent = formatDateTime(new Date());

      // Default view: full path + live markers (scrub at end)
      if (this._timelinePoints.length > 0) {
        this._playback.scrub(lastIdx);
      } else {
        this._scrubbingLive = true;
        this._syncMap(true);
      }
    } catch (err) {
      console.warn('trace-on-map-card: failed to fetch history', err);
      this._showAlert('Failed to load history. Live positions still shown.');
    } finally {
      if (this._loadingEl) this._loadingEl.style.display = 'none';
    }
  }

  private _onPlayback(index: number, playing: boolean): void {
    if (this._sliderEl) this._sliderEl.value = String(index);
    this._updateTimeLabel(index);
    this._updatePlayBtn(playing);

    const atEnd =
      this._timelinePoints.length === 0 ||
      index >= this._timelinePoints.length - 1;
    this._scrubbingLive = atEnd && !playing;

    const clipped = clipTimelineToIndex(this._timelinePoints, index);
    const hoursToShow = clampHours(this._config?.hours_to_show);
    const paths = buildHaPaths(
      clipped,
      this._getEntityConfigs(),
      hoursToShow,
      this._entityColors
    );
    this._applyMap(paths, this._scrubbingLive);
  }

  private _syncMap(showLiveEntities: boolean): void {
    this._applyMap(this._fullPaths, showLiveEntities);
  }

  private _applyMap(paths: HaMapPaths[], showLiveEntities: boolean): void {
    if (!this._mapEl || !this._config) return;
    applyMapProps(this._mapEl, {
      hass: this._hass,
      entities: this._buildMapEntities(showLiveEntities),
      paths,
      autoFit: this._config.auto_fit !== false,
      fitZones: !!this._config.fit_zones,
      cluster: this._config.cluster !== false,
      themeMode: resolveThemeMode(this._config),
      zoom: clampZoom(this._config.default_zoom),
    });
  }

  private _buildMapEntities(showLiveEntities: boolean): HaMapEntity[] {
    const configs = this._getEntityConfigs();
    return configs
      .filter((c) => c.entity)
      .filter((c) => showLiveEntities || isZoneEntity(c.entity))
      .map((c) => ({
        entity_id: c.entity,
        color: this._entityColors.get(c.entity) ?? colorForEntity(c.entity, configs),
        name: c.name ?? friendlyName(this._hass?.states[c.entity]),
        focus: c.focus,
        label_mode: c.label_mode,
      }));
  }

  private _renderLegend(): void {
    if (!this._legendEl || !this._config) return;
    const configs = this._getEntityConfigs().filter(
      (c) => c.entity && !isZoneEntity(c.entity)
    );
    this._legendEl.innerHTML = configs
      .map((c) => {
        const color =
          this._entityColors.get(c.entity) ?? colorForEntity(c.entity, configs);
        const name =
          c.name ??
          friendlyName(this._hass?.states[c.entity]) ??
          c.entity;
        return `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeHtml(name)}</div>`;
      })
      .join('');
  }

  private _updateTimeLabel(index: number): void {
    if (!this._timeLabelEl) return;
    const pt = this._timelinePoints[index];
    this._timeLabelEl.textContent = pt
      ? formatTime(new Date(pt.timestamp))
      : '';
  }

  private _updatePlayBtn(playing: boolean): void {
    if (!this._playBtn) return;
    this._playBtn.innerHTML = playing ? pauseIcon() : playIcon();
    this._playBtn.title = playing
      ? 'Pause animation'
      : 'Play history animation';
  }
}

function friendlyName(entity?: HassEntity): string | undefined {
  return entity?.attributes?.friendly_name;
}

function playIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}

function pauseIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

if (!customElements.get('trace-on-map-card')) {
  customElements.define('trace-on-map-card', TraceOnMapCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'trace-on-map-card',
  name: 'Trace on Map Card',
  description:
    'Location history on the Home Assistant default map with timeline playback',
  preview: true,
});

export { TraceOnMapCard };
