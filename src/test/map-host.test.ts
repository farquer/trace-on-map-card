import { describe, expect, it, vi } from 'vitest';
import { applyMapProps, createHaMapElement, resizeHaMap } from '../map-host';

describe('map-host', () => {
  it('createHaMapElement sets size styles', () => {
    const el = createHaMapElement();
    expect(el.localName).toBe('ha-map');
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('100%');
  });

  it('applyMapProps sets properties and attributes', () => {
    const el = document.createElement('div');
    const hass = {
      states: {},
      callApi: vi.fn(),
    };
    applyMapProps(el, {
      hass,
      entities: [{ entity_id: 'device_tracker.a', color: '#0288d1' }],
      paths: [],
      autoFit: true,
      fitZones: true,
      cluster: false,
      themeMode: 'dark',
      zoom: 12,
    });
    const map = el as HTMLElement & Record<string, unknown>;
    expect(map.hass).toBe(hass);
    expect(map.autoFit).toBe(true);
    expect(map.fitZones).toBe(true);
    expect(map.clusterMarkers).toBe(false);
    expect(map.themeMode).toBe('dark');
    expect(map.zoom).toBe(12);
    expect(map.editableLocations).toEqual([]);
    const marker = document.createElement('div');
    applyMapProps(el, {
      hass,
      entities: [],
      paths: [],
      editableLocations: [
        {
          id: 'scrub:person.a',
          location: [1, 2],
          element: marker,
          elementSize: [48, 56],
          locationEditable: false,
          radiusEditable: false,
          fit: false,
        },
      ],
      autoFit: true,
      fitZones: true,
      cluster: false,
      themeMode: 'dark',
      zoom: 12,
    });
    expect(map.editableLocations).toHaveLength(1);
    expect(
      (map.editableLocations as Array<{ id: string }>)[0].id
    ).toBe('scrub:person.a');
    expect(el.hasAttribute('auto-fit')).toBe(true);
    expect(el.hasAttribute('fit-zones')).toBe(true);
    expect(el.hasAttribute('cluster-markers')).toBe(false);
    expect(el.getAttribute('theme-mode')).toBe('dark');
  });

  it('clears boolean attributes when false', () => {
    const el = document.createElement('div');
    el.setAttribute('auto-fit', '');
    applyMapProps(el, {
      hass: null,
      entities: [],
      paths: [],
      autoFit: false,
      fitZones: false,
      cluster: true,
      themeMode: 'auto',
      zoom: 14,
    });
    expect(el.hasAttribute('auto-fit')).toBe(false);
    expect(el.hasAttribute('cluster-markers')).toBe(true);
  });

  it('resizeHaMap is safe', () => {
    expect(() => resizeHaMap(null)).not.toThrow();
    const el = document.createElement('div') as HTMLElement & {
      fitMap: () => void;
    };
    el.fitMap = vi.fn();
    resizeHaMap(el);
    expect(el.fitMap).toHaveBeenCalled();
  });
});
