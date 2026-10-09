/** Minimum Home Assistant Core version (inclusive). */
const MIN_HA_VERSION = '2026.9.0';
const DEFAULT_HOURS_TO_SHOW = 24;
const MAX_HOURS_TO_SHOW = 720;
const MIN_HOURS_TO_SHOW = 1;
const DEFAULT_ZOOM = 14;
const ANIMATION_TOTAL_MS = 30000;

const ENTITY_COLORS = [
    '#0288d1',
    '#e53935',
    '#43a047',
    '#8e24aa',
    '#fb8c00',
    '#00acc1',
    '#3949ab',
    '#d81b60',
];
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDateTime(date) {
    return (date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' +
        formatTime(date));
}
function clampHours(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return DEFAULT_HOURS_TO_SHOW;
    }
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(parsed))
        return DEFAULT_HOURS_TO_SHOW;
    return Math.min(MAX_HOURS_TO_SHOW, Math.max(MIN_HOURS_TO_SHOW, Math.round(parsed)));
}
function clampZoom(raw) {
    const parsed = typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
            ? Number(raw)
            : NaN;
    if (!Number.isFinite(parsed))
        return DEFAULT_ZOOM;
    return Math.min(20, Math.max(1, Math.round(parsed)));
}
function normalizeEntityConfigs(entities) {
    return entities.map((e) => (typeof e === 'string' ? { entity: e } : { ...e }));
}
function resolveThemeMode(config) {
    if (config.theme_mode)
        return config.theme_mode;
    if (config.dark_mode)
        return 'dark';
    return 'auto';
}
function isZoneEntity(entityId) {
    return entityId.startsWith('zone.');
}
function colorForEntity(entityId, configs, colorMap) {
    if (colorMap?.has(entityId))
        return colorMap.get(entityId);
    const fromConfig = configs.find((c) => c.entity === entityId)?.color;
    if (fromConfig)
        return fromConfig;
    const idx = Math.abs(hashString(entityId)) % ENTITY_COLORS.length;
    return ENTITY_COLORS[idx];
}
function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return h;
}
function parseAspectRatio(ratio) {
    if (!ratio)
        return null;
    const m = String(ratio)
        .trim()
        .match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!m)
        return null;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (!(w > 0 && h > 0))
        return null;
    return { w, h };
}
/** Parse HA version strings like "2026.9.3" or "2026.9.3b0" into [y,m,p]. */
function parseHaVersion(version) {
    if (!version)
        return null;
    const m = String(version)
        .trim()
        .match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m)
        return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function compareHaVersions(a, b) {
    const pa = parseHaVersion(a);
    const pb = parseHaVersion(b);
    if (!pa || !pb)
        return 0;
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i])
            return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
}
/** True when version is >= MIN_HA_VERSION (2026.9.0). */
function isHaVersionSupported(version, minimum = MIN_HA_VERSION) {
    if (!parseHaVersion(version ?? undefined))
        return false;
    return compareHaVersions(String(version), minimum) >= 0;
}

