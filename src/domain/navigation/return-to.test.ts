import { describe, expect, it } from 'vitest';
import { returnPath, withReturn } from './return-to';

describe('UX-NV-6: leaving a focused task returns the user to where they started', () => {
  it('goes back to the page that opened the task', () => {
    expect(returnPath('/today', '/lettings')).toBe('/today');
    expect(returnPath('/lettings/3f0c2a9e/shortlist', '/lettings')).toBe(
      '/lettings/3f0c2a9e/shortlist',
    );
  });

  it('falls back to the task’s own starting place when nothing, or nonsense, is given', () => {
    expect(returnPath(undefined, '/lettings')).toBe('/lettings');
    expect(returnPath('', '/lettings')).toBe('/lettings');
    expect(returnPath(['/today', '/inbox'], '/lettings')).toBe('/lettings');
    expect(returnPath('today', '/lettings')).toBe('/lettings');
  });

  it('never leaves Gaff: another site’s address is ignored', () => {
    for (const elsewhere of [
      'https://example.ie/today',
      '//example.ie/today',
      '/\\example.ie',
      '/today\\..',
      '/%2F/example.ie',
      '/today?next=https://example.ie',
      '/today#top',
      '/to day',
      'javascript:alert(1)',
    ]) {
      expect(returnPath(elsewhere, '/lettings')).toBe('/lettings');
    }
  });

  it('builds the link that opens a task from a page', () => {
    expect(withReturn('/lettings/new', '/today')).toBe('/lettings/new?from=%2Ftoday');
  });
});
