import { describe, expect, it } from 'vitest';
import {
  buildHaPaths,
  clipTimelineToIndex,
  extractTimelinePoints,
  normalizeHistories,
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
      { entity: 'device_tracker.a', name: 'A', color: '#111' },
      { entity: 'device_tracker.b', name: 'B', color: '#222' },
    ]);
    const paths = buildHaPaths(points, [
      { entity: 'device_tracker.a', name: 'A', color: '#111' },
      { entity: 'device_tracker.b', name: 'B', color: '#222' },
    ], 24);
    expect(paths).toHaveLength(2);
    const a = paths.find((p) => p.name === 'A')!;
    expect(a.points).toHaveLength(2);
    expect(a.color).toBe('#111');
  });
});
