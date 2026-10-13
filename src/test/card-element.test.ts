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
      range_mode: 'recent',
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
    slider.dispatchEvent(new Event('change'));

    const map = card.shadowRoot!.querySelector('ha-map') as HTMLElement & {
      paths: Array<{ points: unknown[] }>;
      entities: Array<{ entity_id: string }>;
      editableLocations: Array<{ id: string; location: [number, number] }>;
    };
    const midPaths = map.paths;
    expect(midPaths[0].points.length).toBe(1);

    // Scrub pins: tip-anchored cluster bubble above path origin (not covering it)
    const scrub = map.editableLocations.find((l) =>
      l.id.startsWith('scrub:')
    ) as
      | {
          id: string;
          location: [number, number];
          element: HTMLElement;
          elementSize: [number, number];
        }
      | undefined;
    expect(scrub).toBeTruthy();
    expect(scrub!.id).toBe('scrub:device_tracker.phone');
    expect(scrub!.location).toEqual([1, 2]);
    expect(scrub!.element.className).toBe('trace-scrub-cluster');
    expect(scrub!.element.querySelector('.trace-scrub-cluster-tail')).toBeTruthy();
    // Center-anchored wrapper: tip at mid-height so avatar sits above the path dot
    expect(scrub!.elementSize[0]).toBe(44);
    expect(scrub!.elementSize[1]).toBeGreaterThan(51);
    expect(
      map.entities.every(
        (e) => e.entity_id === 'zone.home' || e.entity_id.startsWith('zone.')
      )
    ).toBe(true);

    // Mid scrub: move to second point — path dots stay (clipped path grows)
    slider.value = '1';
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));
    expect(map.editableLocations[0].location).toEqual([1.1, 2.1]);
    expect(map.paths[0].points.length).toBe(2);
    // Tip at wrapper mid-height (120/2=60) so avatar sits above path origin
    expect(
      (map.editableLocations[0] as { elementSize: [number, number] }).elementSize
    ).toEqual([44, 120]);

    // hass tick must not restore full path while scrubbing
    card.hass = {
      ...(card.hass as object),
      states: {
        ...(card.hass as { states: object }).states,
      },
    };
    expect(map.paths[0].points.length).toBe(2);
    expect(map.editableLocations[0].location).toEqual([1.1, 2.1]);
    expect(
      (map.editableLocations[0] as { element: HTMLElement }).element.className
    ).toBe('trace-scrub-cluster');

    // Live end clears scrub avatars and restores live entities
    slider.value = String(slider.max);
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));
    expect(map.editableLocations).toEqual([]);
    expect(
      map.entities.some((e) => e.entity_id === 'device_tracker.phone')
    ).toBe(true);
    // Full path restored at live end
    expect(map.paths[0].points.length).toBe(3);

    // reconnect
    card.remove();
    document.body.appendChild(card);
    expect(card.shadowRoot?.querySelector('ha-map')).toBeTruthy();
  });

  it('uses floating scrub pin when cluster is disabled', async () => {
    mockHaMap();
    const callApi = vi.fn(async () => [
      [
        {
          entity_id: 'person.a',
          state: 'not_home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: { latitude: 10, longitude: 20 },
        },
        {
          entity_id: 'person.a',
          state: 'not_home',
          last_changed: '2026-01-01T11:00:00Z',
          attributes: { latitude: 11, longitude: 21 },
        },
      ],
    ]);
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: {
            latitude: 11,
            longitude: 21,
            friendly_name: 'A',
            entity_picture: '/local/a.jpg',
          },
        },
      },
      hassUrl: (p: string) => `http://ha${p}`,
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: [{ entity: 'person.a', color: '#4269d0' }],
      cluster: false,
      hours_to_show: 24,
    });

    await waitFor(() => {
      expect(callApi).toHaveBeenCalled();
      expect(card.shadowRoot?.querySelector('ha-map')).toBeTruthy();
    });

    const slider = card.shadowRoot!.getElementById('slider') as HTMLInputElement;
    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));

    const map = card.shadowRoot!.querySelector('ha-map') as HTMLElement & {
      paths: Array<{ points: unknown[] }>;
      editableLocations: Array<{
        id: string;
        location: [number, number];
        element: HTMLElement;
        elementSize: [number, number];
      }>;
      clusterMarkers: boolean;
    };
    expect(map.clusterMarkers).toBe(false);
    expect(map.editableLocations).toHaveLength(1);
    expect(map.editableLocations[0].element.className).toBe(
      'trace-scrub-floating'
    );
    expect(map.editableLocations[0].location).toEqual([10, 20]);
    expect(map.editableLocations[0].elementSize[0]).toBe(48);
    expect(map.editableLocations[0].elementSize[1]).toBe(130);
    // Path origin dots remain while pin floats above
    expect(map.paths[0].points.length).toBe(1);
  });

  it('disables controls when history has no coordinates', async () => {
    mockHaMap();
    const callApi = vi.fn(async () => [
      [
        {
          entity_id: 'person.a',
          state: 'home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: {},
        },
      ],
    ]);
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'home',
          attributes: { latitude: 1, longitude: 2 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: ['person.a'],
    });
    await waitFor(() => {
      expect(callApi).toHaveBeenCalled();
      const loading = card.shadowRoot!.getElementById('loading');
      expect(loading?.textContent).toMatch(/No location history/i);
    });
    const slider = card.shadowRoot!.getElementById('slider') as HTMLInputElement;
    const play = card.shadowRoot!.getElementById('play') as HTMLButtonElement;
    expect(slider.disabled).toBe(true);
    expect(play.disabled).toBe(true);
  });

  it('budget mode loads last window first then fetches earlier on scrub', async () => {
    mockHaMap();
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const callApi = vi.fn(async (_method: string, path: string) => {
      const startIso = path.split('history/period/')[1]?.split('?')[0] ?? '';
      const start = new Date(decodeURIComponent(startIso)).getTime();
      // Recent window
      if (start >= now - day - 60_000) {
        return [
          [
            {
              entity_id: 'person.a',
              state: 'not_home',
              last_changed: new Date(now - 3600_000).toISOString(),
              last_updated: new Date(now - 3600_000).toISOString(),
              attributes: { latitude: 9, longitude: 9 },
            },
          ],
        ];
      }
      return [
        [
          {
            entity_id: 'person.a',
            state: 'not_home',
            last_changed: new Date(start + 3600_000).toISOString(),
            last_updated: new Date(start + 3600_000).toISOString(),
            attributes: { latitude: 1, longitude: 1 },
          },
        ],
      ];
    });

    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: { latitude: 9, longitude: 9 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: ['person.a'],
      hours_to_show: 48,
      max_timeline_points: 3000,
    });

    await waitFor(() => {
      expect(callApi.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(card.shadowRoot?.querySelector('ha-map')).toBeTruthy();
    });
    const firstCalls = callApi.mock.calls.length;
    const slider = card.shadowRoot!.getElementById('slider') as HTMLInputElement;
    expect(slider.max).toBe('1000');
    expect(slider.disabled).toBe(false);

    // Scrub to the start of the range → should load an earlier window
    slider.value = '0';
    slider.dispatchEvent(new Event('change'));

    await waitFor(() => {
      expect(callApi.mock.calls.length).toBeGreaterThan(firstCalls);
    });
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
      range_mode: 'recent',
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
      range_mode: 'recent',
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

  it('keeps loading visible when a superseded fetch finishes first', async () => {
    mockHaMap();
    type Deferred = {
      promise: Promise<unknown>;
      resolve: (v: unknown) => void;
    };
    const deferreds: Deferred[] = [];
    const callApi = vi.fn(() => {
      let resolve!: (v: unknown) => void;
      const promise = new Promise((r) => {
        resolve = r;
      });
      deferreds.push({ promise, resolve });
      return promise;
    });

    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'home',
          attributes: { latitude: 1, longitude: 2 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: ['person.a'],
      hours_to_show: 24,
    });

    await waitFor(() => expect(deferreds.length).toBe(1));
    const loading = () => card.shadowRoot!.getElementById('loading');
    expect(loading()?.style.display).not.toBe('none');

    // Start a second fetch (new token) while first is in flight
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: ['person.a'],
      hours_to_show: 48,
    });
    await waitFor(() => expect(deferreds.length).toBe(2));

    // Stale (first) fetch completes — must NOT hide loading
    deferreds[0]!.resolve([
      [
        {
          entity_id: 'person.a',
          state: 'home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: { latitude: 1, longitude: 2 },
        },
      ],
    ]);
    await new Promise((r) => setTimeout(r, 30));
    expect(loading()?.style.display).not.toBe('none');
    expect(loading()?.textContent).toMatch(/Loading history/i);

    // Active fetch completes — hide loading
    deferreds[1]!.resolve([
      [
        {
          entity_id: 'person.a',
          state: 'home',
          last_changed: '2026-01-01T11:00:00Z',
          attributes: { latitude: 2, longitude: 3 },
        },
      ],
    ]);
    await waitFor(() => {
      expect(loading()?.style.display).toBe('none');
    });
  });

  it('shows alert and disables controls when history fetch fails', async () => {
    mockHaMap();
    const callApi = vi.fn(async () => {
      throw new Error('network down');
    });
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'home',
          attributes: { latitude: 1, longitude: 2 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: ['person.a'],
    });
    await waitFor(() => {
      const alert = card.shadowRoot!.getElementById('alert');
      expect(alert?.style.display).not.toBe('none');
      expect(alert?.textContent).toMatch(/Failed to load history/i);
    });
    const slider = card.shadowRoot!.getElementById('slider') as HTMLInputElement;
    const play = card.shadowRoot!.getElementById('play') as HTMLButtonElement;
    expect(slider.disabled).toBe(true);
    expect(play.disabled).toBe(true);
  });

  it('zones-only config shows empty trackable hint', async () => {
    mockHaMap();
    const callApi = vi.fn();
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
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
      range_mode: 'recent',
      entities: ['zone.home'],
    });
    await waitFor(() => {
      expect(card.shadowRoot?.querySelector('ha-map')).toBeTruthy();
      const loading = card.shadowRoot!.getElementById('loading');
      expect(loading?.textContent).toMatch(/No trackable entities/i);
    });
    expect(callApi).not.toHaveBeenCalled();
    const play = card.shadowRoot!.getElementById('play') as HTMLButtonElement;
    expect(play.disabled).toBe(true);
  });

  it('downsamples a dense budget window to max_timeline_points', async () => {
    mockHaMap();
    const now = Date.now();
    const dense = Array.from({ length: 80 }, (_, i) => ({
      entity_id: 'person.a',
      state: 'not_home',
      last_changed: new Date(now - (80 - i) * 60_000).toISOString(),
      last_updated: new Date(now - (80 - i) * 60_000).toISOString(),
      attributes: { latitude: i, longitude: i },
    }));
    const callApi = vi.fn(async () => [dense]);
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: { latitude: 79, longitude: 79 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: ['person.a'],
      hours_to_show: 24,
      max_timeline_points: 10,
    });
    await waitFor(() => {
      expect(callApi).toHaveBeenCalled();
      const map = card.shadowRoot!.querySelector('ha-map') as HTMLElement & {
        paths: Array<{ points: unknown[] }>;
      };
      expect(map.paths?.[0]?.points.length).toBeLessThanOrEqual(10);
      expect(map.paths?.[0]?.points.length).toBeGreaterThan(0);
    });
  });

  it('flushes scrub on input via rAF', async () => {
    mockHaMap();
    const callApi = vi.fn(async () => [
      [
        {
          entity_id: 'person.a',
          state: 'not_home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: { latitude: 1, longitude: 2 },
        },
        {
          entity_id: 'person.a',
          state: 'not_home',
          last_changed: '2026-01-01T11:00:00Z',
          attributes: { latitude: 3, longitude: 4 },
        },
      ],
    ]);
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: { latitude: 3, longitude: 4 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      range_mode: 'recent',
      entities: ['person.a'],
    });
    await waitFor(() => expect(callApi).toHaveBeenCalled());
    const slider = card.shadowRoot!.getElementById('slider') as HTMLInputElement;
    const map = card.shadowRoot!.querySelector('ha-map') as HTMLElement & {
      editableLocations: Array<{ location: [number, number] }>;
    };
    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await waitFor(() => {
      expect(map.editableLocations?.[0]?.location).toEqual([1, 2]);
    });
  });

  it('defaults to day mode with nav; switches to recent and past day', async () => {
    mockHaMap();
    const now = Date.now();
    const callApi = vi.fn(async (_m: string, path: string) => {
      const startIso = path.split('history/period/')[1]?.split('?')[0] ?? '';
      const start = new Date(decodeURIComponent(startIso)).getTime();
      return [
        [
          {
            entity_id: 'person.a',
            state: 'not_home',
            last_changed: new Date(start + 3600_000).toISOString(),
            attributes: { latitude: 1, longitude: 2 },
          },
          {
            entity_id: 'person.a',
            state: 'not_home',
            last_changed: new Date(Math.min(start + 7200_000, now - 1000)).toISOString(),
            attributes: { latitude: 3, longitude: 4 },
          },
        ],
      ];
    });
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3', time_zone: 'Asia/Shanghai' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: { latitude: 3, longitude: 4 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['person.a'],
      hours_to_show: 24,
    });

    await waitFor(() => expect(callApi).toHaveBeenCalled());
    const dayBtn = card.shadowRoot!.querySelector(
      '.range-mode-btn[data-mode="day"]'
    ) as HTMLButtonElement;
    const recentBtn = card.shadowRoot!.querySelector(
      '.range-mode-btn[data-mode="recent"]'
    ) as HTMLButtonElement;
    const prev = card.shadowRoot!.getElementById(
      'range-prev'
    ) as HTMLButtonElement;
    const next = card.shadowRoot!.getElementById(
      'range-next'
    ) as HTMLButtonElement;
    const label = card.shadowRoot!.getElementById('range-label')!;

    expect(dayBtn.getAttribute('aria-pressed')).toBe('true');
    expect(next.disabled).toBe(true);
    expect(prev.disabled).toBe(false);
    expect(label.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const callsAfterDay = callApi.mock.calls.length;
    prev.click();
    await waitFor(() => {
      expect(callApi.mock.calls.length).toBeGreaterThan(callsAfterDay);
      expect(next.disabled).toBe(false);
    });

    const callsAfterPrev = callApi.mock.calls.length;
    recentBtn.click();
    await waitFor(() => {
      expect(callApi.mock.calls.length).toBeGreaterThan(callsAfterPrev);
      expect(recentBtn.getAttribute('aria-pressed')).toBe('true');
      expect(
        card.shadowRoot!.getElementById('range-nav')!.style.display
      ).toBe('none');
      expect(label.textContent).toMatch(/最近 24/);
    });
  });

  it('week mode from config; next returns to current week and disables', async () => {
    mockHaMap();
    const callApi = vi.fn(async (_m: string, path: string) => {
      const startIso = path.split('history/period/')[1]?.split('?')[0] ?? '';
      const start = new Date(decodeURIComponent(startIso)).getTime();
      return [
        [
          {
            entity_id: 'person.a',
            state: 'not_home',
            last_changed: new Date(start + 3600_000).toISOString(),
            attributes: { latitude: 1, longitude: 2 },
          },
        ],
      ];
    });
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3', time_zone: 'Asia/Shanghai' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: { latitude: 1, longitude: 2 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['person.a'],
      range_mode: 'week',
    });

    await waitFor(() => expect(callApi).toHaveBeenCalled());
    const weekBtn = card.shadowRoot!.querySelector(
      '.range-mode-btn[data-mode="week"]'
    ) as HTMLButtonElement;
    const prev = card.shadowRoot!.getElementById(
      'range-prev'
    ) as HTMLButtonElement;
    const next = card.shadowRoot!.getElementById(
      'range-next'
    ) as HTMLButtonElement;
    const label = card.shadowRoot!.getElementById('range-label')!;

    expect(weekBtn.getAttribute('aria-pressed')).toBe('true');
    expect(label.textContent).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
    expect(next.disabled).toBe(true);

    prev.click();
    await waitFor(() => expect(next.disabled).toBe(false));
    const calls = callApi.mock.calls.length;
    next.click();
    await waitFor(() => {
      expect(callApi.mock.calls.length).toBeGreaterThan(calls);
      expect(next.disabled).toBe(true);
    });

    // Same mode click is a no-op
    const before = callApi.mock.calls.length;
    weekBtn.click();
    await new Promise((r) => setTimeout(r, 40));
    expect(callApi.mock.calls.length).toBe(before);
  });

  it('day mode clips history points outside the civil day window', async () => {
    mockHaMap();
    const tz = 'Asia/Shanghai';
    // Fixed "now": 2026-10-13 15:00 CST
    const nowMs = Date.UTC(2026, 9, 13, 7, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    const inDay = Date.UTC(2026, 9, 13, 3, 0, 0); // 11:00 CST
    const outside = Date.UTC(2026, 9, 14, 1, 0, 0); // next day CST
    const callApi = vi.fn(async () => [
      [
        {
          entity_id: 'person.a',
          state: 'not_home',
          last_changed: new Date(inDay).toISOString(),
          attributes: { latitude: 1, longitude: 2 },
        },
        {
          entity_id: 'person.a',
          state: 'not_home',
          last_changed: new Date(outside).toISOString(),
          attributes: { latitude: 9, longitude: 9 },
        },
      ],
    ]);

    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    card.hass = {
      config: { version: '2026.9.3', time_zone: tz },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: { latitude: 1, longitude: 2 },
        },
      },
      callApi,
    };
    card.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['person.a'],
      range_mode: 'day',
    });

    await waitFor(() => {
      expect(callApi).toHaveBeenCalled();
      const map = card.shadowRoot!.querySelector('ha-map') as HTMLElement & {
        paths: Array<{ points: unknown[] }>;
      };
      expect(map.paths?.[0]?.points.length).toBe(1);
    });
  });

  it('skips auto-refetch for past day windows', async () => {
    mockHaMap();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-13T07:00:00.000Z'));

    const callApi = vi.fn(async (_m: string, path: string) => {
      const startIso = path.split('history/period/')[1]?.split('?')[0] ?? '';
      const start = new Date(decodeURIComponent(startIso)).getTime();
      return [
        [
          {
            entity_id: 'person.a',
            state: 'not_home',
            last_changed: new Date(start + 3600_000).toISOString(),
            attributes: { latitude: 1, longitude: 2 },
          },
        ],
      ];
    });
    const card = document.createElement('trace-on-map-card') as TraceOnMapCard & {
      hass: unknown;
    };
    document.body.appendChild(card);
    const hass = {
      config: { version: '2026.9.3', time_zone: 'Asia/Shanghai' },
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'not_home',
          attributes: { latitude: 1, longitude: 2 },
        },
      },
      callApi,
    };
    card.hass = hass;
    card.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['person.a'],
      range_mode: 'day',
    });

    await waitFor(() => expect(callApi).toHaveBeenCalled());
    const prev = card.shadowRoot!.getElementById(
      'range-prev'
    ) as HTMLButtonElement;
    prev.click();
    await waitFor(() => expect(callApi.mock.calls.length).toBeGreaterThanOrEqual(2));
    const afterPrev = callApi.mock.calls.length;

    vi.advanceTimersByTime(65_000);
    card.hass = { ...hass };
    await Promise.resolve();
    expect(callApi.mock.calls.length).toBe(afterPrev);

    vi.useRealTimers();
  });
});
