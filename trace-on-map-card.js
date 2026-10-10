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
/**
 * Compare HA versions.
 * Invalid `a` → -1; invalid `b` → 1; both invalid → 0.
 */
function compareHaVersions(a, b) {
    const pa = parseHaVersion(a);
    const pb = parseHaVersion(b);
    if (!pa && !pb)
        return 0;
    if (!pa)
        return -1;
    if (!pb)
        return 1;
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

/** Only person (用户) and zone (区域) are offered in the picker. */
const EDITOR_ENTITY_DOMAINS = ['person', 'zone'];
const EDITOR_CSS = `
  :host { display: block; }
  .editor-root { padding: 8px 0 16px; }
  .section-title {
    font-size: 0.85em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--secondary-text-color, #727272);
    margin: 16px 0 8px;
  }
  .section-title:first-child { margin-top: 0; }
  .form-row { margin-bottom: 12px; }
  .form-row label {
    display: block;
    font-size: 0.85em;
    color: var(--secondary-text-color, #727272);
    margin-bottom: 4px;
  }
  .form-row input, .form-row select, .form-row ha-textfield {
    width: 100%;
    box-sizing: border-box;
  }
  .form-row input, .form-row select {
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--divider-color, #e0e0e0);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #212121);
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }
  .checks label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9em;
    color: var(--primary-text-color, #212121);
  }
  .entity-row {
    display: grid;
    grid-template-columns: 1fr 110px auto auto;
    gap: 8px;
    align-items: end;
    margin-bottom: 8px;
    padding: 8px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 6px;
    background: var(--secondary-background-color, #f5f5f5);
  }
  .entity-row ha-entity-picker,
  .entity-row ha-selector {
    min-width: 0;
    display: block;
  }
  .entity-name-input { width: 110px; }
  input[type="color"] {
    width: 32px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--divider-color, #ccc);
    border-radius: 4px;
    cursor: pointer;
    background: none;
  }
  .remove-btn {
    background: none;
    border: none;
    color: var(--error-color, #db4437);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    width: 32px;
  }
  .remove-btn:hover {
    background: var(--error-color, #db4437);
    color: #fff;
  }
  .add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px dashed var(--primary-color, #03a9f4);
    border-radius: 6px;
    background: none;
    color: var(--primary-color, #03a9f4);
    cursor: pointer;
    font-size: 0.9em;
    width: 100%;
  }
  .hint {
    font-size: 0.75em;
    color: var(--secondary-text-color, #727272);
    margin: 0 0 8px;
  }
`;
class TraceOnMapCardEditor extends HTMLElement {
    constructor() {
        super();
        this._config = null;
        this._hass = null;
        this._pickerLoading = false;
        this._pickerAvailable = false;
        this._shadow = this.attachShadow({ mode: 'open' });
    }
    connectedCallback() {
        this._ensurePickerLoaded();
    }
    set hass(hass) {
        const hadStates = !!this._hass?.states && Object.keys(this._hass.states).length > 0;
        this._hass = hass;
        // Update HA pickers in place — avoid full re-render while dropdown is open.
        const pickers = this._shadow.querySelectorAll('ha-entity-picker, ha-selector');
        if (pickers.length > 0) {
            pickers.forEach((el) => {
                el.hass = hass;
            });
            return;
        }
        // Fallback <select> options come from hass.states. Lovelace often calls
        // setConfig before hass; re-render once when states first appear.
        const hasStates = !!hass?.states && Object.keys(hass.states).length > 0;
        if (this._config && !hadStates && hasStates) {
            this._render();
        }
    }
    get hass() {
        return this._hass;
    }
    setConfig(config) {
        this._config = { ...config };
        this._ensurePickerLoaded();
        this._render();
    }
    _isElementAvailable(tag) {
        if (customElements.get(tag))
            return true;
        const probe = document.createElement(tag);
        return probe.constructor.name !== 'HTMLElement';
    }
    _isPickerAvailable() {
        if (this._pickerAvailable)
            return true;
        const available = this._isElementAvailable('ha-entity-picker') ||
            this._isElementAvailable('ha-selector');
        if (available)
            this._pickerAvailable = true;
        return available;
    }
    _canUseHaEntityPicker() {
        return this._isElementAvailable('ha-entity-picker');
    }
    _ensurePickerLoaded() {
        if (this._isPickerAvailable()) {
            this._render();
            return;
        }
        if (this._pickerLoading)
            return;
        this._pickerLoading = true;
        const loadHelpers = window.loadCardHelpers;
        (loadHelpers ? loadHelpers() : Promise.resolve())
            .then(() => {
            if (this._isPickerAvailable())
                return;
            return new Promise((resolve) => {
                const deadline = Date.now() + TraceOnMapCardEditor.PICKER_LOAD_TIMEOUT_MS;
                const poll = () => {
                    if (Date.now() >= deadline || this._isPickerAvailable()) {
                        resolve();
                    }
                    else {
                        setTimeout(poll, TraceOnMapCardEditor.PICKER_POLL_INTERVAL_MS);
                    }
                };
                poll();
            });
        })
            .then(() => {
            this._pickerLoading = false;
            this._render();
        })
            .catch((err) => {
            console.warn('trace-on-map-card-editor: picker bootstrap failed', err);
            this._pickerLoading = false;
        });
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
        const style = document.createElement('style');
        style.textContent = EDITOR_CSS;
        const root = document.createElement('div');
        root.className = 'editor-root';
        root.appendChild(this._textRow('Title', config.title ?? '', (v) => this._update({ title: v || undefined })));
        root.appendChild(this._numberRow(`Hours to show (1–${MAX_HOURS_TO_SHOW})`, clampHours(config.hours_to_show), MIN_HOURS_TO_SHOW, MAX_HOURS_TO_SHOW, (v) => this._update({ hours_to_show: clampHours(v) })));
        root.appendChild(this._numberRow('Default zoom', clampZoom(config.default_zoom), 1, 20, (v) => this._update({ default_zoom: clampZoom(v) })));
        root.appendChild(this._textRow('Aspect ratio (e.g. 16:9)', config.aspect_ratio ?? '', (v) => this._update({ aspect_ratio: v || undefined })));
        // Theme
        const themeRow = document.createElement('div');
        themeRow.className = 'form-row';
        const themeLabel = document.createElement('label');
        themeLabel.textContent = 'Theme mode';
        const theme = document.createElement('select');
        for (const mode of ['auto', 'light', 'dark']) {
            const opt = document.createElement('option');
            opt.value = mode;
            opt.textContent = mode;
            const current = config.theme_mode ?? (config.dark_mode ? 'dark' : 'auto');
            if (current === mode)
                opt.selected = true;
            theme.appendChild(opt);
        }
        theme.addEventListener('change', () => {
            this._update({
                theme_mode: theme.value,
            });
        });
        themeRow.appendChild(themeLabel);
        themeRow.appendChild(theme);
        root.appendChild(themeRow);
        // Toggles
        const checks = document.createElement('div');
        checks.className = 'checks';
        checks.appendChild(this._check('auto_fit', config.auto_fit !== false, (v) => this._update({ auto_fit: v })));
        checks.appendChild(this._check('fit_zones', !!config.fit_zones, (v) => this._update({ fit_zones: v })));
        checks.appendChild(this._check('cluster', config.cluster !== false, (v) => this._update({ cluster: v })));
        root.appendChild(checks);
        const entTitle = document.createElement('div');
        entTitle.className = 'section-title';
        entTitle.textContent = 'Entities';
        root.appendChild(entTitle);
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = '可选择 person（用户）或 zone（区域）';
        root.appendChild(hint);
        entities.forEach((ec, idx) => {
            root.appendChild(this._buildEntityRow(ec, idx, entities));
        });
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'add-btn';
        addBtn.textContent = '+ Add person / zone';
        addBtn.addEventListener('click', () => {
            this._update({ entities: [...entities, { entity: '' }] });
        });
        root.appendChild(addBtn);
        this._shadow.innerHTML = '';
        this._shadow.appendChild(style);
        this._shadow.appendChild(root);
    }
    _textRow(label, value, onChange) {
        const row = document.createElement('div');
        row.className = 'form-row';
        const lab = document.createElement('label');
        lab.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.addEventListener('change', () => onChange(input.value));
        row.appendChild(lab);
        row.appendChild(input);
        return row;
    }
    _numberRow(label, value, min, max, onChange) {
        const row = document.createElement('div');
        row.className = 'form-row';
        const lab = document.createElement('label');
        lab.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        input.value = String(value);
        input.addEventListener('change', () => onChange(input.value));
        row.appendChild(lab);
        row.appendChild(input);
        return row;
    }
    _check(label, checked, onChange) {
        const wrap = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        wrap.appendChild(input);
        wrap.appendChild(document.createTextNode(` ${label}`));
        return wrap;
    }
    _buildEntityRow(ec, idx, allEntities) {
        const row = document.createElement('div');
        row.className = 'entity-row';
        const domains = [...EDITOR_ENTITY_DOMAINS];
        let picker = null;
        if (this._canUseHaEntityPicker()) {
            const entityPicker = document.createElement('ha-entity-picker');
            entityPicker.value = ec.entity ?? '';
            entityPicker.includeDomains = domains;
            if (this._hass)
                entityPicker.hass = this._hass;
            picker = entityPicker;
        }
        else if (this._isElementAvailable('ha-selector')) {
            const selector = document.createElement('ha-selector');
            selector.value = ec.entity ?? '';
            selector.selector = { entity: { domain: domains } };
            if (this._hass)
                selector.hass = this._hass;
            picker = selector;
        }
        if (picker) {
            picker.addEventListener('value-changed', (e) => {
                const newVal = e.detail?.value ?? '';
                const updated = [...allEntities];
                updated[idx] = { ...updated[idx], entity: newVal };
                this._update({ entities: updated });
            });
            row.appendChild(picker);
        }
        else {
            // Fallback while HA pickers load: domain-filtered <select> from hass.states
            const select = document.createElement('select');
            select.className = 'entity-picker-fallback';
            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = 'Select person / zone…';
            select.appendChild(empty);
            const options = listPersonAndZoneEntities(this._hass);
            for (const opt of options) {
                const o = document.createElement('option');
                o.value = opt.id;
                o.textContent = opt.label;
                if (opt.id === ec.entity)
                    o.selected = true;
                select.appendChild(o);
            }
            // Keep current value visible even if not in filtered list (yaml leftovers)
            if (ec.entity && !options.some((o) => o.id === ec.entity)) {
                const o = document.createElement('option');
                o.value = ec.entity;
                o.textContent = ec.entity;
                o.selected = true;
                select.appendChild(o);
            }
            select.addEventListener('change', () => {
                const updated = [...allEntities];
                updated[idx] = { ...updated[idx], entity: select.value };
                this._update({ entities: updated });
            });
            row.appendChild(select);
        }
        const nameInput = document.createElement('input');
        nameInput.className = 'entity-name-input';
        nameInput.type = 'text';
        nameInput.placeholder = 'Name';
        nameInput.value = ec.name ?? '';
        nameInput.addEventListener('change', () => {
            const updated = [...allEntities];
            updated[idx] = {
                ...updated[idx],
                name: nameInput.value || undefined,
            };
            this._update({ entities: updated });
        });
        row.appendChild(nameInput);
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = ec.color ?? ENTITY_COLORS[idx % ENTITY_COLORS.length];
        colorInput.title = 'Color';
        colorInput.addEventListener('change', () => {
            const updated = [...allEntities];
            updated[idx] = { ...updated[idx], color: colorInput.value };
            this._update({ entities: updated });
        });
        row.appendChild(colorInput);
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.title = 'Remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
            if (allEntities.length <= 1)
                return;
            this._update({
                entities: allEntities.filter((_, i) => i !== idx),
            });
        });
        row.appendChild(removeBtn);
        return row;
    }
}
TraceOnMapCardEditor.PICKER_LOAD_TIMEOUT_MS = 5000;
TraceOnMapCardEditor.PICKER_POLL_INTERVAL_MS = 100;
function listPersonAndZoneEntities(hass) {
    if (!hass?.states)
        return [];
    const allowed = new Set(EDITOR_ENTITY_DOMAINS);
    return Object.keys(hass.states)
        .filter((id) => allowed.has(id.split('.')[0] ?? ''))
        .sort()
        .map((id) => ({
        id,
        label: hass.states[id]?.attributes?.friendly_name
            ? `${hass.states[id].attributes.friendly_name} (${id})`
            : id,
    }));
}
if (!customElements.get('trace-on-map-card-editor')) {
    customElements.define('trace-on-map-card-editor', TraceOnMapCardEditor);
}

