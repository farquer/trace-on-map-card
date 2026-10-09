import { escapeAttr } from './dom-utils.js';
import type { EntityConfig, TraceOnMapCardConfig } from './types.js';
import { MAX_HOURS_TO_SHOW, MIN_HOURS_TO_SHOW } from './types.js';
import { clampHours, clampZoom, normalizeEntityConfigs } from './utils.js';

declare global {
  interface HTMLElementTagNameMap {
    'trace-on-map-card-editor': TraceOnMapCardEditor;
  }
}

class TraceOnMapCardEditor extends HTMLElement {
  private _config: TraceOnMapCardConfig | null = null;
  private _shadow: ShadowRoot;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  setConfig(config: TraceOnMapCardConfig): void {
    this._config = { ...config };
    this._render();
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

    const title = this._shadow.getElementById('title') as HTMLInputElement;
    title?.addEventListener('change', () =>
      this._update({ title: title.value || undefined })
    );

    const hours = this._shadow.getElementById('hours') as HTMLInputElement;
    hours?.addEventListener('change', () => {
      this._update({ hours_to_show: clampHours(hours.value) });
    });

    const zoom = this._shadow.getElementById('zoom') as HTMLInputElement;
    zoom?.addEventListener('change', () => {
      this._update({ default_zoom: clampZoom(zoom.value) });
    });

    const aspect = this._shadow.getElementById('aspect') as HTMLInputElement;
    aspect?.addEventListener('change', () => {
      this._update({ aspect_ratio: aspect.value || undefined });
    });

    const theme = this._shadow.getElementById('theme') as HTMLSelectElement;
    theme?.addEventListener('change', () => {
      this._update({ theme_mode: theme.value as TraceOnMapCardConfig['theme_mode'] });
    });

    const autoFit = this._shadow.getElementById('auto_fit') as HTMLInputElement;
    autoFit?.addEventListener('change', () =>
      this._update({ auto_fit: autoFit.checked })
    );
    const fitZones = this._shadow.getElementById('fit_zones') as HTMLInputElement;
    fitZones?.addEventListener('change', () =>
      this._update({ fit_zones: fitZones.checked })
    );
    const cluster = this._shadow.getElementById('cluster') as HTMLInputElement;
    cluster?.addEventListener('change', () =>
      this._update({ cluster: cluster.checked })
    );

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
          const key = (input as HTMLInputElement).dataset.k as
            | 'entity'
            | 'name'
            | 'color';
          const val = (input as HTMLInputElement).value;
          const next: EntityConfig = { ...updated[idx] };
          if (key === 'entity') next.entity = val;
          else if (key === 'name') {
            if (val) next.name = val;
            else delete next.name;
          } else if (key === 'color') {
            if (val) next.color = val;
            else delete next.color;
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

function themeSelected(config: TraceOnMapCardConfig, mode: string): string {
  const current = config.theme_mode ?? (config.dark_mode ? 'dark' : 'auto');
  return current === mode ? 'selected' : '';
}

if (!customElements.get('trace-on-map-card-editor')) {
  customElements.define('trace-on-map-card-editor', TraceOnMapCardEditor);
}

export { TraceOnMapCardEditor };
