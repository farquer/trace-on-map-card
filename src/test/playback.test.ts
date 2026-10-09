import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackController } from '../playback';
import type { TimelinePoint } from '../types';

const points: TimelinePoint[] = [
  { timestamp: 1000, entityId: 'a', lat: 1, lng: 1 },
  { timestamp: 2000, entityId: 'a', lat: 2, lng: 2 },
  { timestamp: 3000, entityId: 'a', lat: 3, lng: 3 },
];

describe('PlaybackController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('scrubs to index and pauses', () => {
    const c = new PlaybackController();
    c.setPoints(points);
    c.play();
    expect(c.playing).toBe(true);
    c.scrub(2);
    expect(c.playing).toBe(false);
    expect(c.index).toBe(2);
    c.destroy();
  });

  it('advances on play until end', () => {
    vi.useFakeTimers();
    const c = new PlaybackController();
    const indices: number[] = [];
    c.subscribe((i) => indices.push(i));
    c.setPoints(points);
    c.play();
    vi.runAllTimers();
    expect(c.index).toBe(2);
    expect(c.playing).toBe(false);
    expect(indices.at(-1)).toBe(2);
    c.destroy();
  });

  it('restarts from beginning when play at end', () => {
    const c = new PlaybackController();
    c.setPoints(points);
    c.scrub(2);
    c.play();
    expect(c.index).toBe(0);
    expect(c.playing).toBe(true);
    c.destroy();
  });
});
