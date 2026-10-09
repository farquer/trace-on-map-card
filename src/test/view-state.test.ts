import { describe, expect, it } from 'vitest';
import type { HaMapPaths } from '../types';
import { resolveHassMapRefresh, resolveMapViewState } from '../view-state';

const full: HaMapPaths[] = [
  { points: [{ point: [1, 2], timestamp: new Date(1) }], name: 'full' },
];
const clipped: HaMapPaths[] = [
  { points: [{ point: [1, 2], timestamp: new Date(1) }], name: 'clipped' },
];

describe('resolveMapViewState', () => {
  it('shows live full paths at end when not playing', () => {
    const v = resolveMapViewState({
      playing: false,
      timelineIndex: 4,
      timelineLength: 5,
      fullPaths: full,
      clippedPaths: clipped,
    });
    expect(v.isLive).toBe(true);
    expect(v.showLiveEntities).toBe(true);
    expect(v.paths).toBe(full);
  });

  it('shows clipped paths while playing even at end', () => {
    const v = resolveMapViewState({
      playing: true,
      timelineIndex: 4,
      timelineLength: 5,
      fullPaths: full,
      clippedPaths: clipped,
    });
    expect(v.isLive).toBe(false);
    expect(v.showLiveEntities).toBe(false);
    expect(v.paths).toBe(clipped);
  });

  it('shows clipped paths while scrubbing mid timeline', () => {
    const v = resolveMapViewState({
      playing: false,
      timelineIndex: 2,
      timelineLength: 5,
      fullPaths: full,
      clippedPaths: clipped,
    });
    expect(v.isLive).toBe(false);
    expect(v.paths).toBe(clipped);
  });

  it('empty timeline is live', () => {
    const v = resolveMapViewState({
      playing: false,
      timelineIndex: 0,
      timelineLength: 0,
      fullPaths: full,
      clippedPaths: clipped,
    });
    expect(v.isLive).toBe(true);
    expect(v.paths).toBe(full);
  });
});

describe('resolveHassMapRefresh', () => {
  it('keeps display paths during scrub/play (regression: hass must not reset paths)', () => {
    expect(
      resolveHassMapRefresh({
        playing: true,
        isLive: false,
        displayPaths: clipped,
        fullPaths: full,
      })
    ).toEqual({ paths: clipped, showLiveEntities: false });

    expect(
      resolveHassMapRefresh({
        playing: false,
        isLive: false,
        displayPaths: clipped,
        fullPaths: full,
      })
    ).toEqual({ paths: clipped, showLiveEntities: false });
  });

  it('uses full paths only when live and idle', () => {
    expect(
      resolveHassMapRefresh({
        playing: false,
        isLive: true,
        displayPaths: clipped,
        fullPaths: full,
      })
    ).toEqual({ paths: full, showLiveEntities: true });
  });
});
