import { describe, expect, it, vi } from 'vitest';
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
  });

  it('handles missing hass', () => {
    expect(listPersonAndZoneEntities(null)).toEqual([]);
  });
});

describe('trace-on-map-card-editor', () => {
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
    // Prefer entity select fallback when ha-entity-picker is not registered in jsdom
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
