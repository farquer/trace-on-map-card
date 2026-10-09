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

  it('toggle and length helpers', () => {
    const c = new PlaybackController();
    expect(c.length).toBe(0);
    c.setPoints(points);
    expect(c.length).toBe(3);
    c.toggle();
    expect(c.playing).toBe(true);
    c.toggle();
    expect(c.playing).toBe(false);
    c.scrub(-10);
    expect(c.index).toBe(0);
    c.destroy();
  });

  it('detach pauses but allows resubscribe (reconnect regression)', () => {
    vi.useFakeTimers();
    const c = new PlaybackController();
    const seen: number[] = [];
    c.setPoints(points);
    const unsub = c.subscribe((i) => seen.push(i));
    c.play();
    c.detach();
    expect(c.playing).toBe(false);
    unsub();
    const seen2: number[] = [];
    c.subscribe((i) => seen2.push(i));
    c.play();
    vi.runAllTimers();
    expect(seen2.length).toBeGreaterThan(0);
    expect(c.index).toBe(2);
    c.destroy();
  });
});
