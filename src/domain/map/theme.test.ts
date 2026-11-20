import { describe, expect, it } from 'vitest';
import { mapScheme, resolveTheme } from './theme';

describe('M130: the map follows the page’s theme', () => {
  it('follows the device when the page doesn’t say', () => {
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('', true)).toBe('dark');
  });

  it('lets the page’s own theme win over the device, as the tokens’ stylesheet does', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('sepia', true)).toBe('dark');
  });

  it('M129: stays light, with light pins, until a dark map is ready', () => {
    expect(mapScheme('dark', false)).toBe('light');
    expect(mapScheme('dark', true)).toBe('dark');
    expect(mapScheme('light', true)).toBe('light');
  });
});
