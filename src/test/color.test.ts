import { describe, expect, it } from 'vitest';
import { sanitizeCssColor } from '../color';

describe('sanitizeCssColor', () => {
  it('allows hex colors', () => {
    expect(sanitizeCssColor('#fff')).toBe('#fff');
    expect(sanitizeCssColor('#0288d1')).toBe('#0288d1');
    expect(sanitizeCssColor('#0288d1ff')).toBe('#0288d1ff');
  });

  it('allows rgb/rgba', () => {
    expect(sanitizeCssColor('rgb(2, 136, 209)')).toBe('rgb(2, 136, 209)');
    expect(sanitizeCssColor('rgba(2,136,209,0.5)')).toBe(
      'rgba(2, 136, 209, 0.5)'
    );
  });

  it('rejects unsafe / invalid values', () => {
    expect(sanitizeCssColor('red" onload="alert(1)', '#111')).toBe('#111');
    expect(sanitizeCssColor('url(javascript:alert(1))', '#111')).toBe('#111');
    expect(sanitizeCssColor('expression(alert(1))', '#111')).toBe('#111');
    expect(sanitizeCssColor('rgb(300,0,0)', '#111')).toBe('#111');
    expect(sanitizeCssColor('', '#111')).toBe('#111');
    expect(sanitizeCssColor(null, '#222')).toBe('#222');
  });
});
