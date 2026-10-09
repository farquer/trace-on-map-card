import { describe, expect, it } from 'vitest';
import {
  assertEntitiesPresent,
  getCardSizeFromConfig,
  normalizeCardConfig,
  stubCardConfig,
} from '../card-config';

describe('normalizeCardConfig', () => {
  it('throws when entities missing', () => {
    expect(() =>
      normalizeCardConfig({ type: 'custom:trace-on-map-card', entities: [] })
    ).toThrow(/entities/i);
    expect(() => assertEntitiesPresent(null)).toThrow(/entities/i);
  });

  it('applies defaults and clamps hours', () => {
    const cfg = normalizeCardConfig({
      type: 'custom:trace-on-map-card',
      entities: ['device_tracker.a'],
      hours_to_show: 9999,
    });
    expect(cfg.hours_to_show).toBe(720);
    expect(cfg.auto_fit).toBe(true);
    expect(cfg.fit_zones).toBe(false);
    expect(cfg.cluster).toBe(true);
    expect(cfg.theme_mode).toBe('auto');
    expect(cfg.default_zoom).toBe(14);
  });

  it('maps dark_mode to theme_mode', () => {
    const cfg = normalizeCardConfig({
      type: 'custom:trace-on-map-card',
      entities: ['device_tracker.a'],
      dark_mode: true,
    });
    expect(cfg.theme_mode).toBe('dark');
  });

  it('respects explicit theme_mode over dark_mode', () => {
    const cfg = normalizeCardConfig({
      type: 'custom:trace-on-map-card',
      entities: ['device_tracker.a'],
      dark_mode: true,
      theme_mode: 'light',
    });
    expect(cfg.theme_mode).toBe('light');
  });
});

describe('getCardSizeFromConfig', () => {
  it('defaults to 6', () => {
    expect(getCardSizeFromConfig(null)).toBe(6);
  });

  it('scales with aspect_ratio', () => {
    expect(
      getCardSizeFromConfig({
        type: 'x',
        entities: ['a'],
        aspect_ratio: '16:9',
      })
    ).toBeGreaterThan(1);
  });
});

describe('stubCardConfig', () => {
  it('returns usable stub', () => {
    const stub = stubCardConfig();
    expect(stub.type).toBe('custom:trace-on-map-card');
    expect(stub.hours_to_show).toBe(24);
  });
});