class TraceOnMapCardEditor extends HTMLElement {
    constructor() {
        super();
        this._config = null;
        this._shadow = this.attachShadow({ mode: 'open' });
    }
    setConfig(config) {
        this._config = { ...config };
        this._render();
    }
    _update(partial) {
        if (!this._config)
            return;
        this._config = { ...this._config, ...partial };
        this.dispatchEvent(new CustomEvent('config-changed', {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
        }));
        this._render();
    }
    _render() {
        if (!this._config)
            return;
        const config = this._config;
        const entities = normalizeEntityConfigs(config.entities ?? []);
        this._shadow.innerHTML = `
      <style>
        :host { display: block; padding: 8px 0; }
        .row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
        label { font-size: 0.85em; color: var(--secondary-text-color, #727272); }
        input, select {
          padding: 8px; border-radius: 4px;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #212121);
        }
        .entity-row {
          display: grid; grid-template-columns: 1fr 1fr 80px 32px;
          gap: 6px; align-items: center; margin-bottom: 6px;
        }
        button {
          cursor: pointer; padding: 6px 10px;
          border-radius: 4px; border: 1px solid var(--divider-color, #e0e0e0);
          background: var(--primary-color, #03a9f4); color: #fff;
        }
        button.secondary { background: transparent; color: var(--primary-text-color); }
        button.icon { width: 32px; height: 32px; padding: 0; background: transparent; color: var(--error-color, #c62828); }
        .checks { display: flex; flex-wrap: wrap; gap: 12px; }
        .checks label { display: flex; align-items: center; gap: 6px; color: var(--primary-text-color); }
      </style>
      <div class="row">
        <label>Title</label>
        <input id="title" type="text" value="${escapeAttr(config.title ?? '')}" />
      </div>
      <div class="row">
        <label>Hours to show (1–${MAX_HOURS_TO_SHOW})</label>
        <input id="hours" type="number" min="${MIN_HOURS_TO_SHOW}" max="${MAX_HOURS_TO_SHOW}"
          value="${clampHours(config.hours_to_show)}" />
      </div>
      <div class="row">
        <label>Default zoom</label>
        <input id="zoom" type="number" min="1" max="20" value="${clampZoom(config.default_zoom)}" />
      </div>
      <div class="row">
        <label>Aspect ratio (e.g. 16:9)</label>
        <input id="aspect" type="text" value="${escapeAttr(config.aspect_ratio ?? '')}" placeholder="optional" />
      </div>
      <div class="row">
        <label>Theme mode</label>
        <select id="theme">
          <option value="auto" ${themeSelected(config, 'auto')}>auto</option>
          <option value="light" ${themeSelected(config, 'light')}>light</option>
          <option value="dark" ${themeSelected(config, 'dark')}>dark</option>
        </select>
      </div>
      <div class="row checks">
        <label><input id="auto_fit" type="checkbox" ${config.auto_fit !== false ? 'checked' : ''}/> auto_fit</label>
        <label><input id="fit_zones" type="checkbox" ${config.fit_zones ? 'checked' : ''}/> fit_zones</label>
        <label><input id="cluster" type="checkbox" ${config.cluster !== false ? 'checked' : ''}/> cluster</label>
      </div>
      <div class="row">
        <label>Entities</label>
        <div id="entities"></div>
        <button type="button" id="add-entity">Add entity</button>
      </div>
    `;
        const title = this._shadow.getElementById('title');
        title?.addEventListener('change', () => this._update({ title: title.value || undefined }));
        const hours = this._shadow.getElementById('hours');
        hours?.addEventListener('change', () => {
            this._update({ hours_to_show: clampHours(hours.value) });
        });
        const zoom = this._shadow.getElementById('zoom');
        zoom?.addEventListener('change', () => {
            this._update({ default_zoom: clampZoom(zoom.value) });
        });
        const aspect = this._shadow.getElementById('aspect');
        aspect?.addEventListener('change', () => {
            this._update({ aspect_ratio: aspect.value || undefined });
        });
        const theme = this._shadow.getElementById('theme');
        theme?.addEventListener('change', () => {
            this._update({ theme_mode: theme.value });
        });
        const autoFit = this._shadow.getElementById('auto_fit');
        autoFit?.addEventListener('change', () => this._update({ auto_fit: autoFit.checked }));
        const fitZones = this._shadow.getElementById('fit_zones');
        fitZones?.addEventListener('change', () => this._update({ fit_zones: fitZones.checked }));
        const cluster = this._shadow.getElementById('cluster');
        cluster?.addEventListener('change', () => this._update({ cluster: cluster.checked }));
        const list = this._shadow.getElementById('entities');
        entities.forEach((ec, idx) => {
            const row = document.createElement('div');
            row.className = 'entity-row';
            row.innerHTML = `
        <input data-k="entity" placeholder="entity_id" value="${escapeAttr(ec.entity)}" />
        <input data-k="name" placeholder="name" value="${escapeAttr(ec.name ?? '')}" />
        <input data-k="color" placeholder="#color" value="${escapeAttr(ec.color ?? '')}" />
        <button type="button" class="icon" data-del title="Remove">×</button>
      `;
            row.querySelectorAll('input').forEach((input) => {
                input.addEventListener('change', () => {
                    const updated = [...entities];
                    const key = input.dataset.k;
                    const val = input.value;
                    const next = { ...updated[idx] };
                    if (key === 'entity')
                        next.entity = val;
                    else if (key === 'name') {
                        if (val)
                            next.name = val;
                        else
                            delete next.name;
                    }
                    else if (key === 'color') {
                        if (val)
                            next.color = val;
                        else
                            delete next.color;
                    }
                    updated[idx] = next;
                    this._update({ entities: updated });
                });
            });
            row.querySelector('[data-del]')?.addEventListener('click', () => {
                const updated = entities.filter((_, i) => i !== idx);
                this._update({ entities: updated });
            });
            list?.appendChild(row);
        });
        this._shadow.getElementById('add-entity')?.addEventListener('click', () => {
            this._update({ entities: [...entities, { entity: '' }] });
        });
    }
}
function escapeAttr(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function themeSelected(config, mode) {
    const current = config.theme_mode ?? (config.dark_mode ? 'dark' : 'auto');
    return current === mode ? 'selected' : '';
}
if (!customElements.get('trace-on-map-card-editor')) {
    customElements.define('trace-on-map-card-editor', TraceOnMapCardEditor);
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1(?:\.0)?))?\s*\)$/i;
/**
 * Allow only safe CSS color literals for inline styles.
 * Returns fallback when input is missing or unsafe.
 */
