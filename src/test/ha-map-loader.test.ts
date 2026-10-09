import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureHaMapLoaded, notifyHaMapResize } from '../ha-map-loader';

describe('ensureHaMapLoaded', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when already available', async () => {
    await expect(
      ensureHaMapLoaded(1000, { isAvailable: () => true })
    ).resolves.toBe(true);
  });

  it('probes loadCardHelpers then succeeds', async () => {
    const createCardElement = vi.fn(async () => document.createElement('div'));
    let available = false;
    const ok = await ensureHaMapLoaded(1000, {
      isAvailable: () => available,
      loadHelpers: async () => {
        available = true;
        return { createCardElement };
      },
      whenDefined: () => new Promise(() => undefined),
    });
    expect(createCardElement).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it('waits for whenDefined', async () => {
    let available = false;
    const ok = await ensureHaMapLoaded(1000, {
      isAvailable: () => available,
      loadHelpers: async () => undefined,
      whenDefined: async () => {
        available = true;
      },
    });
    expect(ok).toBe(true);
  });

  it('returns false on timeout', async () => {
    vi.useFakeTimers();
    const promise = ensureHaMapLoaded(50, {
      isAvailable: () => false,
      loadHelpers: async () => undefined,
      whenDefined: () => new Promise(() => undefined),
    });
    await vi.advanceTimersByTimeAsync(60);
    await expect(promise).resolves.toBe(false);
  });
});

describe('notifyHaMapResize', () => {
  it('invokes known resize hooks safely', () => {
    const fitMap = vi.fn();
    const invalidateSize = vi.fn();
    const el = document.createElement('div') as HTMLElement & {
      fitMap: () => void;
      invalidateSize: () => void;
    };
    el.fitMap = fitMap;
    el.invalidateSize = invalidateSize;
    notifyHaMapResize(el);
    expect(fitMap).toHaveBeenCalled();
    expect(invalidateSize).toHaveBeenCalled();
  });

  it('no-ops on null', () => {
    expect(() => notifyHaMapResize(null)).not.toThrow();
  });
});
