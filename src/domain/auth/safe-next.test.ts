import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('AU3: where to go after signing in', () => {
  it('keeps a path on Gaff, with a search’s filters', () => {
    expect(safeNext('/my/saved')).toBe('/my/saved');
    expect(safeNext('/to-rent/dublin-6?beds=2&max=2000')).toBe('/to-rent/dublin-6?beds=2&max=2000');
    expect(safeNext('/join/3f2c0c1e-0000-4000-8000-000000000000/abc_DEF-123')).toBe(
      '/join/3f2c0c1e-0000-4000-8000-000000000000/abc_DEF-123',
    );
  });

  it('never leaves Gaff', () => {
    for (const elsewhere of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/a:b',
      'javascript:alert(1)',
      '/ok#fragment<script>',
      'to-rent',
      '',
    ]) {
      expect(safeNext(elsewhere), elsewhere).toBe('/');
    }
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext(42)).toBe('/');
  });

  it('can fall back somewhere else', () => {
    expect(safeNext('https://evil.test', '/welcome')).toBe('/welcome');
  });
});
