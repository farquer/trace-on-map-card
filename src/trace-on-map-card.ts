import './editor.js';
import {
  getCardSizeFromConfig,
  normalizeCardConfig,
  stubCardConfig,
} from './card-config.js';
import { escapeHtml } from './dom-utils.js';
import { ensureHaMapLoaded } from './ha-map-loader.js';
import {
  buildHaPaths,
  clipTimelineToIndex,
  extractTimelinePoints,
} from './history.js';
import { buildHistoryApiPath, shouldAutoRefetchHistory } from './history-api.js';
import {
  assignEntityColors,
  buildHaMapEntities,
  historyEntityIds,
  legendItems,
} from './map-entities.js';
import { applyMapProps, createHaMapElement, resizeHaMap } from './map-host.js';
import { PlaybackController } from './playback.js';
import {
  buildScrubEditableLocations,
  positionsAtTimelineIndex,
} from './scrub-markers.js';
import type {
  HaMapPaths,
  HistoryState,
  HomeAssistant,
  TimelinePoint,
  TraceOnMapCardConfig,
} from './types.js';
import { MIN_HA_VERSION } from './types.js';
import {
  clampHours,
  clampZoom,
  formatDateTime,
  formatTime,
  isHaVersionSupported,
  normalizeEntityConfigs,
  parseAspectRatio,
  resolveThemeMode,
} from './utils.js';
import { resolveHassMapRefresh, resolveMapViewState } from './view-state.js';

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
  private _displayPaths: HaMapPaths[] = [];
  private _isLiveView = true;
  private _playbackIndex = 0;
  private _entityColors = new Map<string, string>();
  private _scrubMarkerEls = new Map<string, HTMLElement>();
  private _playback = new PlaybackController();
  private _unsubscribePlayback: (() => void) | null = null;
  private _historyFetchedAt = 0;
  private _fetchToken = 0;
  private _built = false;
  private _buildGeneration = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  static getConfigElement(): HTMLElement {
    return document.createElement('trace-on-map-card-editor');
  }

  static getStubConfig(): Record<string, unknown> {
    return stubCardConfig();
  }

  getCardSize(): number {
    return getCardSizeFromConfig(this._config);
  }

  setConfig(config: TraceOnMapCardConfig): void {
    this._config = normalizeCardConfig(config);
    this._entityColors = assignEntityColors(this._config.entities);
    if (this._built) {
      this._playback.pause();
      this._applyAspectRatio();
      this._renderLegend();
      this._updateTitle();
      void this._ensureMap();
      void this._fetchHistory();
      this._scheduleMapResize();
    } else if (this.isConnected && this._hass) {
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
      void this._ensureMap();
      this._refreshMapFromHass();
      if (
        shouldAutoRefetchHistory({
          playing: this._playback.playing,
          lastFetchedAt: this._historyFetchedAt,
          now: Date.now(),
        })
      ) {
        void this._fetchHistory();
      }
    }
  }

  get hass(): HomeAssistant | null {
    return this._hass;
  }

  connectedCallback(): void {
    if (this._built) {
      this._bindPlayback();
      this._observeResize();
      this._scheduleMapResize();
      this._refreshMapFromHass();
      return;
    }
    if (this._config && this._hass) {
      void this._build();
    }
  }

  disconnectedCallback(): void {
    this._playback.detach();
    this._unbindPlayback();
    this._teardownResize();
    this._buildGeneration++;
  }

  private _bindPlayback(): void {
    if (this._unsubscribePlayback) return;
    this._unsubscribePlayback = this._playback.subscribe((index, playing) => {
      this._onPlayback(index, playing);
    });
  }

  private _unbindPlayback(): void {
    this._unsubscribePlayback?.();
    this._unsubscribePlayback = null;
  }

  private async _build(): Promise<void> {
    // Require both config and hass so version gate / history work on first paint.
    if (this._built || !this._config || !this._hass) return;
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
    this._timeLabelEl = this._shadow.getElementById(
      'time-label'
    ) as HTMLSpanElement;

    this._updateTitle();
    this._playBtn.innerHTML = playIcon();
    this._playBtn.addEventListener('click', () => this._playback.toggle());
    this._sliderEl.addEventListener('input', () => {
      this._playback.scrub(Number(this._sliderEl!.value));
    });

    this._bindPlayback();
    this._applyAspectRatio();
    this._renderLegend();
    this._updatePlayBtn(false);
    this._observeResize();

    await this._ensureMap();
    if (this._mapEl) {
      await this._fetchHistory();
    }
  }

  /** Create ha-map once version + custom element are ready (idempotent). */
  private async _ensureMap(): Promise<void> {
    if (this._mapEl || !this._mapWrap || !this._hass || !this._config) return;
    const generation = this._buildGeneration;

    const haVersion = this._hass.config?.version;
    if (!isHaVersionSupported(haVersion)) {
      this._showAlert(
        `Requires Home Assistant Core ${MIN_HA_VERSION} or newer` +
          (haVersion ? ` (current: ${haVersion})` : '') +
          '.'
      );
      return;
    }

    const ok = await ensureHaMapLoaded();
    if (generation !== this._buildGeneration || !this.isConnected) {
      return;
    }
    if (this._mapEl) return;

    if (!ok) {
      this._showAlert(
        `ha-map is not available. Requires Home Assistant Core ${MIN_HA_VERSION}+. Open a native Map card once, or upgrade HA, then reload.`
      );
      return;
    }

    this._clearAlert();
    this._mapEl = createHaMapElement();
    this._mapEl.classList.add('map-el');
    this._mapWrap.appendChild(this._mapEl);
    this._isLiveView = true;
    this._displayPaths = this._fullPaths;
    this._applyMap(this._fullPaths, true);
    this._scheduleMapResize();
  }

  private _updateTitle(): void {
    const titleEl = this._shadow.getElementById('title');
    if (!titleEl || !this._config) return;
    titleEl.textContent = this._config.title ?? '';
    titleEl.style.display = this._config.title ? '' : 'none';
  }

  private _observeResize(): void {
    if (!this._mapWrap || this._resizeObserver) return;
    if (typeof ResizeObserver === 'undefined') return;
    this._resizeObserver = new ResizeObserver(() => {
      this._scheduleMapResize();
    });
    this._resizeObserver.observe(this._mapWrap);
  }

  private _teardownResize(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._resizeTimer !== null) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
  }

  private _scheduleMapResize(): void {
    if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      this._resizeTimer = null;
      resizeHaMap(this._mapEl);
    }, 100);
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

  private _clearAlert(): void {
    if (!this._alertEl) return;
    this._alertEl.style.display = 'none';
    this._alertEl.textContent = '';
  }

  private async _fetchHistory(): Promise<void> {
    if (!this._hass || !this._config) return;
    const token = ++this._fetchToken;
    if (this._loadingEl) this._loadingEl.style.display = '';

    const hoursToShow = clampHours(this._config.hours_to_show);
    const startTime = new Date(Date.now() - hoursToShow * 3600 * 1000);
    const configs = normalizeEntityConfigs(this._config.entities);
    const entityIdList = historyEntityIds(configs);

    if (entityIdList.length === 0) {
      if (this._loadingEl) this._loadingEl.style.display = 'none';
      this._timelinePoints = [];
      this._fullPaths = [];
      this._displayPaths = [];
      this._playback.setPoints([]);
      this._isLiveView = true;
      this._applyMap([], true);
      return;
    }

    try {
      const path = buildHistoryApiPath(startTime, entityIdList);
      const data: HistoryState[][] | Record<string, HistoryState[]> =
        await this._hass.callApi('GET', path);
      if (token !== this._fetchToken) return;

      this._clearAlert();
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

      if (this._timelinePoints.length > 0) {
        this._playback.scrub(lastIdx);
      } else {
        this._isLiveView = true;
        this._displayPaths = this._fullPaths;
        this._applyMap(this._fullPaths, true);
      }
    } catch (err) {
      console.warn('trace-on-map-card: failed to fetch history', err);
      this._showAlert('Failed to load history. Live positions still shown.');
      this._isLiveView = true;
      this._displayPaths = this._fullPaths;
      this._applyMap(this._fullPaths, true);
    } finally {
      if (this._loadingEl) this._loadingEl.style.display = 'none';
    }
  }

  private _onPlayback(index: number, playing: boolean): void {
    if (this._sliderEl) this._sliderEl.value = String(index);
    this._updateTimeLabel(index);
    this._updatePlayBtn(playing);
    this._playbackIndex = index;

    const hoursToShow = clampHours(this._config?.hours_to_show);
    const clipped = clipTimelineToIndex(this._timelinePoints, index);
    const clippedPaths = buildHaPaths(
      clipped,
      normalizeEntityConfigs(this._config?.entities ?? []),
      hoursToShow,
      this._entityColors
    );

    const view = resolveMapViewState({
      playing,
      timelineIndex: index,
      timelineLength: this._timelinePoints.length,
      fullPaths: this._fullPaths,
      clippedPaths,
    });

    this._isLiveView = view.isLive;
    this._displayPaths = view.paths;
    this._applyMap(view.paths, view.showLiveEntities, view.isLive);
  }

  private _refreshMapFromHass(): void {
    const refresh = resolveHassMapRefresh({
      playing: this._playback.playing,
      isLive: this._isLiveView,
      displayPaths: this._displayPaths,
      fullPaths: this._fullPaths,
    });
    this._applyMap(refresh.paths, refresh.showLiveEntities, this._isLiveView);
  }

  private _applyMap(
    paths: HaMapPaths[],
    showLiveEntities: boolean,
    isLive: boolean = showLiveEntities
  ): void {
    if (!this._mapEl || !this._config) return;
    const configs = normalizeEntityConfigs(this._config.entities);
    const cluster = this._config.cluster !== false;
    const editableLocations = isLive
      ? []
      : buildScrubEditableLocations({
          positions: positionsAtTimelineIndex(
            this._timelinePoints,
            this._playbackIndex
          ),
          names: new Map(
            configs
              .filter((c) => c.entity)
              .map((c) => [
                c.entity,
                c.name ??
                  this._hass?.states[c.entity]?.attributes?.friendly_name ??
                  c.entity,
              ])
          ),
          colors: this._entityColors,
          states: this._hass?.states,
          hassUrl: this._hass?.hassUrl?.bind(this._hass),
          elementCache: this._scrubMarkerEls,
          // Match live ha-map marker chrome (cluster bubble vs floating pin).
          cluster,
        });

    applyMapProps(this._mapEl, {
      hass: this._hass,
      entities: buildHaMapEntities({
        configs,
        showLiveEntities,
        colorMap: this._entityColors,
        states: this._hass?.states,
      }),
      paths,
      editableLocations,
      autoFit: this._config.auto_fit !== false,
      fitZones: !!this._config.fit_zones,
      cluster,
      themeMode: resolveThemeMode(this._config),
      zoom: clampZoom(this._config.default_zoom),
    });
  }

  private _renderLegend(): void {
    if (!this._legendEl || !this._config) return;
    const items = legendItems({
      configs: normalizeEntityConfigs(this._config.entities),
      colorMap: this._entityColors,
      states: this._hass?.states,
    });
    this._legendEl.innerHTML = items
      .map(
        (item) =>
          `<div class="legend-item"><span class="legend-dot" style="background:${item.color}"></span>${escapeHtml(item.name)}</div>`
      )
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

function playIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}

function pauseIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
}

if (!customElements.get('trace-on-map-card')) {
  customElements.define('trace-on-map-card', TraceOnMapCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'trace-on-map-card',
  name: 'Trace on Map Card',
  description: `Location history on the HA default map with timeline playback (requires Core ${MIN_HA_VERSION}+)`,
  preview: true,
  documentationURL: 'https://github.com/farquer/trace-on-map-card',
});

export { TraceOnMapCard };
