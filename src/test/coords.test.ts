import { describe, expect, it } from 'vitest';
import { toCoordNumber } from '../coords';

describe('toCoordNumber', () => {
  it('accepts finite numbers', () => {
    expect(toCoordNumber(1.5)).toBe(1.5);
    expect(toCoordNumber(0)).toBe(0);
    expect(toCoordNumber(-10)).toBe(-10);
  });

  it('accepts numeric strings', () => {
    expect(toCoordNumber('39.9')).toBe(39.9);
    expect(toCoordNumber(' 116.4 ')).toBe(116.4);
  });

  it('rejects invalid values', () => {
    expect(toCoordNumber(NaN)).toBeNull();
    expect(toCoordNumber(Infinity)).toBeNull();
    expect(toCoordNumber('')).toBeNull();
    expect(toCoordNumber('  ')).toBeNull();
    expect(toCoordNumber('abc')).toBeNull();
    expect(toCoordNumber(null)).toBeNull();
    expect(toCoordNumber(undefined)).toBeNull();
    expect(toCoordNumber({})).toBeNull();
  });
});
