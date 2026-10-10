import { ENTITY_COLORS } from './utils.js';
import type { EntityConfig, HomeAssistant, TraceOnMapCardConfig } from './types.js';
import { MAX_HOURS_TO_SHOW, MIN_HOURS_TO_SHOW } from './types.js';
import { clampHours, clampZoom, normalizeEntityConfigs } from './utils.js';

/** Only person (用户) and zone (区域) are offered in the picker. */
export const EDITOR_ENTITY_DOMAINS = ['person', 'zone'] as const;

declare global {
  interface HTMLElementTagNameMap {
    'trace-on-map-card-editor': TraceOnMapCardEditor;
  }
}

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
  private _config: TraceOnMapCardConfig | null = null;
  private _hass: HomeAssistant | null = null;
  private _shadow: ShadowRoot;
  private _pickerLoading = false;
  private _pickerAvailable = false;

  private static readonly PICKER_LOAD_TIMEOUT_MS = 5000;
  private static readonly PICKER_POLL_INTERVAL_MS = 100;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this._ensurePickerLoaded();
  }

  set hass(hass: HomeAssistant) {
    const hadStates =
      !!this._hass?.states && Object.keys(this._hass.states).length > 0;
    this._hass = hass;
    // Update HA pickers in place — avoid full re-render while dropdown is open.
    const pickers = this._shadow.querySelectorAll(
      'ha-entity-picker, ha-selector'
    );
    if (pickers.length > 0) {
      pickers.forEach((el) => {
        (el as HTMLElement & { hass: HomeAssistant }).hass = hass;
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

  get hass(): HomeAssistant | null {
    return this._hass;
  }

  setConfig(config: TraceOnMapCardConfig): void {
    this._config = { ...config };
    this._ensurePickerLoaded();
    this._render();
  }

  private _isElementAvailable(tag: string): boolean {
    if (customElements.get(tag)) return true;
    const probe = document.createElement(tag);
    return probe.constructor.name !== 'HTMLElement';
  }

  private _isPickerAvailable(): boolean {
    if (this._pickerAvailable) return true;
    const available =
      this._isElementAvailable('ha-entity-picker') ||
      this._isElementAvailable('ha-selector');
    if (available) this._pickerAvailable = true;
    return available;
  }

  private _canUseHaEntityPicker(): boolean {
    return this._isElementAvailable('ha-entity-picker');
  }

  private _ensurePickerLoaded(): void {
    if (this._isPickerAvailable()) {
      this._render();
      return;
    }
    if (this._pickerLoading) return;
    this._pickerLoading = true;

    const loadHelpers = (
      window as unknown as { loadCardHelpers?: () => Promise<unknown> }
    ).loadCardHelpers;

    (loadHelpers ? loadHelpers() : Promise.resolve())
      .then(() => {
        if (this._isPickerAvailable()) return;
        return new Promise<void>((resolve) => {
          const deadline =
            Date.now() + TraceOnMapCardEditor.PICKER_LOAD_TIMEOUT_MS;
          const poll = () => {
            if (Date.now() >= deadline || this._isPickerAvailable()) {
              resolve();
            } else {
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

  private _update(partial: Partial<TraceOnMapCardConfig>): void {
    if (!this._config) return;
    this._config = { ...this._config, ...partial };
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
    this._render();
  }

  private _render(): void {
    if (!this._config) return;
    const config = this._config;
    const entities = normalizeEntityConfigs(config.entities ?? []);

    const style = document.createElement('style');
    style.textContent = EDITOR_CSS;

    const root = document.createElement('div');
    root.className = 'editor-root';

    root.appendChild(
      this._textRow('Title', config.title ?? '', (v) =>
        this._update({ title: v || undefined })
      )
    );
    root.appendChild(
      this._numberRow(
        `Hours to show (1–${MAX_HOURS_TO_SHOW})`,
        clampHours(config.hours_to_show),
        MIN_HOURS_TO_SHOW,
        MAX_HOURS_TO_SHOW,
        (v) => this._update({ hours_to_show: clampHours(v) })
      )
    );
    root.appendChild(
      this._optionalNumberRow(
        'Max timeline points (blank = unlimited)',
        config.max_timeline_points,
        1,
        100_000,
        (v) => {
          if (v == null) {
            const next = { ...this._config! };
            delete next.max_timeline_points;
            this._config = next;
            this.dispatchEvent(
              new CustomEvent('config-changed', {
                detail: { config: this._config },
                bubbles: true,
                composed: true,
              })
            );
            this._render();
            return;
          }
          this._update({ max_timeline_points: v });
        }
      )
    );
    root.appendChild(
      this._numberRow(
        'Default zoom',
        clampZoom(config.default_zoom),
        1,
        20,
        (v) => this._update({ default_zoom: clampZoom(v) })
      )
    );
    root.appendChild(
      this._textRow('Aspect ratio (e.g. 16:9)', config.aspect_ratio ?? '', (v) =>
        this._update({ aspect_ratio: v || undefined })
      )
    );

    // Theme
    const themeRow = document.createElement('div');
    themeRow.className = 'form-row';
    const themeLabel = document.createElement('label');
    themeLabel.textContent = 'Theme mode';
    const theme = document.createElement('select');
    for (const mode of ['auto', 'light', 'dark'] as const) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = mode;
      const current =
        config.theme_mode ?? (config.dark_mode ? 'dark' : 'auto');
      if (current === mode) opt.selected = true;
      theme.appendChild(opt);
    }
    theme.addEventListener('change', () => {
      this._update({
        theme_mode: theme.value as TraceOnMapCardConfig['theme_mode'],
      });
    });
    themeRow.appendChild(themeLabel);
    themeRow.appendChild(theme);
    root.appendChild(themeRow);

    // Toggles
    const checks = document.createElement('div');
    checks.className = 'checks';
    checks.appendChild(
      this._check('auto_fit', config.auto_fit !== false, (v) =>
        this._update({ auto_fit: v })
      )
    );
    checks.appendChild(
      this._check('fit_zones', !!config.fit_zones, (v) =>
        this._update({ fit_zones: v })
      )
    );
    checks.appendChild(
      this._check('cluster', config.cluster !== false, (v) =>
        this._update({ cluster: v })
      )
    );
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

  private _textRow(
    label: string,
    value: string,
    onChange: (v: string) => void
  ): HTMLElement {
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

  private _numberRow(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (v: string) => void
  ): HTMLElement {
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

  private _optionalNumberRow(
    label: string,
    value: number | undefined,
    min: number,
    max: number,
    onChange: (v: number | null) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'form-row';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.className = 'max-timeline-points';
    input.placeholder = 'Unlimited';
    input.value = value != null ? String(value) : '';
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      if (!raw) {
        onChange(null);
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min) {
        onChange(null);
        return;
      }
      onChange(Math.min(max, Math.floor(n)));
    });
    row.appendChild(lab);
    row.appendChild(input);
    return row;
  }

  private _check(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void
  ): HTMLElement {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(` ${label}`));
    return wrap;
  }

  private _buildEntityRow(
    ec: EntityConfig,
    idx: number,
    allEntities: EntityConfig[]
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'entity-row';

    const domains = [...EDITOR_ENTITY_DOMAINS];
    let picker: HTMLElement | null = null;

    if (this._canUseHaEntityPicker()) {
      const entityPicker = document.createElement(
        'ha-entity-picker'
      ) as HTMLElement & {
        hass?: HomeAssistant;
        value?: string;
        label?: string;
        includeDomains?: string[];
      };
      entityPicker.value = ec.entity ?? '';
      entityPicker.includeDomains = domains;
      if (this._hass) entityPicker.hass = this._hass;
      picker = entityPicker;
    } else if (this._isElementAvailable('ha-selector')) {
      const selector = document.createElement('ha-selector') as HTMLElement & {
        hass?: HomeAssistant;
        value?: string;
        label?: string;
        selector?: { entity: { domain: string[] } };
      };
      selector.value = ec.entity ?? '';
      selector.selector = { entity: { domain: domains } };
      if (this._hass) selector.hass = this._hass;
      picker = selector;
    }

    if (picker) {
      picker.addEventListener('value-changed', (e: Event) => {
        const newVal = (e as CustomEvent<{ value: string }>).detail?.value ?? '';
        const updated = [...allEntities];
        updated[idx] = { ...updated[idx], entity: newVal };
        this._update({ entities: updated });
      });
      row.appendChild(picker);
    } else {
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
        if (opt.id === ec.entity) o.selected = true;
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
      if (allEntities.length <= 1) return;
      this._update({
        entities: allEntities.filter((_, i) => i !== idx),
      });
    });
    row.appendChild(removeBtn);

    return row;
  }
}

export function listPersonAndZoneEntities(
  hass: HomeAssistant | null | undefined
): Array<{ id: string; label: string }> {
  if (!hass?.states) return [];
  const allowed = new Set<string>(EDITOR_ENTITY_DOMAINS);
  return Object.keys(hass.states)
    .filter((id) => allowed.has(id.split('.')[0] ?? ''))
    .sort()
    .map((id) => ({
      id,
      label:
        hass.states[id]?.attributes?.friendly_name
          ? `${hass.states[id].attributes.friendly_name} (${id})`
          : id,
    }));
}

if (!customElements.get('trace-on-map-card-editor')) {
  customElements.define('trace-on-map-card-editor', TraceOnMapCardEditor);
}

export { TraceOnMapCardEditor };
