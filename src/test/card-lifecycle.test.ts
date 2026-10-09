import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackController } from '../playback';
import {
  resolveHassMapRefresh,
  resolveMapViewState,
} from '../view-state';
import type { HaMapPaths } from '../types';

/**
 * Lifecycle regressions that previously broke out-of-box playback:
 * 1) hass updates must not replace clipped paths
 * 2) disconnect/reconnect must allow resubscribe after detach
 */
describe('card lifecycle regressions', () => {
  const full: HaMapPaths[] = [{ name: 'full', points: [] }];
  const clipped: HaMapPaths[] = [{ name: 'clipped', points: [] }];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('simulates hass tick during scrub without resetting to full paths', () => {
    let display = clipped;
    let isLive = false;
    const playing = false;

    // User scrubbed to middle
    const view = resolveMapViewState({
      playing,
      timelineIndex: 1,
      timelineLength: 5,
      fullPaths: full,
      clippedPaths: clipped,
    });
    display = view.paths;
    isLive = view.isLive;
    expect(display).toBe(clipped);

    // hass setter fires
    const refresh = resolveHassMapRefresh({
      playing,
      isLive,
      displayPaths: display,
      fullPaths: full,
    });
    expect(refresh.paths).toBe(clipped);
    expect(refresh.showLiveEntities).toBe(false);
  });

  it('simulates disconnect detach + reconnect resubscribe', () => {
    const playback = new PlaybackController();
    const points = [
      { timestamp: 1, entityId: 'a', lat: 1, lng: 1 },
      { timestamp: 2, entityId: 'a', lat: 2, lng: 2 },
      { timestamp: 3, entityId: 'a', lat: 3, lng: 3 },
    ];
    playback.setPoints(points);

    let unsub: (() => void) | null = playback.subscribe(() => undefined);
    // disconnect
    playback.detach();
    unsub?.();
    unsub = null;

    // reconnect
    const indices: number[] = [];
    unsub = playback.subscribe((i) => indices.push(i));
    playback.play();
    vi.runAllTimers();
    expect(indices.length).toBeGreaterThan(0);
    expect(playback.index).toBe(2);
    unsub();
    playback.destroy();
  });
});
