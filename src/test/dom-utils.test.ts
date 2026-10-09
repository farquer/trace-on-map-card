import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHtml } from '../dom-utils';

describe('escapeHtml / escapeAttr', () => {
  it('escapes markup', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
    expect(escapeHtml(`a&b"c`)).toBe('a&amp;b&quot;c');
  });

  it('escapeAttr also escapes single quotes', () => {
    expect(escapeAttr(`O'Brien`)).toContain('&#39;');
  });
});
