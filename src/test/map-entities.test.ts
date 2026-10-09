import { describe, expect, it } from 'vitest';
import {
  assignEntityColors,
  buildHaMapEntities,
  historyEntityIds,
  legendItems,
} from '../map-entities';

describe('assignEntityColors', () => {
  it('sanitizes unsafe colors', () => {
    const map = assignEntityColors([
      { entity: 'device_tracker.a', color: 'url(javascript:1)' },
      'device_tracker.b',
    ]);
    expect(map.get('device_tracker.a')).toMatch(/^#/);
    expect(map.get('device_tracker.b')).toMatch(/^#/);
  });

  it('keeps valid hex', () => {
    const map = assignEntityColors([
      { entity: 'device_tracker.a', color: '#ff0000' },
    ]);
    expect(map.get('device_tracker.a')).toBe('#ff0000');
  });
});

describe('historyEntityIds', () => {
  it('excludes zones and empty ids', () => {
    expect(
      historyEntityIds([
        { entity: 'device_tracker.a' },
        { entity: 'zone.home' },
        { entity: '' },
        { entity: 'person.b' },
      ])
    ).toEqual(['device_tracker.a', 'person.b']);
  });
});

describe('buildHaMapEntities', () => {
  const configs = [
    { entity: 'device_tracker.a', name: 'Phone' },
    { entity: 'zone.home' },
  ];
  const colorMap = assignEntityColors(configs);

  it('includes all when showLiveEntities', () => {
    const entities = buildHaMapEntities({
      configs,
      showLiveEntities: true,
      colorMap,
      states: {
        'device_tracker.a': {
          entity_id: 'device_tracker.a',
          state: 'home',
          attributes: { friendly_name: 'From State' },
        },
      },
    });
    expect(entities.map((e) => e.entity_id)).toEqual([
      'device_tracker.a',
      'zone.home',
    ]);
    expect(entities[0].name).toBe('Phone');
  });

  it('keeps only zones when historical scrub', () => {
    const entities = buildHaMapEntities({
      configs,
      showLiveEntities: false,
      colorMap,
    });
    expect(entities.map((e) => e.entity_id)).toEqual(['zone.home']);
  });
});

describe('legendItems', () => {
  it('omits zones and escapes via sanitized color', () => {
    const configs = [
      { entity: 'device_tracker.a', name: 'A' },
      { entity: 'zone.home' },
    ];
    const items = legendItems({
      configs,
      colorMap: assignEntityColors(configs),
    });
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('A');
    expect(items[0].color).toMatch(/^#|rgb/);
  });
});
