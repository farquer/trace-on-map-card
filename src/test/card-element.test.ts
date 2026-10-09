import { afterEach, describe, expect, it, vi } from 'vitest';
import { TraceOnMapCard } from '../trace-on-map-card';

function mockHaMap(): void {
  if (!customElements.get('ha-map')) {
    customElements.define(
      'ha-map',
      class extends HTMLElement {
        entities?: unknown;
        paths?: unknown;
      }
    );
  }
}

async function waitFor(
  assertFn: () => void,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      assertFn();
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  throw lastErr ?? new Error('waitFor timeout');
}

describe('TraceOnMapCard element', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('registers and exposes stub/config helpers', () => {
    expect(customElements.get('trace-on-map-card')).toBeTruthy();
    expect(TraceOnMapCard.getStubConfig().type).toBe('custom:trace-on-map-card');
    expect(TraceOnMapCard.getConfigElement().localName).toBe(
      'trace-on-map-card-editor'
    );
  });

  it('rejects empty entities', () => {
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard;
    expect(() =>
      card.setConfig({ type: 'custom:trace-on-map-card', entities: [] })
    ).toThrow(/entities/i);
  });

  it('builds UI, loads history, and survives hass updates while scrubbing', async () => {
    mockHaMap();
    const callApi = vi.fn(async () => [
      [
        {
          entity_id: 'device_tracker.phone',
          state: 'not_home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: { latitude: 1, longitude: 2 },
        },
        {
          entity_id: 'device_tracker.phone',
          state: 'not_home',
          last_changed: '2026-01-01T11:00:00Z',
          attributes: { latitude: 1.1, longitude: 2.1 },
        },
        {
          entity_id: 'device_tracker.phone',
          state: 'not_home',
          last_changed: '2026-01-01T12:00:00Z',
          attributes: { latitude: 1.2, longitude: 2.2 },
        },
      ],
    ]);

    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    // Assign hass before setConfig so first build has version + API.
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'device_tracker.phone': {
          entity_id: 'device_tracker.phone',
          state: 'not_home',
          attributes: { latitude: 1.2, longitude: 2.2, friendly_name: 'Phone' },
        },
        'zone.home': {
          entity_id: 'zone.home',
          state: 'zoning',
          attributes: { latitude: 0, longitude: 0, radius: 100 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [
        { entity: 'device_tracker.phone', name: 'Phone', color: '#0288d1' },
        'zone.home',
      ],
      hours_to_show: 24,
      auto_fit: true,
      cluster: true,
      fit_zones: true,
      theme_mode: 'auto',
    });

    await waitFor(() => {
      expect(callApi).toHaveBeenCalled();
      expect(card.shadowRoot?.querySelector('ha-map')).toBeTruthy();
    });

    const pathArg = String(callApi.mock.calls[0][1]);
    expect(pathArg).toContain('significant_changes_only=0');
    expect(pathArg).toContain(encodeURIComponent('device_tracker.phone'));
    expect(pathArg).not.toContain('zone.home');

    const slider = card.shadowRoot!.getElementById('slider') as HTMLInputElement;
    expect(Number(slider.max)).toBeGreaterThan(0);

    // Scrub to middle
    slider.value = '0';
    slider.dispatchEvent(new Event('input'));

    const map = card.shadowRoot!.querySelector('ha-map') as HTMLElement & {
      paths: Array<{ points: unknown[] }>;
      entities: Array<{ entity_id: string }>;
      editableLocations: Array<{ id: string; location: [number, number] }>;
    };
    const midPaths = map.paths;
    expect(midPaths[0].points.length).toBe(1);

    // Scrub markers keep avatars at historical coords (not live entities)
    const scrub = map.editableLocations.find((l) =>
      l.id.startsWith('scrub:')
    );
    expect(scrub).toBeTruthy();
    expect(scrub!.id).toBe('scrub:device_tracker.phone');
    expect(scrub!.location).toEqual([1, 2]);
    expect(
      map.entities.every(
        (e) => e.entity_id === 'zone.home' || e.entity_id.startsWith('zone.')
      )
    ).toBe(true);

    // Mid scrub: move to second point
    slider.value = '1';
    slider.dispatchEvent(new Event('input'));
    expect(map.editableLocations[0].location).toEqual([1.1, 2.1]);
    expect(map.paths[0].points.length).toBe(2);

    // hass tick must not restore full path while scrubbing
    card.hass = {
      ...(card.hass as object),
      states: {
        ...(card.hass as { states: object }).states,
      },
    };
    expect(map.paths[0].points.length).toBe(2);
    expect(map.editableLocations[0].location).toEqual([1.1, 2.1]);

    // Live end clears scrub avatars and restores live entities
    slider.value = String(slider.max);
    slider.dispatchEvent(new Event('input'));
    expect(map.editableLocations).toEqual([]);
    expect(
      map.entities.some((e) => e.entity_id === 'device_tracker.phone')
    ).toBe(true);

    // reconnect
    card.remove();
    document.body.appendChild(card);
    expect(card.shadowRoot?.querySelector('ha-map')).toBeTruthy();
  });

  it('supports aspect_ratio and play toggle after history load', async () => {
    mockHaMap();
    const callApi = vi.fn(async () => [
      [
        {
          entity_id: 'device_tracker.phone',
          state: 'not_home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: { latitude: 1, longitude: 2 },
        },
        {
          entity_id: 'device_tracker.phone',
          state: 'not_home',
          last_changed: '2026-01-01T11:00:00Z',
          attributes: { latitude: 1.1, longitude: 2.1 },
        },
      ],
    ]);
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.0' },
      states: {},
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['device_tracker.phone'],
      aspect_ratio: '16:9',
      title: 'Fleet',
    });
    await waitFor(() => {
      expect(card.shadowRoot?.querySelector('ha-map')).toBeTruthy();
    });
    const wrap = card.shadowRoot!.getElementById('map-wrap')!;
    expect(wrap.classList.contains('ratio')).toBe(true);
    expect(card.shadowRoot!.getElementById('title')!.textContent).toBe('Fleet');
    expect(card.getCardSize()).toBeGreaterThan(1);

    const play = card.shadowRoot!.getElementById('play') as HTMLButtonElement;
    play.click();
    await new Promise((r) => setTimeout(r, 30));
    play.click();
  });

  it('shows version gate for old HA', async () => {
    mockHaMap();
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['device_tracker.a'],
    });
    card.hass = {
      config: { version: '2026.8.0' },
      states: {},
      callApi: vi.fn(),
    };
    await waitFor(() => {
      const alert = card.shadowRoot!.getElementById('alert');
      expect(alert?.style.display).not.toBe('none');
      expect(alert?.textContent).toMatch(/2026\.9\.0/);
    });
    expect(card.shadowRoot?.querySelector('ha-map')).toBeNull();
  });
});