function sanitizeCssColor(raw, fallback = ENTITY_COLORS[0]) {
    if (raw == null)
        return fallback;
    const s = String(raw).trim();
    if (!s || s.length > 64)
        return fallback;
    if (HEX_RE.test(s))
        return s;
    const m = s.match(RGB_RE);
    if (m) {
        const r = Number(m[1]);
        const g = Number(m[2]);
        const b = Number(m[3]);
        if ([r, g, b].some((c) => c > 255))
            return fallback;
        if (m[4] !== undefined) {
            return `rgba(${r}, ${g}, ${b}, ${m[4]})`;
        }
        return `rgb(${r}, ${g}, ${b})`;
    }
    return fallback;
}

function isHaMapAvailable() {
    return typeof customElements !== 'undefined' && !!customElements.get('ha-map');
}
/**
 * Ensure `ha-map` is registered. Tries loadCardHelpers + probe map card when lazy-loaded.
 */
async function ensureHaMapLoaded(timeoutMs = 10000, deps = {}) {
    const isAvailable = deps.isAvailable ?? isHaMapAvailable;
    if (isAvailable())
        return true;
    const loadHelpers = deps.loadHelpers ??
        (async () => {
            try {
                return await window.loadCardHelpers?.();
            }
            catch {
                return undefined;
            }
        });
    try {
        const helpers = await loadHelpers();
        if (helpers?.createCardElement) {
            try {
                await helpers.createCardElement({
                    type: 'map',
                    entities: [],
                    hours_to_show: 0,
                });
            }
            catch {
                // Probe may throw on empty entities; registration may still succeed.
            }
        }
    }
    catch {
        /* ignore */
    }
    if (isAvailable())
        return true;
    const whenDefined = deps.whenDefined ??
        ((name) => customElements.whenDefined(name));
    try {
        await Promise.race([
            whenDefined('ha-map'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
        ]);
    }
    catch {
        /* timeout or missing */
    }
    return isAvailable();
}
/** Best-effort resize / relayout after container size changes. */
function notifyHaMapResize(el) {
    if (!el)
        return;
    const map = el;
    try {
        map.fitMap?.();
    }
    catch {
        /* ignore */
    }
    try {
        map.invalidateSize?.();
    }
    catch {
        /* ignore */
    }
    try {
        map.resize?.();
    }
    catch {
        /* ignore */
    }
    try {
        map.requestUpdate?.();
    }
    catch {
        /* ignore */
    }
    try {
        window.dispatchEvent(new Event('resize'));
    }
    catch {
        /* ignore */
    }
}

/** Coerce history / attribute coordinates to finite numbers (accepts numeric strings). */
function toCoordNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function normalizeHistories(data) {
    return Array.isArray(data)
        ? data
        : Object.values(data);
}
function extractTimelinePoints(data, entityConfigs) {
    const histories = normalizeHistories(data);
    const points = [];
    histories.forEach((entityHistory, index) => {
        if (!entityHistory || entityHistory.length === 0)
            return;
        const entityId = entityHistory.find((s) => s.entity_id)?.entity_id ??
            entityConfigs[index]?.entity;
        if (!entityId)
            return;
        entityHistory.forEach((state) => {
            const lat = toCoordNumber(state.attributes?.latitude);
            const lng = toCoordNumber(state.attributes?.longitude);
            if (lat == null || lng == null)
                return;
            const ts = new Date(state.last_updated ?? state.last_changed).getTime();
            if (!Number.isFinite(ts))
                return;
            points.push({ timestamp: ts, entityId, lat, lng });
        });
    });
    points.sort((a, b) => a.timestamp - b.timestamp);
    return points;
}
function buildHaPaths(points, entityConfigs, hoursToShow, colorMap) {
    const byEntity = new Map();
    for (const p of points) {
        if (!byEntity.has(p.entityId))
            byEntity.set(p.entityId, []);
        byEntity.get(p.entityId).push(p);
    }
    const paths = [];
    for (const [entityId, entityPoints] of byEntity) {
        if (entityPoints.length === 0)
            continue;
        const cfg = entityConfigs.find((c) => c.entity === entityId);
        const rawColor = colorForEntity(entityId, entityConfigs, colorMap);
        paths.push({
            points: entityPoints.map((p) => ({
                point: [p.lat, p.lng],
                timestamp: new Date(p.timestamp),
            })),
            name: cfg?.name ?? entityId,
            color: sanitizeCssColor(rawColor),
            gradualOpacity: 0.8,
            fullDatetime: hoursToShow > 144,
        });
    }
    return paths;
}
/** Keep timeline points with index <= upToIndex. */
function clipTimelineToIndex(points, upToIndex) {
    if (points.length === 0 || upToIndex < 0)
        return [];
    const end = Math.min(upToIndex, points.length - 1);
    return points.slice(0, end + 1);
}

/** Build HA history/period path with encoded entity ids. */
function buildHistoryApiPath(startTime, entityIds) {
    const filtered = entityIds.filter((id) => id.length > 0);
    const encoded = filtered.map((id) => encodeURIComponent(id)).join(',');
    return (`history/period/${startTime.toISOString()}` +
        `?filter_entity_id=${encoded}` +
        `&significant_changes_only=0`);
}
function shouldAutoRefetchHistory(options) {
    if (options.playing)
        return false;
    const interval = options.intervalMs ?? 60000;
    if (options.lastFetchedAt <= 0)
        return true;
    return options.now - options.lastFetchedAt >= interval;
}

function createHaMapElement() {
    const el = document.createElement('ha-map');
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    return el;
}
function applyMapProps(el, props) {
    const map = el;
    // HA 2026.9+ ha-map uses Lit contexts for states; still set .hass when accepted.
    if (props.hass) {
        try {
            map.hass = props.hass;
        }
        catch {
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
    if (props.autoFit)
        el.setAttribute('auto-fit', '');
    else
        el.removeAttribute('auto-fit');
    if (props.fitZones)
        el.setAttribute('fit-zones', '');
    else
        el.removeAttribute('fit-zones');
    if (props.cluster)
        el.setAttribute('cluster-markers', '');
    else
        el.removeAttribute('cluster-markers');
    el.setAttribute('theme-mode', props.themeMode);
}
function resizeHaMap(el) {
    notifyHaMapResize(el);
}

class PlaybackController {
    constructor() {
        this._points = [];
        this._index = 0;
        this._playing = false;
        this._timer = null;
        this._listeners = new Set();
    }
    setPoints(points) {
        this.pause();
        this._points = points;
        this._index = 0;
        this._emit();
    }
    get index() {
        return this._index;
    }
    get playing() {
        return this._playing;
    }
    get length() {
        return this._points.length;
    }
    get isAtEnd() {
        return (this._points.length === 0 || this._index >= this._points.length - 1);
    }
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }
    scrub(index) {
        if (this._points.length === 0)
            return;
        this.pause();
        this._index = Math.min(Math.max(0, Math.round(index)), this._points.length - 1);
        this._emit();
    }
    toggle() {
        if (this._playing)
            this.pause();
        else
            this.play();
    }
    play() {
        if (this._points.length === 0)
            return;
        if (this.isAtEnd) {
            this._index = 0;
            this._emit();
        }
        this._playing = true;
        this._emit();
        this._scheduleNext();
    }
    pause() {
        this._playing = false;
        if (this._timer !== null) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._emit();
    }
    /** Pause and drop listeners (hard teardown). Prefer pause + unsubscribe for reconnect. */
    destroy() {
        this.pause();
        this._listeners.clear();
    }
    /** Soft stop for card disconnect — keeps controller reusable after resubscribe. */
    detach() {
        this.pause();
    }
    _scheduleNext() {
        if (!this._playing)
            return;
        if (this._index >= this._points.length - 1) {
            this.pause();
            return;
        }
        const current = this._points[this._index];
        const next = this._points[this._index + 1];
        const totalTime = this._points[this._points.length - 1].timestamp - this._points[0].timestamp;
        const interval = totalTime > 0
            ? ((next.timestamp - current.timestamp) / totalTime) * ANIMATION_TOTAL_MS
            : 200;
        const delay = Math.min(1000, Math.max(50, interval));
        this._timer = setTimeout(() => {
            this._index++;
            this._emit();
            this._scheduleNext();
        }, delay);
    }
    _emit() {
        for (const listener of this._listeners) {
            listener(this._index, this._playing);
        }
    }
}

/**
 * Decide what the map should show for playback / scrub / live.
 * hass updates must reuse this so they never replace clipped paths mid-scrub.
 */
function resolveMapViewState(input) {
    const { playing, timelineIndex, timelineLength, fullPaths, clippedPaths } = input;
    if (timelineLength === 0) {
        return {
            paths: fullPaths,
            showLiveEntities: true,
            isLive: true,
        };
    }
    const atEnd = timelineIndex >= timelineLength - 1;
    const isLive = atEnd && !playing;
    if (isLive) {
        return {
            paths: fullPaths,
            showLiveEntities: true,
            isLive: true,
        };
    }
    return {
        paths: clippedPaths,
        showLiveEntities: false,
        isLive: false,
    };
}
/** What hass setter should apply without destroying historical scrub/play view. */
function resolveHassMapRefresh(options) {
    if (options.playing || !options.isLive) {
        return {
            paths: options.displayPaths,
            showLiveEntities: false,
        };
    }
    return {
        paths: options.fullPaths,
        showLiveEntities: true,
    };
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
    constructor() {
        super();
        this._config = null;
        this._hass = null;
        this._mapEl = null;
        this._mapWrap = null;
        this._sliderEl = null;
        this._playBtn = null;
        this._timeLabelEl = null;
        this._loadingEl = null;
        this._alertEl = null;
        this._legendEl = null;
        this._timelinePoints = [];
        this._fullPaths = [];
        this._displayPaths = [];
        this._isLiveView = true;
        this._entityColors = new Map();
        this._playback = new PlaybackController();
        this._unsubscribePlayback = null;
        this._historyFetchedAt = 0;
        this._fetchToken = 0;
        this._built = false;
        this._resizeObserver = null;
        this._resizeTimer = null;
        this._shadow = this.attachShadow({ mode: 'open' });
    }
    static getConfigElement() {
        return document.createElement('trace-on-map-card-editor');
    }
    static getStubConfig() {
        return {
            type: 'custom:trace-on-map-card',
            entities: [{ entity: 'device_tracker.example' }],
            hours_to_show: DEFAULT_HOURS_TO_SHOW,
            auto_fit: true,
            cluster: true,
        };
    }
    getCardSize() {
        const ratio = parseAspectRatio(this._config?.aspect_ratio);
        if (!ratio)
            return 6;
        const ar = (100 * ratio.h) / ratio.w;
        return 1 + Math.floor(ar / 25) || 3;
    }
    setConfig(config) {
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
            this._playback.pause();
            this._applyAspectRatio();
            this._renderLegend();
            this._updateTitle();
            // History fetch will scrub to live end and refresh map — do not force full sync here.
            void this._fetchHistory();
            this._scheduleMapResize();
        }
        else if (this.isConnected) {
            void this._build();
        }
    }
    set hass(hass) {
        this._hass = hass;
        if (!this._built && this._config && this.isConnected) {
            void this._build();
            return;
        }
        if (this._built) {
            this._refreshMapFromHass();
            const now = Date.now();
            if (shouldAutoRefetchHistory({
                playing: this._playback.playing,
                lastFetchedAt: this._historyFetchedAt,
                now,
            })) {
                void this._fetchHistory();
            }
        }
    }
    get hass() {
        return this._hass;
    }
    connectedCallback() {
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
    disconnectedCallback() {
        this._playback.detach();
        this._unbindPlayback();
        this._teardownResize();
    }
    _bindPlayback() {
        if (this._unsubscribePlayback)
            return;
        this._unsubscribePlayback = this._playback.subscribe((index, playing) => {
            this._onPlayback(index, playing);
        });
    }
    _unbindPlayback() {
        this._unsubscribePlayback?.();
        this._unsubscribePlayback = null;
    }
    _assignColors() {
        if (!this._config)
            return;
        this._entityColors.clear();
        const configs = normalizeEntityConfigs(this._config.entities);
        configs.forEach((c, i) => {
            this._entityColors.set(c.entity, sanitizeCssColor(c.color ?? ENTITY_COLORS[i % ENTITY_COLORS.length], ENTITY_COLORS[i % ENTITY_COLORS.length]));
        });
    }
    async _build() {
        if (this._built || !this._config)
            return;
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
        this._mapWrap = this._shadow.getElementById('map-wrap');
        this._loadingEl = this._shadow.getElementById('loading');
        this._alertEl = this._shadow.getElementById('alert');
        this._legendEl = this._shadow.getElementById('legend');
        this._sliderEl = this._shadow.getElementById('slider');
        this._playBtn = this._shadow.getElementById('play');
        this._timeLabelEl = this._shadow.getElementById('time-label');
        this._updateTitle();
        this._playBtn.innerHTML = playIcon();
        this._playBtn.addEventListener('click', () => this._playback.toggle());
        this._sliderEl.addEventListener('input', () => {
            this._playback.scrub(Number(this._sliderEl.value));
        });
        this._bindPlayback();
        this._applyAspectRatio();
        this._renderLegend();
        this._updatePlayBtn(false);
        this._observeResize();
        const haVersion = this._hass?.config?.version;
        if (!isHaVersionSupported(haVersion)) {
            this._showAlert(`Requires Home Assistant Core ${MIN_HA_VERSION} or newer` +
                (haVersion ? ` (current: ${haVersion})` : '') +
                '.');
            return;
        }
        const ok = await ensureHaMapLoaded();
        if (!ok) {
            this._showAlert(`ha-map is not available. Requires Home Assistant Core ${MIN_HA_VERSION}+. Open a native Map card once, or upgrade HA, then reload.`);
            return;
        }
        this._mapEl = createHaMapElement();
        this._mapEl.classList.add('map-el');
        this._mapWrap.appendChild(this._mapEl);
        this._isLiveView = true;
        this._displayPaths = this._fullPaths;
        this._applyMap(this._fullPaths, true);
        this._scheduleMapResize();
        await this._fetchHistory();
    }
    _updateTitle() {
        const titleEl = this._shadow.getElementById('title');
        if (!titleEl || !this._config)
            return;
        titleEl.textContent = this._config.title ?? '';
        titleEl.style.display = this._config.title ? '' : 'none';
    }
    _observeResize() {
        if (!this._mapWrap || this._resizeObserver)
            return;
        if (typeof ResizeObserver === 'undefined')
            return;
        this._resizeObserver = new ResizeObserver(() => {
            this._scheduleMapResize();
        });
        this._resizeObserver.observe(this._mapWrap);
    }
    _teardownResize() {
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        if (this._resizeTimer !== null) {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = null;
        }
    }
    _scheduleMapResize() {
        if (this._resizeTimer !== null)
            clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
            this._resizeTimer = null;
            resizeHaMap(this._mapEl);
        }, 100);
    }
    _applyAspectRatio() {
        if (!this._mapWrap || !this._config)
            return;
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
    _showAlert(msg) {
        if (!this._alertEl)
            return;
        this._alertEl.style.display = '';
        this._alertEl.textContent = msg;
    }
    _clearAlert() {
        if (!this._alertEl)
            return;
        this._alertEl.style.display = 'none';
        this._alertEl.textContent = '';
    }
    _getEntityConfigs() {
        return normalizeEntityConfigs(this._config?.entities ?? []);
    }
    async _fetchHistory() {
        if (!this._hass || !this._config)
            return;
        const token = ++this._fetchToken;
        if (this._loadingEl)
            this._loadingEl.style.display = '';
        const hoursToShow = clampHours(this._config.hours_to_show);
        const startTime = new Date(Date.now() - hoursToShow * 3600 * 1000);
        const entityIdList = this._getEntityConfigs()
            .map((e) => e.entity)
            .filter((id) => id && !isZoneEntity(id));
        if (entityIdList.length === 0) {
            if (this._loadingEl)
                this._loadingEl.style.display = 'none';
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
            const data = await this._hass.callApi('GET', path);
            if (token !== this._fetchToken)
                return;
            this._clearAlert();
            const configs = this._getEntityConfigs();
            this._timelinePoints = extractTimelinePoints(data, configs);
            this._fullPaths = buildHaPaths(this._timelinePoints, configs, hoursToShow, this._entityColors);
            this._historyFetchedAt = Date.now();
            this._playback.setPoints(this._timelinePoints);
            const lastIdx = Math.max(0, this._timelinePoints.length - 1);
            if (this._sliderEl) {
                this._sliderEl.max = String(lastIdx);
            }
            const startLbl = this._shadow.getElementById('lbl-start');
            const endLbl = this._shadow.getElementById('lbl-end');
            if (startLbl)
                startLbl.textContent = formatDateTime(startTime);
            if (endLbl)
                endLbl.textContent = formatDateTime(new Date());
            if (this._timelinePoints.length > 0) {
                this._playback.scrub(lastIdx);
            }
            else {
                this._isLiveView = true;
                this._displayPaths = this._fullPaths;
                this._applyMap(this._fullPaths, true);
            }
        }
        catch (err) {
            console.warn('trace-on-map-card: failed to fetch history', err);
            this._showAlert('Failed to load history. Live positions still shown.');
            this._isLiveView = true;
            this._displayPaths = this._fullPaths;
            this._applyMap(this._fullPaths, true);
        }
        finally {
            if (this._loadingEl)
                this._loadingEl.style.display = 'none';
        }
    }
    _onPlayback(index, playing) {
        if (this._sliderEl)
            this._sliderEl.value = String(index);
        this._updateTimeLabel(index);
        this._updatePlayBtn(playing);
        const hoursToShow = clampHours(this._config?.hours_to_show);
        const clipped = clipTimelineToIndex(this._timelinePoints, index);
        const clippedPaths = buildHaPaths(clipped, this._getEntityConfigs(), hoursToShow, this._entityColors);
        const view = resolveMapViewState({
            playing,
            timelineIndex: index,
            timelineLength: this._timelinePoints.length,
            fullPaths: this._fullPaths,
            clippedPaths,
        });
        this._isLiveView = view.isLive;
        this._displayPaths = view.paths;
        this._applyMap(view.paths, view.showLiveEntities);
    }
    /** hass updates must not replace clipped paths while scrubbing/playing. */
    _refreshMapFromHass() {
        const refresh = resolveHassMapRefresh({
            playing: this._playback.playing,
            isLive: this._isLiveView,
            displayPaths: this._displayPaths,
            fullPaths: this._fullPaths,
        });
        this._applyMap(refresh.paths, refresh.showLiveEntities);
    }
    _applyMap(paths, showLiveEntities) {
        if (!this._mapEl || !this._config)
            return;
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
    _buildMapEntities(showLiveEntities) {
        const configs = this._getEntityConfigs();
        return configs
            .filter((c) => c.entity)
            .filter((c) => showLiveEntities || isZoneEntity(c.entity))
            .map((c) => ({
            entity_id: c.entity,
            color: sanitizeCssColor(this._entityColors.get(c.entity) ??
                colorForEntity(c.entity, configs), ENTITY_COLORS[0]),
            name: c.name ?? friendlyName(this._hass?.states[c.entity]),
            focus: c.focus,
            label_mode: c.label_mode,
        }));
    }
    _renderLegend() {
        if (!this._legendEl || !this._config)
            return;
        const configs = this._getEntityConfigs().filter((c) => c.entity && !isZoneEntity(c.entity));
        this._legendEl.innerHTML = configs
            .map((c) => {
            const color = sanitizeCssColor(this._entityColors.get(c.entity) ??
                colorForEntity(c.entity, configs), ENTITY_COLORS[0]);
            const name = c.name ??
                friendlyName(this._hass?.states[c.entity]) ??
                c.entity;
            return `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeHtml(name)}</div>`;
        })
            .join('');
    }
    _updateTimeLabel(index) {
        if (!this._timeLabelEl)
            return;
        const pt = this._timelinePoints[index];
        this._timeLabelEl.textContent = pt
            ? formatTime(new Date(pt.timestamp))
            : '';
    }
    _updatePlayBtn(playing) {
        if (!this._playBtn)
            return;
        this._playBtn.innerHTML = playing ? pauseIcon() : playIcon();
        this._playBtn.title = playing
            ? 'Pause animation'
            : 'Play history animation';
    }
}
function friendlyName(entity) {
    return entity?.attributes?.friendly_name;
}
function playIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}
function pauseIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
