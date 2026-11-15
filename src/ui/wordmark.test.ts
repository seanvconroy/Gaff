import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wordmarkFullStop, wordmarkInkPerEm, wordmarkLetters, wordmarkSize } from './wordmarkPaths';

const fingerprint = (path: string) => createHash('sha256').update(path).digest('hex');

describe('the wordmark (Q29: it stays exactly as it is)', () => {
  it('UX-DS-22: its outlines are the lettering the product has always had, unchanged', () => {
    // If either of these changes, the wordmark has been redrawn. That is the founders' decision,
    // never a side effect: see scripts/wordmark/generate.py.
    expect(fingerprint(wordmarkLetters)).toBe(
      '597da44185b2c1c8c95c98605c174cb53e159b21c00bef9a4366802b59b5daca',
    );
    expect(fingerprint(wordmarkFullStop)).toBe(
      'be914cd014fe06c0990dc3470a7cb03910737ff35b0c05a2835d168a21438ff0',
    );
  });

  it('UX-DS-23: the key is two separate "f"s whose crossbars meet, not a ligature', () => {
    const header = readFileSync('src/ui/wordmarkPaths.ts', 'utf8')
      .split('\n')
      .slice(0, 2)
      .join(' ');
    expect(header).toContain('weight 600, optical size 144');
    expect(header).toContain('letter-spacing -0.01em');
    expect(header).toContain('glyphs: g a f f period');
  });

  it('UX-DS-22: the full stop is drawn apart from the letters, so it can take the brand colour', () => {
    // Eight outlines between "g", "a" and the two "f"s (counters included); one for the full stop.
    expect(wordmarkLetters.match(/M/g)).toHaveLength(8);
    expect(wordmarkFullStop.match(/M/g)).toHaveLength(1);
    // The full stop sits at the right-hand end of the drawing, on the baseline.
    const [x] = /^M(\d+)/.exec(wordmarkFullStop)!.slice(1).map(Number) as [number];
    expect(x).toBeGreaterThan(wordmarkSize.width * 0.85);
  });

  it('the drawing is cropped to its ink, and as tall as 28px Fraunces was', () => {
    expect(wordmarkSize).toEqual({ width: 3245, height: 1922 });
    expect(wordmarkInkPerEm * 28).toBeCloseTo(26.91, 2);
    // Every coordinate is inside the drawing.
    const numbers = `${wordmarkLetters} ${wordmarkFullStop}`.match(/-?\d+/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(wordmarkSize.width);
  });
});
