import { afterEach, describe, expect, it } from 'vitest';
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

  it('returns empty for empty timeline or negative index', () => {
    expect(positionsAtTimelineIndex([], 0).size).toBe(0);
    expect(positionsAtTimelineIndex(points, -1).size).toBe(0);
  });

  it('clamps past-end index to last point set', () => {
    const late = positionsAtTimelineIndex(points, 99);
    expect(late.get('person.a')).toEqual({ lat: 5, lng: 6 });
    expect(late.size).toBe(2);
  });

  it('only includes entities that have appeared by index', () => {
    const first = positionsAtTimelineIndex(points, 0);
    expect([...first.keys()]).toEqual(['person.a']);
    expect(first.has('person.b')).toBe(false);
  });
});

describe('initialsFromName / resolveEntityPictureUrl', () => {
  it('builds initials', () => {
    expect(initialsFromName('Alice Bob')).toBe('AB');
    expect(initialsFromName('')).toBe('');
    expect(initialsFromName('Very Long Name Here')).toBe('VLN');
  });

  it('resolves picture via hassUrl and rejects non-strings', () => {
    expect(
      resolveEntityPictureUrl('/api/image/proxy', (p) => `https://ha.local${p}`)
    ).toBe('https://ha.local/api/image/proxy');
    expect(resolveEntityPictureUrl('')).toBe('');
    expect(resolveEntityPictureUrl(null)).toBe('');
    expect(resolveEntityPictureUrl(42)).toBe('');
  });

  it('falls back to raw path when hassUrl throws', () => {
    expect(
      resolveEntityPictureUrl('/local/a.jpg', () => {
        throw new Error('boom');
      })
    ).toBe('/local/a.jpg');
  });
});

describe('ensureAvatarMarkerElement / buildScrubEditableLocations', () => {
  afterEach(() => {
    // Leave registry alone — define once if needed in a single test.
  });

  it('reuses cached elements and places them at scrub coords', () => {
    const cache = new Map<string, HTMLElement>();
    const el1 = ensureAvatarMarkerElement(cache, {
      entityId: 'person.a',
      name: 'Alice',
      color: '#0288d1',
      pictureUrl: '',
    });
    expect(el1.textContent).toBe('A');
    const el2 = ensureAvatarMarkerElement(cache, {
      entityId: 'person.a',
      name: 'Alice',
      color: '#0288d1',
      pictureUrl: '/local/a.jpg',
    });
    expect(el1).toBe(el2);
    expect(el2.style.backgroundImage).toContain('/local/a.jpg');
    expect(el2.textContent).toBe('');

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
    expect(a.radiusEditable).toBe(false);
    expect(a.fit).toBe(false);
    expect(a.element).toBe(cache.get('person.a'));
    expect(a.title).toBe('Alice');

    const b = locations.find((l) => l.id === 'scrub:person.b')!;
    expect(b.location).toEqual([3, 4]);
    expect(b.color).toBe('#0288d1'); // default when color map misses
    expect(b.title).toBe('person.b');
  });

  it('uses ha-entity-marker when registered', () => {
    if (!customElements.get('ha-entity-marker')) {
      customElements.define(
        'ha-entity-marker',
        class extends HTMLElement {
          entityId?: string;
          entityName?: string;
          entityPicture?: string;
          entityColor?: string;
          floating?: boolean;
          showIcon?: boolean;
        }
      );
    }
    const cache = new Map<string, HTMLElement>();
    const el = ensureAvatarMarkerElement(cache, {
      entityId: 'person.x',
      name: 'Xena Ward',
      color: '#ff0000',
      pictureUrl: 'http://ha/pic.png',
    });
    expect(el.localName).toBe('ha-entity-marker');
    const marker = el as HTMLElement & Record<string, unknown>;
    expect(marker.entityId).toBe('person.x');
    expect(marker.entityName).toBe('XW');
    expect(marker.entityPicture).toBe('http://ha/pic.png');
    expect(marker.entityColor).toBe('#ff0000');
    expect(marker.floating).toBe(true);
    expect(marker.showIcon).toBe(false);

    const again = ensureAvatarMarkerElement(cache, {
      entityId: 'person.x',
      name: 'Xena',
      color: '#00ff00',
      pictureUrl: '',
    });
    expect(again).toBe(el);
    expect(marker.entityName).toBe('X');
    expect(marker.entityColor).toBe('#00ff00');
  });

  it('escapes quotes in fallback background-image url', () => {
    const cache = new Map<string, HTMLElement>();
    // Force fallback path: if ha-entity-marker is already registered from prior
    // test, seed cache with a plain div so we exercise CSS fallback.
    const div = document.createElement('div');
    div.className = 'trace-scrub-marker';
    cache.set('person.q', div);
    ensureAvatarMarkerElement(cache, {
      entityId: 'person.q',
      name: 'Q',
      color: '#111',
      pictureUrl: 'http://ha/x"y.jpg',
    });
    expect(div.style.backgroundImage).toContain('\\"');
  });
});
