import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLUSTER_AVATAR_SIZE,
  FLOATING_LIFT,
  FLOATING_MARKER_SIZE,
  buildScrubEditableLocations,
  centerAnchoredPinSize,
  clusterPinGeometry,
  ensureAvatarMarkerElement,
  floatingPinGeometry,
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

function ensureHaEntityMarkerDefined(): void {
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
        selected?: boolean;
      }
    );
  }
}

/** Force fallback DOM avatar path even if ha-entity-marker is registered. */
function withoutHaEntityMarker<T>(fn: () => T): T {
  const spy = vi.spyOn(customElements, 'get').mockImplementation((name) => {
    if (name === 'ha-entity-marker') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (CustomElementRegistry.prototype.get as any).call(
      customElements,
      name
    );
  });
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

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

describe('pin geometry (tip above path origin)', () => {
  it('pads wrapper so tip is at center for center-anchored editableLocations', () => {
    expect(centerAnchoredPinSize(44, 51, 60)).toEqual([44, 120]);
    // tip already inside content → no extra pad beyond tip*2
    expect(centerAnchoredPinSize(10, 100, 40)).toEqual([10, 100]);

    const cluster = clusterPinGeometry();
    // Live cluster bubble is 44×51; tip is FLOATING_LIFT below bottom.
    expect(cluster.contentSize).toEqual([44, 51]);
    expect(cluster.tipFromTop).toBe(51 + FLOATING_LIFT);
    expect(FLOATING_LIFT).toBe(9);
    expect(cluster.elementSize[0]).toBe(44);
    expect(cluster.elementSize[1]).toBe(120);
    // Tip must sit at geometric center of the wrapper (path origin).
    expect(cluster.elementSize[1] / 2).toBe(cluster.tipFromTop);

    const floating = floatingPinGeometry();
    expect(floating.contentSize[0]).toBe(FLOATING_MARKER_SIZE);
    expect(floating.contentSize[1]).toBe(70); // 48 + 8 + 4 + 10
    expect(floating.tipFromTop).toBe(65);
    expect(floating.elementSize).toEqual([48, 130]);
    expect(floating.elementSize[1] / 2).toBe(floating.tipFromTop);
  });

  it('scales floating geometry with custom marker size', () => {
    const g = floatingPinGeometry(32);
    expect(g.contentSize[0]).toBe(32);
    expect(g.elementSize[1] / 2).toBe(g.tipFromTop);
  });
});

describe('initialsFromName / resolveEntityPictureUrl', () => {
  it('builds initials', () => {
    expect(initialsFromName('Alice Bob')).toBe('AB');
    expect(initialsFromName('')).toBe('');
    expect(initialsFromName('Very Long Name Here')).toBe('VLN');
    expect(initialsFromName('单名')).toBe('单'); // first grapheme of single token
  });

  it('resolves picture via hassUrl and rejects non-strings', () => {
    expect(
      resolveEntityPictureUrl('/api/image/proxy', (p) => `https://ha.local${p}`)
    ).toBe('https://ha.local/api/image/proxy');
    expect(resolveEntityPictureUrl('')).toBe('');
    expect(resolveEntityPictureUrl(null)).toBe('');
    expect(resolveEntityPictureUrl(42)).toBe('');
    expect(resolveEntityPictureUrl('/local/a.jpg')).toBe('/local/a.jpg');
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
    vi.restoreAllMocks();
  });

  it('builds cluster-bubble pin matching live HA size (44×51 content)', () => {
    ensureHaEntityMarkerDefined();

    const cache = new Map<string, HTMLElement>();
    const { element, elementSize } = ensureAvatarMarkerElement(cache, {
      entityId: 'person.a',
      name: 'Alice',
      color: '#4269d0',
      pictureUrl: 'http://ha/pic.png',
      style: 'cluster',
    });

    expect(element.className).toBe('trace-scrub-cluster');
    expect(element.querySelector('.trace-scrub-cluster-bubble')).toBeTruthy();
    expect(element.querySelector('.trace-scrub-cluster-tail')).toBeTruthy();
    expect(elementSize).toEqual(clusterPinGeometry().elementSize);
    // Wrapper height leaves tip at mid-box so path dots stay under the pin tip
    expect(Number.parseInt(element.style.height, 10)).toBe(elementSize[1]);
    expect(Number.parseInt(element.style.width, 10)).toBe(44);

    const marker = element.querySelector(
      'ha-entity-marker'
    ) as HTMLElement & Record<string, unknown>;
    expect(marker).toBeTruthy();
    expect(marker.floating).toBe(false);
    expect(marker.selected).toBe(false);
    expect(marker.showIcon).toBe(false);
    expect(marker.entityId).toBe('person.a');
    expect(marker.getAttribute('entity-id')).toBe('person.a');
    expect(marker.entityPicture).toBe('http://ha/pic.png');
    expect(marker.entityName).toBe('A');
    expect(marker.style.getPropertyValue('--ha-marker-size')).toBe(
      `${CLUSTER_AVATAR_SIZE}px`
    );
    expect(marker.style.getPropertyValue('--ha-marker-color')).toBe('#4269d0');
    expect(marker.style.getPropertyValue('--ha-marker-border-width')).toBe(
      '2px'
    );
    expect(marker.style.getPropertyValue('--ha-marker-border-radius')).toBe(
      '10px'
    );

    const again = ensureAvatarMarkerElement(cache, {
      entityId: 'person.a',
      name: 'Alice Wonder',
      color: '#111111',
      pictureUrl: '',
      style: 'cluster',
    });
    expect(again.element).toBe(element);
    expect(marker.entityColor).toBe('#111111');
    expect(marker.entityName).toBe('AW');
    expect(marker.entityPicture).toBe('');
  });

  it('builds floating pin when cluster style is off', () => {
    ensureHaEntityMarkerDefined();
    const cache = new Map<string, HTMLElement>();
    const { element, elementSize } = ensureAvatarMarkerElement(cache, {
      entityId: 'person.b',
      name: 'Bob',
      color: '#0288d1',
      pictureUrl: '',
      style: 'floating',
    });
    expect(element.className).toBe('trace-scrub-floating');
    expect(elementSize).toEqual(floatingPinGeometry().elementSize);
    const marker = element.querySelector(
      'ha-entity-marker'
    ) as HTMLElement & Record<string, unknown>;
    expect(marker.floating).toBe(true);
    expect(marker.style.getPropertyValue('--ha-marker-size')).toBe('48px');
    // Floating keeps default border radius (not cluster 10px override)
    expect(marker.style.getPropertyValue('--ha-marker-border-radius')).toBe('');
  });

  it('keeps separate cache entries for cluster vs floating of same entity', () => {
    ensureHaEntityMarkerDefined();
    const cache = new Map<string, HTMLElement>();
    const cluster = ensureAvatarMarkerElement(cache, {
      entityId: 'person.x',
      name: 'X',
      color: '#1',
      pictureUrl: '',
      style: 'cluster',
    });
    const floating = ensureAvatarMarkerElement(cache, {
      entityId: 'person.x',
      name: 'X',
      color: '#1',
      pictureUrl: '',
      style: 'floating',
    });
    expect(cluster.element).not.toBe(floating.element);
    expect(cache.size).toBe(2);
  });

  it('uses DOM fallback avatar when ha-entity-marker is unavailable (cluster)', () => {
    withoutHaEntityMarker(() => {
      const cache = new Map<string, HTMLElement>();
      const { element } = ensureAvatarMarkerElement(cache, {
        entityId: 'person.fb',
        name: 'Fall Back',
        color: '#abcabc',
        pictureUrl: 'http://x/"y.jpg',
        style: 'cluster',
      });
      expect(element.querySelector('ha-entity-marker')).toBeNull();
      const avatar = element.querySelector(
        '.trace-scrub-avatar'
      ) as HTMLElement;
      expect(avatar).toBeTruthy();
      expect(avatar.style.backgroundImage).toContain('\\"');
      expect(avatar.textContent).toBe('');

      ensureAvatarMarkerElement(cache, {
        entityId: 'person.fb',
        name: 'Fall Back',
        color: '#abcabc',
        pictureUrl: '',
        style: 'cluster',
      });
      expect(avatar.style.backgroundImage).toBe('');
      expect(avatar.textContent).toBe('FB');
    });
  });

  it('uses DOM fallback avatar when ha-entity-marker is unavailable (floating)', () => {
    withoutHaEntityMarker(() => {
      const { element, elementSize } = ensureAvatarMarkerElement(new Map(), {
        entityId: 'person.ff',
        name: '?',
        color: '#000',
        pictureUrl: '',
        style: 'floating',
      });
      expect(element.className).toBe('trace-scrub-floating');
      expect(elementSize).toEqual(floatingPinGeometry().elementSize);
      const avatar = element.querySelector(
        '.trace-scrub-avatar'
      ) as HTMLElement;
      expect(avatar.textContent).toBe('?');
      expect(avatar.style.width).toBe(`${FLOATING_MARKER_SIZE}px`);
    });
  });

  it('places scrub locations and defaults missing colors', () => {
    ensureHaEntityMarkerDefined();
    const cache = new Map<string, HTMLElement>();
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
      cluster: true,
    });

    expect(locations.length).toBe(2);
    const a = locations.find((l) => l.id === 'scrub:person.a')!;
    expect(a.location).toEqual([5, 6]);
    expect(a.locationEditable).toBe(false);
    expect(a.radiusEditable).toBe(false);
    expect(a.fit).toBe(false);
    expect(a.elementSize).toEqual(clusterPinGeometry().elementSize);
    expect(a.element.className).toBe('trace-scrub-cluster');
    expect(a.title).toBe('Alice');
    expect(a.color).toBe('#0288d1');

    const marker = a.element.querySelector(
      'ha-entity-marker'
    ) as HTMLElement & Record<string, unknown>;
    expect(marker.entityPicture).toBe('http://ha/api/pic');

    const b = locations.find((l) => l.id === 'scrub:person.b')!;
    expect(b.location).toEqual([3, 4]);
    expect(b.color).toBe('#0288d1');
    expect(b.title).toBe('person.b');
  });

  it('uses floating geometry when cluster option is false', () => {
    ensureHaEntityMarkerDefined();
    const locations = buildScrubEditableLocations({
      positions: positionsAtTimelineIndex(points, 0),
      names: new Map(),
      colors: new Map(),
      elementCache: new Map(),
      cluster: false,
    });
    expect(locations[0].elementSize).toEqual(floatingPinGeometry().elementSize);
    expect(locations[0].element.className).toBe('trace-scrub-floating');
  });

  it('defaults cluster style when cluster option omitted', () => {
    ensureHaEntityMarkerDefined();
    const locations = buildScrubEditableLocations({
      positions: new Map([['person.z', { lat: 9, lng: 8 }]]),
      names: new Map(),
      colors: new Map(),
      elementCache: new Map(),
    });
    expect(locations[0].element.className).toBe('trace-scrub-cluster');
  });

  it('returns empty list when no positions', () => {
    expect(
      buildScrubEditableLocations({
        positions: new Map(),
        names: new Map(),
        colors: new Map(),
        elementCache: new Map(),
      })
    ).toEqual([]);
  });

  it('prefers friendly_name from state when names map misses', () => {
    ensureHaEntityMarkerDefined();
    const locations = buildScrubEditableLocations({
      positions: new Map([['person.n', { lat: 1, lng: 2 }]]),
      names: new Map(),
      colors: new Map(),
      states: {
        'person.n': {
          entity_id: 'person.n',
          state: 'home',
          attributes: { friendly_name: 'From State' },
        },
      },
      elementCache: new Map(),
    });
    expect(locations[0].title).toBe('From State');
  });
});
