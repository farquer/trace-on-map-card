import { describe, expect, it } from 'vitest';
import {
  clampHours,
  clampZoom,
  compareHaVersions,
  isHaVersionSupported,
  normalizeEntityConfigs,
  parseAspectRatio,
  parseHaVersion,
} from '../utils';

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
    expect(clampZoom('nope')).toBe(14);
  });

  it('clamps range', () => {
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(99)).toBe(20);
    expect(clampZoom('8')).toBe(8);
  });
});

describe('resolveThemeMode / formatters / colorForEntity', () => {
  it('resolves theme', async () => {
    const { resolveThemeMode, colorForEntity, formatTime, formatDateTime, isZoneEntity } =
      await import('../utils');
    expect(resolveThemeMode({ type: 'x', entities: [], theme_mode: 'light' })).toBe(
      'light'
    );
    expect(resolveThemeMode({ type: 'x', entities: [], dark_mode: true })).toBe(
      'dark'
    );
    expect(resolveThemeMode({ type: 'x', entities: [] })).toBe('auto');
    expect(isZoneEntity('zone.home')).toBe(true);
    expect(isZoneEntity('person.a')).toBe(false);
    expect(colorForEntity('a', [{ entity: 'a', color: '#abc' }])).toBe('#abc');
    expect(typeof formatTime(new Date('2026-01-01T12:00:00Z'))).toBe('string');
    expect(typeof formatDateTime(new Date('2026-01-01T12:00:00Z'))).toBe(
      'string'
    );
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

describe('HA version gate (>= 2026.9.0)', () => {
  it('parses core versions', () => {
    expect(parseHaVersion('2026.9.0')).toEqual([2026, 9, 0]);
    expect(parseHaVersion('2026.9.3b0')).toEqual([2026, 9, 3]);
  });

  it('compares versions', () => {
    expect(compareHaVersions('2026.9.0', '2026.9.0')).toBe(0);
    expect(compareHaVersions('2026.8.9', '2026.9.0')).toBe(-1);
    expect(compareHaVersions('2026.10.0', '2026.9.0')).toBe(1);
    expect(compareHaVersions('bad', '2026.9.0')).toBe(-1);
    expect(compareHaVersions('2026.9.0', 'bad')).toBe(1);
    expect(compareHaVersions('bad', 'also-bad')).toBe(0);
  });

  it('accepts 2026.9.x and above only', () => {
    expect(isHaVersionSupported('2026.9.0')).toBe(true);
    expect(isHaVersionSupported('2026.9.4')).toBe(true);
    expect(isHaVersionSupported('2026.10.0')).toBe(true);
    expect(isHaVersionSupported('2026.8.4')).toBe(false);
    expect(isHaVersionSupported('2025.12.0')).toBe(false);
    expect(isHaVersionSupported(undefined)).toBe(false);
  });
});