function assertEntitiesPresent(config) {
    if (!config || !config.entities || config.entities.length === 0) {
        throw new Error('trace-on-map-card: "entities" list is required');
    }
}
/** Normalize Lovelace config with defaults and clamps. */
function normalizeCardConfig(config) {
    assertEntitiesPresent(config);
    return {
        ...config,
        auto_fit: config.auto_fit ?? true,
        fit_zones: config.fit_zones ?? false,
        cluster: config.cluster ?? true,
        theme_mode: config.theme_mode ?? (config.dark_mode ? 'dark' : 'auto'),
        hours_to_show: clampHours(config.hours_to_show ?? DEFAULT_HOURS_TO_SHOW),
        default_zoom: clampZoom(config.default_zoom ?? DEFAULT_ZOOM),
    };
}
function getCardSizeFromConfig(config) {
    const ratio = parseAspectRatio(config?.aspect_ratio);
    if (!ratio)
        return 6;
    const ar = (100 * ratio.h) / ratio.w;
    return 1 + Math.floor(ar / 25) || 3;
}
function stubCardConfig() {
    return {
        type: 'custom:trace-on-map-card',
        entities: [{ entity: 'device_tracker.example' }],
        hours_to_show: DEFAULT_HOURS_TO_SHOW,
        auto_fit: true,
        cluster: true,
    };
}

