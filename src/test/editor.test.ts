import { describe, expect, it } from 'vitest';
import '../editor';

describe('trace-on-map-card-editor', () => {
  it('is registered', () => {
    expect(customElements.get('trace-on-map-card-editor')).toBeTruthy();
  });

  it('renders and emits config-changed on hours change', async () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as HTMLElement & {
      setConfig: (c: Record<string, unknown>) => void;
    };
    document.body.appendChild(el);
    const events: unknown[] = [];
    el.addEventListener('config-changed', (e) => {
      events.push((e as CustomEvent).detail.config);
    });

    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: ['device_tracker.a'],
      hours_to_show: 24,
    });

    const hours = el.shadowRoot!.getElementById('hours') as HTMLInputElement;
    expect(hours.value).toBe('24');
    hours.value = '1000';
    hours.dispatchEvent(new Event('change'));

    expect(events.length).toBeGreaterThan(0);
    const last = events.at(-1) as { hours_to_show: number };
    expect(last.hours_to_show).toBe(720);

    el.remove();
  });

  it('clamps hours in UI field max attribute', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as HTMLElement & {
      setConfig: (c: Record<string, unknown>) => void;
    };
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'person.a' }],
    });
    const hours = el.shadowRoot!.getElementById('hours') as HTMLInputElement;
    expect(hours.min).toBe('1');
    expect(hours.max).toBe('720');
  });

  it('updates theme, toggles, entities add/remove', () => {
    const el = document.createElement(
      'trace-on-map-card-editor'
    ) as HTMLElement & {
      setConfig: (c: Record<string, unknown>) => void;
    };
    document.body.appendChild(el);
    const events: Array<Record<string, unknown>> = [];
    el.addEventListener('config-changed', (e) => {
      events.push((e as CustomEvent).detail.config);
    });
    el.setConfig({
      type: 'custom:trace-on-map-card',
      entities: [{ entity: 'device_tracker.a', name: 'A', color: '#0288d1' }],
      theme_mode: 'auto',
    });

    const theme = el.shadowRoot!.getElementById('theme') as HTMLSelectElement;
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change'));
    expect(events.at(-1)?.theme_mode).toBe('dark');

    const fitZones = el.shadowRoot!.getElementById(
      'fit_zones'
    ) as HTMLInputElement;
    fitZones.checked = true;
    fitZones.dispatchEvent(new Event('change'));
    expect(events.at(-1)?.fit_zones).toBe(true);

    el.shadowRoot!.getElementById('add-entity')!.dispatchEvent(
      new Event('click')
    );
    const cfg = events.at(-1) as { entities: unknown[] };
    expect(cfg.entities.length).toBe(2);

    const del = el.shadowRoot!.querySelector('[data-del]') as HTMLButtonElement;
    del.click();
    expect(
      (events.at(-1) as { entities: unknown[] }).entities.length
    ).toBeLessThan(2);

    el.remove();
  });
});
