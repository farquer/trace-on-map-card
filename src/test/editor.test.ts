import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EDITOR_ENTITY_DOMAINS,
  listPersonAndZoneEntities,
  TraceOnMapCardEditor,
} from '../editor';

describe('EDITOR_ENTITY_DOMAINS', () => {
  it('only allows person and zone', () => {
    expect(EDITOR_ENTITY_DOMAINS).toEqual(['person', 'zone']);
  });
});

describe('listPersonAndZoneEntities', () => {
  it('filters hass.states to person/zone', () => {
    const list = listPersonAndZoneEntities({
      states: {
        'person.alice': {
          entity_id: 'person.alice',
          state: 'home',
          attributes: { friendly_name: 'Alice' },
        },
        'zone.home': {
          entity_id: 'zone.home',
          state: 'zoning',
          attributes: { friendly_name: 'Home' },
        },
        'device_tracker.phone': {
          entity_id: 'device_tracker.phone',
          state: 'home',
          attributes: {},
        },
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: {},
        },
      },
      callApi: vi.fn(),
    });
    expect(list.map((x) => x.id)).toEqual(['person.alice', 'zone.home']);
    expect(list[0].label).toContain('Alice');
    expect(list[1].label).toContain('Home');
  });

  it('handles missing hass and entities without friendly_name', () => {
    expect(listPersonAndZoneEntities(null)).toEqual([]);
    expect(listPersonAndZoneEntities(undefined)).toEqual([]);
    const list = listPersonAndZoneEntities({
      states: {
        'person.raw': {
          entity_id: 'person.raw',
          state: 'home',
          attributes: {},
        },
      },
      callApi: vi.fn(),
    });
    expect(list).toEqual([{ id: 'person.raw', label: 'person.raw' }]);
  });
});

