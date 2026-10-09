import { describe, expect, it } from 'vitest';
import {
  buildHaPaths,
  clipPointsToTime,
  clipTimelineToIndex,
  extractTimelinePoints,
  normalizeHistories,
  timestampAtIndex,
} from '../history';
import type { HistoryState } from '../types';

const sample: HistoryState[][] = [
  [
    {
      entity_id: 'device_tracker.a',
      state: 'not_home',
      last_changed: '2026-01-01T10:00:00Z',
      attributes: { latitude: 1, longitude: 2 },
    },
    {
      entity_id: 'device_tracker.a',
      state: 'not_home',
      last_changed: '2026-01-01T11:00:00Z',
      attributes: { latitude: 1.1, longitude: 2.1 },
    },
  ],
  [
    {
      entity_id: 'device_tracker.b',
      state: 'home',
      last_changed: '2026-01-01T10:30:00Z',
      attributes: { latitude: 3, longitude: 4 },
    },
  ],
];

describe('normalizeHistories', () => {
  it('passes through arrays', () => {
    expect(normalizeHistories(sample)).toBe(sample);
  });

  it('converts record to arrays', () => {
    const rec = {
      'device_tracker.a': sample[0],
      'device_tracker.b': sample[1],
    };
    expect(normalizeHistories(rec)).toHaveLength(2);
  });

  it('handles null/undefined safely', () => {
    expect(normalizeHistories(null)).toEqual([]);
    expect(normalizeHistories(undefined)).toEqual([]);
  });
});

describe('extractTimelinePoints', () => {
  it('extracts and sorts across entities', () => {
    const points = extractTimelinePoints(sample, [
      { entity: 'device_tracker.a' },
      { entity: 'device_tracker.b' },
    ]);
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.entityId)).toEqual([
      'device_tracker.a',
      'device_tracker.b',
      'device_tracker.a',
    ]);
  });

  it('skips states without coordinates', () => {
    const data: HistoryState[][] = [
      [
        {
          entity_id: 'device_tracker.a',
          state: 'home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: {},
        },
      ],
    ];
    expect(extractTimelinePoints(data, [{ entity: 'device_tracker.a' }])).toEqual(
      []
    );
  });

  it('accepts string latitude/longitude', () => {
    const data: HistoryState[][] = [
      [
        {
          entity_id: 'device_tracker.a',
          state: 'not_home',
          last_changed: '2026-01-01T10:00:00Z',
          attributes: { latitude: '31.2' as unknown as number, longitude: '121.5' as unknown as number },
        },
      ],
    ];
    // Simulate raw JSON strings by casting through unknown attributes
    (data[0][0].attributes as Record<string, unknown>).latitude = '31.2';
    (data[0][0].attributes as Record<string, unknown>).longitude = '121.5';
    const points = extractTimelinePoints(data, [{ entity: 'device_tracker.a' }]);
    expect(points).toHaveLength(1);
    expect(points[0].lat).toBe(31.2);
    expect(points[0].lng).toBe(121.5);
  });
});

describe('clipTimelineToIndex', () => {
  it('clips inclusive', () => {
    const points = extractTimelinePoints(sample, [
      { entity: 'device_tracker.a' },
      { entity: 'device_tracker.b' },
    ]);
    expect(clipTimelineToIndex(points, 1)).toHaveLength(2);
    expect(clipTimelineToIndex(points, -1)).toEqual([]);
  });
});

describe('buildHaPaths', () => {
  it('groups by entity', () => {
    const points = extractTimelinePoints(sample, [
      { entity: 'device_tracker.a', name: 'A', color: '#111111' },
      { entity: 'device_tracker.b', name: 'B', color: '#222222' },
    ]);
    const paths = buildHaPaths(points, [
      { entity: 'device_tracker.a', name: 'A', color: '#111111' },
      { entity: 'device_tracker.b', name: 'B', color: '#222222' },
    ], 24);
    expect(paths).toHaveLength(2);
    const a = paths.find((p) => p.name === 'A')!;
    expect(a.points).toHaveLength(2);
    expect(a.color).toBe('#111111');
  });

  it('sets fullDatetime when hours > 144 and sanitizes bad color', () => {
    const points = extractTimelinePoints(sample, [
      { entity: 'device_tracker.a', color: 'evil()' },
    ]);
    const paths = buildHaPaths(
      points,
      [{ entity: 'device_tracker.a', color: 'evil()' }],
      200
    );
    expect(paths[0].fullDatetime).toBe(true);
    expect(paths[0].color).toMatch(/^#/);
  });
});

describe('clipPointsToTime / timestampAtIndex', () => {
  it('clips by wall clock and reads timestamp', () => {
    const points = extractTimelinePoints(sample, [
      { entity: 'device_tracker.a' },
      { entity: 'device_tracker.b' },
    ]);
    const t = points[1].timestamp;
    expect(clipPointsToTime(points, t)).toHaveLength(2);
    expect(timestampAtIndex(points, 0)).toBe(points[0].timestamp);
    expect(timestampAtIndex([], 0)).toBeNull();
  });
});
