import { describe, expect, it } from 'vitest';
import { clampHours, clampZoom, normalizeEntityConfigs, parseAspectRatio } from '../utils';

describe('clampHours', () => {
  it('defaults to 24 when missing', () => {
    expect(clampHours(undefined)).toBe(24);
    expect(clampHours(null)).toBe(24);
    expect(clampHours('')).toBe(24);
  });

  it('clamps below 1 to 1', () => {
    expect(clampHours(0)).toBe(1);
    expect(clampHours(-5)).toBe(1);
  });

  it('clamps above 720 to 720', () => {
    expect(clampHours(1000)).toBe(720);
    expect(clampHours(721)).toBe(720);
  });

  it('keeps valid values', () => {
    expect(clampHours(48)).toBe(48);
    expect(clampHours('72')).toBe(72);
  });
});

describe('clampZoom', () => {
  it('defaults to 14', () => {
    expect(clampZoom(undefined)).toBe(14);
  });

  it('clamps range', () => {
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(99)).toBe(20);
  });
});

describe('normalizeEntityConfigs', () => {
  it('normalizes mixed list', () => {
    expect(
      normalizeEntityConfigs([
        'device_tracker.a',
        { entity: 'person.b', name: 'B', color: '#fff' },
      ])
    ).toEqual([
      { entity: 'device_tracker.a' },
      { entity: 'person.b', name: 'B', color: '#fff' },
    ]);
  });
});

describe('parseAspectRatio', () => {
  it('parses w:h', () => {
    expect(parseAspectRatio('16:9')).toEqual({ w: 16, h: 9 });
  });

  it('returns null for invalid', () => {
    expect(parseAspectRatio('foo')).toBeNull();
  });
});
