export interface LoadCardHelpers {
  createCardElement: (config: Record<string, unknown>) => Promise<HTMLElement> | HTMLElement;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<LoadCardHelpers>;
  }
}

export function isHaMapAvailable(): boolean {
  return typeof customElements !== 'undefined' && !!customElements.get('ha-map');
}

/**
 * Ensure `ha-map` is registered. Tries loadCardHelpers + probe map card when lazy-loaded.
 */
export async function ensureHaMapLoaded(
  timeoutMs = 10000,
  deps: {
    isAvailable?: () => boolean;
    whenDefined?: (name: string) => Promise<unknown>;
    loadHelpers?: () => Promise<LoadCardHelpers | undefined>;
  } = {}
): Promise<boolean> {
  const isAvailable = deps.isAvailable ?? isHaMapAvailable;
  if (isAvailable()) return true;

  const loadHelpers =
    deps.loadHelpers ??
    (async () => {
      try {
        return await window.loadCardHelpers?.();
      } catch {
        return undefined;
      }
    });

  try {
    const helpers = await loadHelpers();
    if (helpers?.createCardElement) {
      try {
        await helpers.createCardElement({
          type: 'map',
          entities: [],
          hours_to_show: 0,
        });
      } catch {
        // Probe may throw on empty entities; registration may still succeed.
      }
    }
  } catch {
    /* ignore */
  }

  if (isAvailable()) return true;

  const whenDefined =
    deps.whenDefined ??
    ((name: string) => customElements.whenDefined(name));

  try {
    await Promise.race([
      whenDefined('ha-map'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ]);
  } catch {
    /* timeout or missing */
  }

  return isAvailable();
}

/** Best-effort resize / relayout after container size changes. */
export function notifyHaMapResize(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const map = el as HTMLElement & {
    fitMap?: () => void;
    invalidateSize?: () => void;
    resize?: () => void;
    requestUpdate?: () => void;
  };
  try {
    map.fitMap?.();
  } catch {
    /* ignore */
  }
  try {
    map.invalidateSize?.();
  } catch {
    /* ignore */
  }
  try {
    map.resize?.();
  } catch {
    /* ignore */
  }
  try {
    map.requestUpdate?.();
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event('resize'));
  } catch {
    /* ignore */
  }
}
