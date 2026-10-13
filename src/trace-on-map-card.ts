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
  DEFAULT_RANGE_MODE,
  canGoNext,
  canGoPrev,
  clampRangeOffset,
  dayOffsetFromYmd,
  parseRangeMode,
  resolveHaTimeZone,
  resolveRangeWindow,
  todayYmd,
  type RangeMode,
  type TimeWindow,
} from './range-window.js';
import {
  buildScrubEditableLocations,
  positionsAtTimelineIndex,
} from './scrub-markers.js';
import {
  HISTORY_WINDOW_MS,
  TIME_SLIDER_MAX,
  buildHistoryWindows,
  downsampleTimeline,
  filterPointsInWindow,
  findWindowIndexForTime,
  indexAtOrBeforeTime,
  mergeTimelinePoints,
  sliderValueToTimestamp,
  timestampToSliderValue,
  type HistoryWindow,
} from './timeline-perf.js';
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
    padding: 14px 16px 8px;
    font-weight: 500;
    font-size: var(--ha-font-size-l, 1.1em);
    line-height: 1.3;
    color: var(--primary-text-color, #212121);
    letter-spacing: 0.01em;
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
    background: color-mix(in srgb, var(--error-color, #c62828) 8%, transparent);
  }
  .timeline-container {
    padding: 12px 16px 12px;
    background: var(--card-background-color, #fff);
    border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  .range-toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0 0 12px;
    padding: 0 0 12px;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }
  .range-modes {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--secondary-background-color, #f5f5f5);
    border: 1px solid var(--divider-color, #e0e0e0);
  }
  .range-mode-btn {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--secondary-text-color, #727272);
    border-radius: 8px;
    padding: 7px 8px;
    font-size: 0.8125em;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .range-mode-btn:hover:not([aria-pressed="true"]) {
    color: var(--primary-text-color, #212121);
    background: color-mix(in srgb, var(--primary-text-color, #212121) 6%, transparent);
  }
  .range-mode-btn[aria-pressed="true"] {
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
  }
  .range-mode-btn:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 1px;
  }
  .range-nav {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 48px;
    align-items: center;
    gap: 8px;
    max-width: 320px;
    width: 100%;
    margin: 0 auto;
    min-height: 55px;
  }
  .range-nav-btn {
    width: 48px;
    height: 55px;
    border: 1px solid var(--divider-color, #e0e0e0);
    background: var(--secondary-background-color, #f5f5f5);
    color: var(--primary-text-color, #212121);
    border-radius: 8px;
    cursor: pointer;
    font-size: 1.2em;
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .range-nav-btn:hover:not(:disabled) {
    border-color: var(--primary-color, #03a9f4);
    background: color-mix(in srgb, var(--primary-color, #03a9f4) 12%, transparent);
  }
  .range-nav-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .range-nav-btn:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 1px;
  }
  .range-label-slot {
    min-width: 0;
    height: 55px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 8px;
    background: var(--secondary-background-color, #f5f5f5);
    overflow: hidden;
  }
  .range-label {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 55px;
    padding: 0 10px;
    text-align: center;
    font-size: 0.8125em;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--primary-text-color, #212121);
    background: transparent;
    border: none;
    box-sizing: border-box;
  }
  .range-date-fallback {
    width: 100%;
    height: 55px;
    box-sizing: border-box;
    border: none;
    background: transparent;
    color: var(--primary-text-color, #212121);
    border-radius: 0;
    padding: 0 8px;
    font-size: 0.8125em;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: center;
    cursor: pointer;
  }
  .range-label-slot:hover {
    border-color: var(--primary-color, #03a9f4);
  }
  .range-label-slot ha-date-input,
  .range-label-slot ha-selector {
    width: 100%;
    height: 55px;
    min-height: 42px;
    align-items: center;
    --mdc-text-field-fill-color: transparent;
    --mdc-text-field-idle-line-color: transparent;
    --mdc-text-field-hover-line-color: transparent;
    --mdc-theme-primary: var(--primary-color, #03a9f4);
    border: none;
    border-radius: 0;
    overflow: hidden;
    box-sizing: border-box;
  }
  .timeline-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .play-pause-btn {
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
    border: none;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    min-width: 34px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--primary-color, #03a9f4) 35%, transparent);
    transition: filter 0.15s ease, transform 0.15s ease;
  }
  .play-pause-btn:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .play-pause-btn:active:not(:disabled) {
    transform: scale(0.96);
  }
  .play-pause-btn:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 2px;
  }
  .timeline-slider-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .timeline-slider {
    width: 100%;
    height: 20px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--primary-color, #03a9f4);
  }
  .timeline-labels {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.7em;
    line-height: 1.25;
    color: var(--secondary-text-color, #727272);
    font-variant-numeric: tabular-nums;
  }
  .timeline-time {
    font-size: 0.8125em;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--primary-text-color, #212121);
    white-space: nowrap;
    min-width: 3.25em;
    text-align: right;
    flex-shrink: 0;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 10px 16px 12px;
    border-top: 1px solid var(--divider-color, #e0e0e0);
    background: color-mix(in srgb, var(--secondary-background-color, #f5f5f5) 55%, transparent);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.8125em;
    line-height: 1.2;
    color: var(--primary-text-color, #212121);
  }
  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .loading-msg {
    padding: 6px 16px 8px;
    font-size: 0.8em;
    line-height: 1.35;
    color: var(--secondary-text-color, #727272);
  }
  .play-pause-btn:disabled,
  .timeline-slider:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: none;
    transform: none;
    box-shadow: none;
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
  private _historyInFlight = false;
  private _built = false;
  private _buildGeneration = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Budget mode: full range + time-mapped slider. */
  private _timeSliderMode = false;
  private _timelineStartMs = 0;
  private _timelineEndMs = 0;
  private _historyWindows: HistoryWindow[] = [];
  private _loadedWindowIds = new Set<string>();
  private _loadingWindowIds = new Set<string>();
  private _playheadTimeMs = 0;
  private _scrubRaf: number | null = null;
  private _statusHint = '';
  private _rangeMode: RangeMode = DEFAULT_RANGE_MODE;
  private _rangeOffset = 0;
  private _rangeLabelEl: HTMLElement | null = null;
  private _rangeLabelSlot: HTMLElement | null = null;
  private _rangeDateEl: HTMLElement | null = null;
  private _rangePrevBtn: HTMLButtonElement | null = null;
  private _rangeNextBtn: HTMLButtonElement | null = null;
  private _rangeNavEl: HTMLElement | null = null;

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
    this._rangeMode =
      parseRangeMode(this._config.range_mode) ?? DEFAULT_RANGE_MODE;
    this._rangeOffset = 0;
    if (this._built) {
      this._playback.pause();
      this._applyAspectRatio();
      this._renderLegend();
      this._updateTitle();
      this._syncRangeToolbar();
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
          inFlight: this._historyInFlight,
          skipForStableRange:
            this._rangeMode !== 'recent' && this._rangeOffset < 0,
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
        <div class="loading-msg" id="loading" style="display:none"></div>
        <div class="timeline-container">
          <div class="range-toolbar" id="range-toolbar">
            <div class="range-modes" role="group" aria-label="Range mode">
              <button type="button" class="range-mode-btn" data-mode="recent">最近</button>
              <button type="button" class="range-mode-btn" data-mode="day">天</button>
              <button type="button" class="range-mode-btn" data-mode="week">周</button>
            </div>
            <div class="range-nav" id="range-nav">
              <button type="button" class="range-nav-btn" id="range-prev" title="Previous">‹</button>
              <div class="range-label-slot" id="range-label-slot">
                <span class="range-label" id="range-label"></span>
              </div>
              <button type="button" class="range-nav-btn" id="range-next" title="Next">›</button>
            </div>
          </div>
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
    this._rangeLabelEl = this._shadow.getElementById('range-label');
    this._rangeLabelSlot = this._shadow.getElementById('range-label-slot');
    this._rangePrevBtn = this._shadow.getElementById(
      'range-prev'
    ) as HTMLButtonElement;
    this._rangeNextBtn = this._shadow.getElementById(
      'range-next'
    ) as HTMLButtonElement;
    this._rangeNavEl = this._shadow.getElementById('range-nav');

    this._updateTitle();
    this._playBtn.innerHTML = playIcon();
    this._playBtn.addEventListener('click', () => this._playback.toggle());
    this._sliderEl.addEventListener('input', () => this._onSliderInput());
    this._sliderEl.addEventListener('change', () => this._flushSliderScrub());
    this._shadow.querySelectorAll('.range-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = parseRangeMode(
          (btn as HTMLElement).dataset.mode
        );
        if (mode) this._setRangeMode(mode);
      });
    });
    this._rangePrevBtn.addEventListener('click', () => this._goRangePrev());
    this._rangeNextBtn.addEventListener('click', () => this._goRangeNext());
    this._syncRangeToolbar();

    this._bindPlayback();
    this._applyAspectRatio();
    this._renderLegend();
    this._updatePlayBtn(false);
    this._setTimelineControlsEnabled(false);
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

  private _budgetMaxPoints(): number | undefined {
    return this._config?.max_timeline_points;
  }

  private _resolveActiveWindow(nowMs = Date.now()): TimeWindow {
    const hoursToShow = clampHours(this._config?.hours_to_show);
    return resolveRangeWindow({
      mode: this._rangeMode,
      nowMs,
      timeZone: this._haTimeZone(),
      offset: this._rangeOffset,
      hoursToShow,
    });
  }

  /** Hours span for path label formatting (fullDatetime threshold). */
  private _windowHours(window: TimeWindow): number {
    return Math.max(
      1,
      Math.round((window.endMs - window.startMs) / 3_600_000)
    );
  }

  private _haTimeZone(): string {
    return resolveHaTimeZone(
      typeof this._hass?.config?.time_zone === 'string'
        ? this._hass.config.time_zone
        : undefined
    );
  }

  private _isCustomElementAvailable(tag: string): boolean {
    return (
      typeof customElements !== 'undefined' &&
      typeof customElements.get === 'function' &&
      !!customElements.get(tag)
    );
  }

  private _ensureDayDateControl(): HTMLElement | null {
    if (!this._rangeLabelSlot) return null;
    if (this._rangeDateEl && this._rangeDateEl.isConnected) {
      return this._rangeDateEl;
    }

    let el: HTMLElement | null = null;
    if (this._isCustomElementAvailable('ha-date-input')) {
      const input = document.createElement('ha-date-input') as HTMLElement & {
        locale?: unknown;
        value?: string;
        max?: string;
      };
      if (this._hass?.locale) input.locale = this._hass.locale;
      el = input;
    } else if (this._isCustomElementAvailable('ha-selector')) {
      const sel = document.createElement('ha-selector') as HTMLElement & {
        hass?: HomeAssistant;
        selector?: { date: Record<string, never> };
        value?: string;
      };
      sel.selector = { date: {} };
      if (this._hass) sel.hass = this._hass;
      el = sel;
    } else {
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'range-date-fallback';
      input.setAttribute('aria-label', 'Select day');
      el = input;
    }

    el.addEventListener('value-changed', (e: Event) => {
      const value = (e as CustomEvent<{ value?: string }>).detail?.value;
      if (typeof value === 'string' && value) this._setDayFromYmd(value);
    });
    el.addEventListener('change', () => {
      const value =
        'value' in el!
          ? String((el as HTMLInputElement | { value?: string }).value ?? '')
          : '';
      if (value) this._setDayFromYmd(value);
    });

    this._rangeLabelSlot.appendChild(el);
    this._rangeDateEl = el;
    return el;
  }

  private _syncDayDateControl(ymd: string): void {
    const el = this._ensureDayDateControl();
    if (!el) return;
    const max = todayYmd(Date.now(), this._haTimeZone());
    if (el instanceof HTMLInputElement) {
      el.max = max;
      if (el.value !== ymd) el.value = ymd;
      return;
    }
    const widget = el as HTMLElement & {
      value?: string;
      max?: string;
      locale?: unknown;
      hass?: HomeAssistant;
    };
    if ('max' in widget) widget.max = max;
    if (this._hass?.locale && 'locale' in widget) {
      widget.locale = this._hass.locale;
    }
    if (this._hass && 'hass' in widget) widget.hass = this._hass;
    if (widget.value !== ymd) widget.value = ymd;
  }

  private _syncRangeToolbar(window?: TimeWindow): void {
    const w = window ?? this._resolveActiveWindow();
    this._shadow.querySelectorAll('.range-mode-btn').forEach((btn) => {
      const mode = (btn as HTMLElement).dataset.mode;
      btn.setAttribute(
        'aria-pressed',
        mode === this._rangeMode ? 'true' : 'false'
      );
    });
    if (this._rangeNavEl) {
      this._rangeNavEl.style.display =
        this._rangeMode === 'recent' ? 'none' : '';
    }
    if (this._rangePrevBtn) {
      this._rangePrevBtn.disabled = !canGoPrev(this._rangeMode);
    }
    if (this._rangeNextBtn) {
      this._rangeNextBtn.disabled = !canGoNext(
        this._rangeMode,
        this._rangeOffset
      );
    }

    const dayMode = this._rangeMode === 'day';
    if (this._rangeLabelEl) {
      this._rangeLabelEl.style.display = dayMode ? 'none' : '';
      if (!dayMode) this._rangeLabelEl.textContent = w.label;
    }
    if (this._rangeDateEl) {
      this._rangeDateEl.style.display = dayMode ? '' : 'none';
    }
    if (dayMode) {
      this._syncDayDateControl(w.label);
    }
  }

  private _setDayFromYmd(ymd: string): void {
    if (this._rangeMode !== 'day') return;
    const offset = dayOffsetFromYmd(Date.now(), this._haTimeZone(), ymd);
    if (offset == null || offset === this._rangeOffset) {
      // Keep control in sync if future date was clamped to today
      this._syncRangeToolbar();
      return;
    }
    this._rangeOffset = offset;
    this._playback.pause();
    this._syncRangeToolbar();
    void this._fetchHistory();
  }

  private _setRangeMode(mode: RangeMode): void {
    if (mode === this._rangeMode) return;
    this._rangeMode = mode;
    this._rangeOffset = 0;
    this._playback.pause();
    this._syncRangeToolbar();
    void this._fetchHistory();
  }

  private _goRangePrev(): void {
    if (!canGoPrev(this._rangeMode)) return;
    this._rangeOffset = clampRangeOffset(this._rangeOffset - 1);
    this._playback.pause();
    this._syncRangeToolbar();
    void this._fetchHistory();
  }

  private _goRangeNext(): void {
    if (!canGoNext(this._rangeMode, this._rangeOffset)) return;
    this._rangeOffset = clampRangeOffset(this._rangeOffset + 1);
    this._playback.pause();
    this._syncRangeToolbar();
    void this._fetchHistory();
  }

  private _setLoadingVisible(visible: boolean, text = 'Loading history…'): void {
    if (!this._loadingEl) return;
    if (visible) {
      this._statusHint = '';
      this._loadingEl.textContent = text;
      this._loadingEl.style.display = '';
      return;
    }
    if (this._statusHint) {
      this._loadingEl.textContent = this._statusHint;
      this._loadingEl.style.display = '';
      return;
    }
    this._loadingEl.style.display = 'none';
    this._loadingEl.textContent = '';
  }

  private _setTimelineControlsEnabled(enabled: boolean): void {
    if (this._sliderEl) this._sliderEl.disabled = !enabled;
    if (this._playBtn) this._playBtn.disabled = !enabled;
  }

  private _applyEmptyTimelineState(message: string): void {
    this._statusHint = message;
    this._setTimelineControlsEnabled(false);
    this._setLoadingVisible(false);
  }

  private _onSliderInput(): void {
    if (this._scrubRaf != null) return;
    this._scrubRaf = requestAnimationFrame(() => {
      this._scrubRaf = null;
      this._flushSliderScrub();
    });
  }

  private _flushSliderScrub(): void {
    if (this._scrubRaf != null) {
      cancelAnimationFrame(this._scrubRaf);
      this._scrubRaf = null;
    }
    if (!this._sliderEl) return;
    const value = Number(this._sliderEl.value);
    if (this._timeSliderMode) {
      const t = sliderValueToTimestamp(
        value,
        0,
        TIME_SLIDER_MAX,
        this._timelineStartMs,
        this._timelineEndMs
      );
      this._scrubToTime(t);
      return;
    }
    this._playback.scrub(value);
  }

  private _scrubToTime(t: number): void {
    this._playheadTimeMs = t;
    void this._ensureWindowsAroundTime(t);
    const idx = indexAtOrBeforeTime(this._timelinePoints, t);
    if (idx < 0) {
      this._playbackIndex = 0;
      if (this._sliderEl && this._timeSliderMode) {
        this._sliderEl.value = String(
          timestampToSliderValue(
            t,
            0,
            TIME_SLIDER_MAX,
            this._timelineStartMs,
            this._timelineEndMs
          )
        );
      }
      this._updateTimeLabelFromMs(t);
      this._isLiveView = false;
      this._displayPaths = [];
      this._applyMap([], false, false);
      return;
    }
    this._playback.scrub(idx);
  }

  private async _fetchHistory(): Promise<void> {
    if (!this._hass || !this._config) return;
    const token = ++this._fetchToken;
    this._historyInFlight = true;
    this._setLoadingVisible(true);

    const window = this._resolveActiveWindow();
    this._syncRangeToolbar(window);
    const hoursToShow = this._windowHours(window);
    const { startMs, endMs } = window;
    const configs = normalizeEntityConfigs(this._config.entities);
    const entityIdList = historyEntityIds(configs);
    const budget = this._budgetMaxPoints();

    if (entityIdList.length === 0) {
      this._resetTimelineState();
      this._isLiveView = true;
      this._applyMap([], true);
      this._applyEmptyTimelineState('No trackable entities (zones only).');
      if (token === this._fetchToken) this._historyInFlight = false;
      return;
    }

    try {
      if (budget == null) {
        await this._fetchHistoryUnlimited(
          token,
          startMs,
          endMs,
          hoursToShow,
          configs,
          entityIdList
        );
      } else {
        await this._fetchHistoryBudget(
          token,
          startMs,
          endMs,
          hoursToShow,
          configs,
          entityIdList,
          budget
        );
      }
    } catch (err) {
      console.warn('trace-on-map-card: failed to fetch history', err);
      this._showAlert('Failed to load history. Live positions still shown.');
      this._isLiveView = true;
      this._displayPaths = this._fullPaths;
      this._applyMap(this._fullPaths, true);
      if (this._timelinePoints.length === 0) {
        this._applyEmptyTimelineState('No location history in this period.');
      }
    } finally {
      if (token === this._fetchToken) {
        this._historyInFlight = false;
        this._setLoadingVisible(false);
      }
    }
  }

  private _resetTimelineState(): void {
    this._timelinePoints = [];
    this._fullPaths = [];
    this._displayPaths = [];
    this._playback.setPoints([]);
    this._loadedWindowIds.clear();
    this._loadingWindowIds.clear();
    this._historyWindows = [];
    this._timeSliderMode = false;
  }

  private async _fetchHistoryUnlimited(
    token: number,
    startMs: number,
    endMs: number,
    hoursToShow: number,
    configs: ReturnType<typeof normalizeEntityConfigs>,
    entityIdList: string[]
  ): Promise<void> {
    const path = buildHistoryApiPath(new Date(startMs), entityIdList);
    const data: HistoryState[][] | Record<string, HistoryState[]> =
      await this._hass!.callApi('GET', path);
    if (token !== this._fetchToken) return;

    this._clearAlert();
    this._timeSliderMode = false;
    this._historyWindows = [];
    this._loadedWindowIds.clear();
    this._timelineStartMs = startMs;
    this._timelineEndMs = endMs;
    let points = extractTimelinePoints(data, configs);
    // Day/week: HA history has no end bound — clip to half-open [start, end).
    if (this._rangeMode !== 'recent') {
      points = filterPointsInWindow(points, startMs, endMs, false);
    }
    this._timelinePoints = points;
    this._applyLoadedPoints(hoursToShow, configs, startMs, endMs, false);
  }

  private async _fetchHistoryBudget(
    token: number,
    startMs: number,
    endMs: number,
    hoursToShow: number,
    configs: ReturnType<typeof normalizeEntityConfigs>,
    entityIdList: string[],
    budget: number
  ): Promise<void> {
    this._clearAlert();
    this._timeSliderMode = true;
    this._timelineStartMs = startMs;
    this._timelineEndMs = endMs;
    this._historyWindows = buildHistoryWindows(
      startMs,
      endMs,
      HISTORY_WINDOW_MS
    );
    this._loadedWindowIds.clear();
    this._loadingWindowIds.clear();
    this._timelinePoints = [];

    const last = this._historyWindows[this._historyWindows.length - 1];
    if (!last) {
      this._applyEmptyTimelineState('No location history in this period.');
      return;
    }

    await this._loadHistoryWindow(
      token,
      last,
      true,
      hoursToShow,
      configs,
      entityIdList,
      budget
    );
    if (token !== this._fetchToken) return;

    this._applyLoadedPoints(hoursToShow, configs, startMs, endMs, true);
  }

  private async _loadHistoryWindow(
    token: number,
    window: HistoryWindow,
    isLast: boolean,
    hoursToShow: number,
    configs: ReturnType<typeof normalizeEntityConfigs>,
    entityIdList: string[],
    budget: number
  ): Promise<void> {
    if (this._loadedWindowIds.has(window.id)) return;
    if (this._loadingWindowIds.has(window.id)) return;
    this._loadingWindowIds.add(window.id);
    try {
      const path = buildHistoryApiPath(new Date(window.startMs), entityIdList);
      const data: HistoryState[][] | Record<string, HistoryState[]> =
        await this._hass!.callApi('GET', path);
      if (token !== this._fetchToken) return;

      let points = extractTimelinePoints(data, configs);
      points = filterPointsInWindow(
        points,
        window.startMs,
        window.endMs,
        isLast
      );
      if (points.length > budget) {
        points = downsampleTimeline(points, budget);
      }
      this._timelinePoints = mergeTimelinePoints(this._timelinePoints, points);
      this._loadedWindowIds.add(window.id);
    } finally {
      this._loadingWindowIds.delete(window.id);
    }
  }

  private _applyLoadedPoints(
    hoursToShow: number,
    configs: ReturnType<typeof normalizeEntityConfigs>,
    startMs: number,
    endMs: number,
    timeSlider: boolean
  ): void {
    this._fullPaths = buildHaPaths(
      this._timelinePoints,
      configs,
      hoursToShow,
      this._entityColors
    );
    this._historyFetchedAt = Date.now();
    this._playback.setPoints(this._timelinePoints);

    const startLbl = this._shadow.getElementById('lbl-start');
    const endLbl = this._shadow.getElementById('lbl-end');
    if (startLbl) startLbl.textContent = formatDateTime(new Date(startMs));
    if (endLbl) endLbl.textContent = formatDateTime(new Date(endMs));

    if (this._sliderEl) {
      if (timeSlider) {
        this._sliderEl.min = '0';
        this._sliderEl.max = String(TIME_SLIDER_MAX);
        this._sliderEl.value = String(TIME_SLIDER_MAX);
      } else {
        const lastIdx = Math.max(0, this._timelinePoints.length - 1);
        this._sliderEl.min = '0';
        this._sliderEl.max = String(lastIdx);
        this._sliderEl.value = String(lastIdx);
      }
    }

    if (this._timelinePoints.length === 0) {
      this._isLiveView = true;
      this._displayPaths = this._fullPaths;
      this._applyMap(this._fullPaths, true);
      this._applyEmptyTimelineState('No location history in this period.');
      return;
    }

    this._statusHint = '';
    this._setTimelineControlsEnabled(true);
    this._playheadTimeMs = endMs;
    const lastIdx = this._timelinePoints.length - 1;
    this._playback.scrub(lastIdx);
  }

  private async _ensureWindowsAroundTime(t: number): Promise<void> {
    const budget = this._budgetMaxPoints();
    if (
      budget == null ||
      !this._timeSliderMode ||
      !this._hass ||
      !this._config ||
      this._historyWindows.length === 0
    ) {
      return;
    }
    const idx = findWindowIndexForTime(this._historyWindows, t);
    if (idx < 0) return;
    const targets = [idx - 1, idx, idx + 1].filter(
      (i) => i >= 0 && i < this._historyWindows.length
    );
    const token = this._fetchToken;
    const hoursToShow = clampHours(this._config.hours_to_show);
    const configs = normalizeEntityConfigs(this._config.entities);
    const entityIdList = historyEntityIds(configs);
    const playhead = this._playheadTimeMs;

    let loadedAny = false;
    for (const i of targets) {
      const w = this._historyWindows[i]!;
      if (this._loadedWindowIds.has(w.id) || this._loadingWindowIds.has(w.id)) {
        continue;
      }
      this._setLoadingVisible(true, 'Loading segment…');
      await this._loadHistoryWindow(
        token,
        w,
        i === this._historyWindows.length - 1,
        hoursToShow,
        configs,
        entityIdList,
        budget
      );
      loadedAny = true;
    }
    if (token !== this._fetchToken) return;
    if (loadedAny) {
      this._fullPaths = buildHaPaths(
        this._timelinePoints,
        configs,
        hoursToShow,
        this._entityColors
      );
      this._playback.setPoints(this._timelinePoints);
      const idxAfter = indexAtOrBeforeTime(this._timelinePoints, playhead);
      if (idxAfter >= 0) this._playback.scrub(idxAfter);
      this._setLoadingVisible(false);
    }
  }

  private _onPlayback(index: number, playing: boolean): void {
    this._playbackIndex = index;
    const pt = this._timelinePoints[index];
    if (pt) this._playheadTimeMs = pt.timestamp;

    if (this._sliderEl) {
      if (this._timeSliderMode) {
        this._sliderEl.value = String(
          timestampToSliderValue(
            this._playheadTimeMs || this._timelineEndMs,
            0,
            TIME_SLIDER_MAX,
            this._timelineStartMs,
            this._timelineEndMs
          )
        );
      } else {
        this._sliderEl.value = String(index);
      }
    }
    this._updateTimeLabel(index);
    this._updatePlayBtn(playing);

    if (this._timeSliderMode && playing) {
      void this._ensureWindowsAroundTime(this._playheadTimeMs);
    }

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

  private _updateTimeLabelFromMs(t: number): void {
    if (!this._timeLabelEl) return;
    this._timeLabelEl.textContent = formatTime(new Date(t));
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
