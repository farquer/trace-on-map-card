import { describe, expect, it } from 'vitest';
import {
  buildScrubEditableLocations,
  ensureAvatarMarkerElement,
  initialsFromName,
  positionsAtTimelineIndex,
  resolveEntityPictureUrl,
} from '../scrub-markers';
import type { TimelinePoint } from '../types';

const points: TimelinePoint[] = [
  { timestamp: 1, entityId: 'person.a', lat: 1, lng: 2 },
  { timestamp: 2, entityId: 'person.b', lat: 3, lng: 4 },
  { timestamp: 3, entityId: 'person.a', lat: 5, lng: 6 },
];

describe('positionsAtTimelineIndex', () => {
  it('keeps last position per entity up to index', () => {
    const mid = positionsAtTimelineIndex(points, 1);
    expect(mid.get('person.a')).toEqual({ lat: 1, lng: 2 });
    expect(mid.get('person.b')).toEqual({ lat: 3, lng: 4 });

    const end = positionsAtTimelineIndex(points, 2);
    expect(end.get('person.a')).toEqual({ lat: 5, lng: 6 });
    expect(end.get('person.b')).toEqual({ lat: 3, lng: 4 });
  });
});

describe('initialsFromName / resolveEntityPictureUrl', () => {
  it('builds initials', () => {
    expect(initialsFromName('Alice Bob')).toBe('AB');
  });

  it('resolves picture via hassUrl', () => {
    expect(
      resolveEntityPictureUrl('/api/image/proxy', (p) => `https://ha.local${p}`)
    ).toBe('https://ha.local/api/image/proxy');
    expect(resolveEntityPictureUrl('')).toBe('');
  });
});

describe('ensureAvatarMarkerElement / buildScrubEditableLocations', () => {
  it('reuses cached elements and places them at scrub coords', () => {
    const cache = new Map<string, HTMLElement>();
    const el1 = ensureAvatarMarkerElement(cache, {
      entityId: 'person.a',
      name: 'Alice',
      color: '#0288d1',
      pictureUrl: '',
    });
    const el2 = ensureAvatarMarkerElement(cache, {
      entityId: 'person.a',
      name: 'Alice',
      color: '#0288d1',
      pictureUrl: '/local/a.jpg',
    });
    expect(el1).toBe(el2);
    expect(el2.style.backgroundImage).toContain('/local/a.jpg');

    const locations = buildScrubEditableLocations({
      positions: positionsAtTimelineIndex(points, 2),
      names: new Map([['person.a', 'Alice']]),
      colors: new Map([['person.a', '#0288d1']]),
      states: {
        'person.a': {
          entity_id: 'person.a',
          state: 'home',
          attributes: {
            friendly_name: 'Alice',
            entity_picture: '/api/pic',
          },
        },
      },
      hassUrl: (p) => `http://ha${p}`,
      elementCache: cache,
    });

    expect(locations.length).toBe(2);
    const a = locations.find((l) => l.id === 'scrub:person.a')!;
    expect(a.location).toEqual([5, 6]);
    expect(a.locationEditable).toBe(false);
    expect(a.fit).toBe(false);
    expect(a.element).toBe(cache.get('person.a'));
  });
});