describe('trace-on-map-card-editor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is registered', () => {
    expect(customElements.get('trace-on-map-card-editor')).toBeTruthy();
    expect(TraceOnMapCardEditor).toBeTruthy();
  });

  it('renders entity select filtered by person/zone when picker unavailable', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as TraceOnMapCardEditor;
    document.body.appendChild(el);
    el.hass = {
      states: {
        'person.bob': {
          entity_id: 'person.bob',
          state: 'home',
          attributes: { friendly_name: 'Bob' },
        },
        'zone.work': {
          entity_id: 'zone.work',
          state: 'zoning',
          attributes: {},
        },
        'sensor.temp': {
          entity_id: 'sensor.temp',
          state: '20',
          attributes: {},
        },
      },
      callApi: vi.fn(),
    };
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'person.bob' }],
      hours_to_show: 24,
    });

    const select = el.shadowRoot!.querySelector(
      'select.entity-picker-fallback'
    ) as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    const values = [...select!.options].map((o) => o.value).filter(Boolean);
    expect(values).toContain('person.bob');
    expect(values).toContain('zone.work');
    expect(values).not.toContain('sensor.temp');

    const hours = el.shadowRoot!.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    expect(hours).toBeTruthy();
    expect(hours.max).toBe('720');

    el.remove();
  });

  it('fills fallback options when hass arrives after setConfig', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as TraceOnMapCardEditor;
    document.body.appendChild(el);
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: '' }],
    });

    let select = el.shadowRoot!.querySelector(
      'select.entity-picker-fallback'
    ) as HTMLSelectElement;
    expect(
      [...select.options].map((o) => o.value).filter(Boolean)
    ).toHaveLength(0);

    el.hass = {
      states: {
        'person.late': {
          entity_id: 'person.late',
          state: 'home',
          attributes: { friendly_name: 'Late' },
        },
        'zone.home': {
          entity_id: 'zone.home',
          state: 'zoning',
          attributes: {},
        },
        'light.x': {
          entity_id: 'light.x',
          state: 'on',
          attributes: {},
        },
      },
      callApi: vi.fn(),
    };

    select = el.shadowRoot!.querySelector(
      'select.entity-picker-fallback'
    ) as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value).filter(Boolean);
    expect(values).toEqual(['person.late', 'zone.home']);
    el.remove();
  });

  it('keeps yaml leftover entity id visible even if not person/zone', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as TraceOnMapCardEditor;
    document.body.appendChild(el);
    el.hass = {
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'home',
          attributes: {},
        },
      },
      callApi: vi.fn(),
    };
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'device_tracker.old' }],
    });
    const select = el.shadowRoot!.querySelector(
      'select.entity-picker-fallback'
    ) as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain('device_tracker.old');
    expect(select.value).toBe('device_tracker.old');
    el.remove();
  });

  it('emits config-changed when fallback entity select changes', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as TraceOnMapCardEditor;
    document.body.appendChild(el);
    const events: Array<{ entities: Array<{ entity: string }> }> = [];
    el.addEventListener('config-changed', (e) => {
      events.push((e as CustomEvent).detail.config);
    });
    el.hass = {
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'home',
          attributes: {},
        },
        'person.b': {
          entity_id: 'person.b',
          state: 'home',
          attributes: {},
        },
      },
      callApi: vi.fn(),
    };
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'person.a' }],
    });
    const select = el.shadowRoot!.querySelector(
      'select.entity-picker-fallback'
    ) as HTMLSelectElement;
    select.value = 'person.b';
    select.dispatchEvent(new Event('change'));
    expect(events.at(-1)?.entities[0]?.entity).toBe('person.b');
    el.remove();
  });

  it('adds and removes entities via buttons', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as TraceOnMapCardEditor;
    document.body.appendChild(el);
    const events: Array<{ entities: unknown[] }> = [];
    el.addEventListener('config-changed', (e) => {
      events.push((e as CustomEvent).detail.config);
    });
    el.hass = { states: {}, callApi: vi.fn() };
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'person.a' }],
    });

    const add = el.shadowRoot!.querySelector('.add-btn') as HTMLButtonElement;
    add.click();
    expect(events.at(-1)?.entities).toHaveLength(2);

    // Cannot remove last remaining row: two rows → remove one → one left
    const removeBtns = [
      ...el.shadowRoot!.querySelectorAll('.remove-btn'),
    ] as HTMLButtonElement[];
    expect(removeBtns.length).toBe(2);
    removeBtns[1].click();
    expect(events.at(-1)?.entities).toHaveLength(1);

    // Last remove is a no-op
    const lastRemove = el.shadowRoot!.querySelector(
      '.remove-btn'
    ) as HTMLButtonElement;
    const before = events.length;
    lastRemove.click();
    expect(events.length).toBe(before);
    el.remove();
  });

  it('uses ha-entity-picker with person/zone domains when registered', () => {
    if (!customElements.get('ha-entity-picker')) {
      customElements.define(
        'ha-entity-picker',
        class extends HTMLElement {
          hass?: unknown;
          value?: string;
          includeDomains?: string[];
        }
      );
    }
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as TraceOnMapCardEditor;
    document.body.appendChild(el);
    const events: Array<{ entities: Array<{ entity: string }> }> = [];
    el.addEventListener('config-changed', (e) => {
      events.push((e as CustomEvent).detail.config);
    });
    el.hass = {
      states: {
        'person.p': {
          entity_id: 'person.p',
          state: 'home',
          attributes: {},
        },
      },
      callApi: vi.fn(),
    };
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'person.p' }],
    });

    expect(el.shadowRoot!.querySelector('select.entity-picker-fallback')).toBeNull();
    const picker = el.shadowRoot!.querySelector(
      'ha-entity-picker'
    ) as HTMLElement & {
      value?: string;
      includeDomains?: string[];
      hass?: unknown;
    };
    expect(picker).toBeTruthy();
    expect(picker.value).toBe('person.p');
    expect(picker.includeDomains).toEqual(['person', 'zone']);
    expect(picker.hass).toBeTruthy();

    picker.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: 'zone.home' },
        bubbles: true,
        composed: true,
      })
    );
    expect(events.at(-1)?.entities[0]?.entity).toBe('zone.home');
    el.remove();
  });

  it('emits config-changed when hours change', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as TraceOnMapCardEditor;
    document.body.appendChild(el);
    const events: unknown[] = [];
    el.addEventListener('config-changed', (e) => {
      events.push((e as CustomEvent).detail.config);
    });
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['person.a'],
      hours_to_show: 24,
    });
    const hours = el.shadowRoot!.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    hours.value = '1000';
    hours.dispatchEvent(new Event('change'));
    expect(events.length).toBeGreaterThan(0);
    expect((events.at(-1) as { hours_to_show: number }).hours_to_show).toBe(
      720
    );
    el.remove();
  });
});