function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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

function normalizeHistories(data) {
    if (data == null)
        return [];
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

function assignEntityColors(entities) {
    const configs = normalizeEntityConfigs(entities);
    const map = new Map();
    configs.forEach((c, i) => {
        const fallback = ENTITY_COLORS[i % ENTITY_COLORS.length];
        map.set(c.entity, sanitizeCssColor(c.color ?? fallback, fallback));
    });
    return map;
}
function historyEntityIds(configs) {
    return configs
        .map((c) => c.entity)
        .filter((id) => id.length > 0 && !isZoneEntity(id));
}
function buildHaMapEntities(options) {
    const { configs, showLiveEntities, colorMap, states } = options;
    return configs
        .filter((c) => c.entity)
        .filter((c) => showLiveEntities || isZoneEntity(c.entity))
        .map((c) => ({
        entity_id: c.entity,
        color: sanitizeCssColor(colorMap.get(c.entity) ?? colorForEntity(c.entity, configs), ENTITY_COLORS[0]),
        name: c.name ?? states?.[c.entity]?.attributes?.friendly_name,
        focus: c.focus,
        label_mode: c.label_mode,
    }));
}
function legendItems(options) {
    return options.configs
        .filter((c) => c.entity && !isZoneEntity(c.entity))
        .map((c) => ({
        entity: c.entity,
        name: c.name ??
            options.states?.[c.entity]?.attributes?.friendly_name ??
            c.entity,
        color: sanitizeCssColor(options.colorMap.get(c.entity) ??
            colorForEntity(c.entity, options.configs), ENTITY_COLORS[0]),
    }));
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
    map.editableLocations = props.editableLocations ?? [];
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

/** Match HA ha-entity-marker floating geometry (frontend ha-entity-marker.ts). */
const FLOATING_MARKER_SIZE = 48;
const FLOATING_TAIL_SIZE = 12;
const FLOATING_TAIL_REACH = Math.round((FLOATING_TAIL_SIZE * Math.SQRT2) / 2);
const FLOATING_GAP = 4;
const FLOATING_DOT_SIZE = 10;
const FLOATING_LIFT = FLOATING_GAP + FLOATING_DOT_SIZE / 2;
/** Match HA ha-map cluster bubble for a single avatar. */
const CLUSTER_AVATAR_SIZE = 32;
const CLUSTER_BUBBLE_PADDING = 6;
const CLUSTER_TAIL_SIZE = 10;
const CLUSTER_TAIL_HEIGHT = Math.round((CLUSTER_TAIL_SIZE * Math.SQRT2) / 2);
/**
 * ha-map editableLocations only pass `size` (center-anchored). Live entity
 * markers use a custom tip anchor. Pad the wrapper so the tip lands on the
 * lat/lng with center anchoring — avatar stays above the path origin.
 */
function centerAnchoredPinSize(contentWidth, contentHeight, tipFromTop) {
    return [contentWidth, Math.max(contentHeight, tipFromTop * 2)];
}
function floatingPinGeometry(markerSize = FLOATING_MARKER_SIZE) {
    const height = markerSize + FLOATING_TAIL_REACH + FLOATING_GAP + FLOATING_DOT_SIZE;
    const tipFromTop = height - FLOATING_DOT_SIZE / 2;
    return {
        contentSize: [markerSize, height],
        tipFromTop,
        elementSize: centerAnchoredPinSize(markerSize, height, tipFromTop),
    };
}
function clusterPinGeometry() {
    const width = CLUSTER_AVATAR_SIZE + 2 * CLUSTER_BUBBLE_PADDING;
    const height = CLUSTER_AVATAR_SIZE + 2 * CLUSTER_BUBBLE_PADDING + CLUSTER_TAIL_HEIGHT;
    // Live cluster tip sits FLOATING_LIFT below the bubble (ha-map _createClusterBubble).
    const tipFromTop = height + FLOATING_LIFT;
    return {
        contentSize: [width, height],
        tipFromTop,
        elementSize: centerAnchoredPinSize(width, height, tipFromTop),
    };
}
/** Last known position per entity up to timeline index (inclusive). */
function positionsAtTimelineIndex(points, index) {
    const clipped = clipTimelineToIndex(points, index);
    const map = new Map();
    for (const p of clipped) {
        map.set(p.entityId, { lat: p.lat, lng: p.lng });
    }
    return map;
}
function initialsFromName(name) {
    return name
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 3)
        .toUpperCase();
}
function resolveEntityPictureUrl(picture, hassUrl) {
    if (typeof picture !== 'string' || !picture)
        return '';
    try {
        return hassUrl ? hassUrl(picture) : picture;
    }
    catch {
        return picture;
    }
}
function applyEntityMarkerProps(marker, options) {
    const m = marker;
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
function createEntityMarkerOrFallback() {
    if (typeof customElements !== 'undefined' &&
        customElements.get('ha-entity-marker')) {
        return {
            marker: document.createElement('ha-entity-marker'),
            isHaMarker: true,
        };
    }
    const marker = document.createElement('div');
    marker.className = 'trace-scrub-avatar';
    return { marker, isHaMarker: false };
}
function styleFallbackAvatar(el, options) {
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
    }
    else {
        el.style.backgroundImage = '';
        el.textContent = initialsFromName(options.name) || '?';
    }
}
/**
 * Build / update a scrub pin that matches HA live markers.
 * editableLocations are center-anchored, so the wrapper is padded until the
 * tip (path origin) sits at the box center — avatar stays above the dot.
 */
function ensureAvatarMarkerElement(cache, options) {
    const styleKey = options.style;
    const cacheKey = `${styleKey}:${options.entityId}`;
    let wrap = cache.get(cacheKey);
    const geometry = styleKey === 'cluster' ? clusterPinGeometry() : floatingPinGeometry();
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
            }
            else {
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
        }
        else {
            const { marker, isHaMarker } = createEntityMarkerOrFallback();
            marker.style.pointerEvents = 'auto';
            if (isHaMarker) {
                applyEntityMarkerProps(marker, {
                    ...options,
                    floating: true,
                    markerSizePx: FLOATING_MARKER_SIZE,
                });
            }
            else {
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
    const marker = wrap.querySelector('ha-entity-marker') ??
        wrap.querySelector('.trace-scrub-avatar');
    if (marker instanceof HTMLElement) {
        if (marker.localName === 'ha-entity-marker') {
            applyEntityMarkerProps(marker, {
                ...options,
                floating: styleKey === 'floating',
                markerSizePx: styleKey === 'cluster' ? CLUSTER_AVATAR_SIZE : FLOATING_MARKER_SIZE,
            });
        }
        else {
            styleFallbackAvatar(marker, {
                name: options.name,
                color: options.color,
                pictureUrl: options.pictureUrl,
                size: styleKey === 'cluster' ? CLUSTER_AVATAR_SIZE : FLOATING_MARKER_SIZE,
            });
        }
    }
    return { element: wrap, elementSize: geometry.elementSize };
}
function buildScrubEditableLocations(options) {
    const style = options.cluster === false ? 'floating' : 'cluster';
    const result = [];
    for (const [entityId, pos] of options.positions) {
        const state = options.states?.[entityId];
        const name = options.names.get(entityId) ??
            state?.attributes?.friendly_name ??
            entityId;
        const color = options.colors.get(entityId) ?? '#0288d1';
        const pictureUrl = resolveEntityPictureUrl(state?.attributes?.entity_picture, options.hassUrl);
        const { element, elementSize } = ensureAvatarMarkerElement(options.elementCache, {
            entityId,
            name,
            color,
            pictureUrl,
            style,
        });
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
            // Live markers come from hass.states (with entity pictures).
            showLiveEntities: true,
            isLive: true,
        };
    }
    return {
        paths: clippedPaths,
        // Hide live markers (they'd stay at "now"); scrub pins use editableLocations
        // styled like HA cluster/floating markers, tip-anchored above path dots.
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
        this._playbackIndex = 0;
        this._entityColors = new Map();
        this._scrubMarkerEls = new Map();
        this._playback = new PlaybackController();
        this._unsubscribePlayback = null;
        this._historyFetchedAt = 0;
        this._fetchToken = 0;
        this._built = false;
        this._buildGeneration = 0;
        this._resizeObserver = null;
        this._resizeTimer = null;
        this._shadow = this.attachShadow({ mode: 'open' });
    }
    static getConfigElement() {
        return document.createElement('trace-on-map-card-editor');
    }
    static getStubConfig() {
        return stubCardConfig();
    }
    getCardSize() {
        return getCardSizeFromConfig(this._config);
    }
    setConfig(config) {
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
        }
        else if (this.isConnected && this._hass) {
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
            void this._ensureMap();
            this._refreshMapFromHass();
            if (shouldAutoRefetchHistory({
                playing: this._playback.playing,
                lastFetchedAt: this._historyFetchedAt,
                now: Date.now(),
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
        this._buildGeneration++;
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
    async _build() {
        // Require both config and hass so version gate / history work on first paint.
        if (this._built || !this._config || !this._hass)
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
        await this._ensureMap();
        if (this._mapEl) {
            await this._fetchHistory();
        }
    }
    /** Create ha-map once version + custom element are ready (idempotent). */
    async _ensureMap() {
        if (this._mapEl || !this._mapWrap || !this._hass || !this._config)
            return;
        const generation = this._buildGeneration;
        const haVersion = this._hass.config?.version;
        if (!isHaVersionSupported(haVersion)) {
            this._showAlert(`Requires Home Assistant Core ${MIN_HA_VERSION} or newer` +
                (haVersion ? ` (current: ${haVersion})` : '') +
                '.');
            return;
        }
        const ok = await ensureHaMapLoaded();
        if (generation !== this._buildGeneration || !this.isConnected) {
            return;
        }
        if (this._mapEl)
            return;
        if (!ok) {
            this._showAlert(`ha-map is not available. Requires Home Assistant Core ${MIN_HA_VERSION}+. Open a native Map card once, or upgrade HA, then reload.`);
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
    async _fetchHistory() {
        if (!this._hass || !this._config)
            return;
        const token = ++this._fetchToken;
        if (this._loadingEl)
            this._loadingEl.style.display = '';
        const hoursToShow = clampHours(this._config.hours_to_show);
        const startTime = new Date(Date.now() - hoursToShow * 3600 * 1000);
        const configs = normalizeEntityConfigs(this._config.entities);
        const entityIdList = historyEntityIds(configs);
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
        this._playbackIndex = index;
        const hoursToShow = clampHours(this._config?.hours_to_show);
        const clipped = clipTimelineToIndex(this._timelinePoints, index);
        const clippedPaths = buildHaPaths(clipped, normalizeEntityConfigs(this._config?.entities ?? []), hoursToShow, this._entityColors);
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
    _refreshMapFromHass() {
        const refresh = resolveHassMapRefresh({
            playing: this._playback.playing,
            isLive: this._isLiveView,
            displayPaths: this._displayPaths,
            fullPaths: this._fullPaths,
        });
        this._applyMap(refresh.paths, refresh.showLiveEntities, this._isLiveView);
    }
    _applyMap(paths, showLiveEntities, isLive = showLiveEntities) {
        if (!this._mapEl || !this._config)
            return;
        const configs = normalizeEntityConfigs(this._config.entities);
        const cluster = this._config.cluster !== false;
        const editableLocations = isLive
            ? []
            : buildScrubEditableLocations({
                positions: positionsAtTimelineIndex(this._timelinePoints, this._playbackIndex),
                names: new Map(configs
                    .filter((c) => c.entity)
                    .map((c) => [
                    c.entity,
                    c.name ??
                        this._hass?.states[c.entity]?.attributes?.friendly_name ??
                        c.entity,
                ])),
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
    _renderLegend() {
        if (!this._legendEl || !this._config)
            return;
        const items = legendItems({
            configs: normalizeEntityConfigs(this._config.entities),
            colorMap: this._entityColors,
            states: this._hass?.states,
        });
        this._legendEl.innerHTML = items
            .map((item) => `<div class="legend-item"><span class="legend-dot" style="background:${item.color}"></span>${escapeHtml(item.name)}</div>`)
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
function playIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}
function pauseIcon() {
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
