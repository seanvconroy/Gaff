import { describe, expect, it } from 'vitest';
import { dotsFor, photoInView } from './card-photos';

const shape = (count: number, shown: number) =>
  dotsFor(count, shown)
    .map((dot) => (dot.current ? 'O' : dot.small ? '.' : 'o'))
    .join('');

describe('UX-SR-6: a card’s photos, as dots', () => {
  it('has no dots for one photo, or none', () => {
    expect(dotsFor(0, 0)).toEqual([]);
    expect(dotsFor(1, 0)).toEqual([]);
  });

  it('has a dot for each photo, up to five', () => {
    expect(shape(2, 0)).toBe('Oo');
    expect(shape(3, 2)).toBe('ooO');
    expect(shape(5, 4)).toBe('ooooO');
  });

  it('shows five of more, the edge small while there are more past it', () => {
    expect(shape(8, 0)).toBe('Oooo.');
    expect(shape(8, 2)).toBe('ooOo.');
    expect(shape(8, 3)).toBe('.oOo.');
    expect(shape(8, 5)).toBe('.oOoo');
    expect(shape(8, 7)).toBe('.oooO');
  });

  it('names the photo each dot stands for', () => {
    expect(dotsFor(8, 4).map((dot) => dot.index)).toEqual([2, 3, 4, 5, 6]);
  });

  it('keeps to the photos there are, whatever it is told', () => {
    expect(shape(3, 9)).toBe('ooO');
    expect(shape(3, -1)).toBe('Ooo');
  });
});

describe('UX-SR-6: the photo a strip has come to', () => {
  it('is the one most in view', () => {
    expect(photoInView(0, 300, 4)).toBe(0);
    expect(photoInView(149, 300, 4)).toBe(0);
    expect(photoInView(151, 300, 4)).toBe(1);
    expect(photoInView(900, 300, 4)).toBe(3);
  });

  it('is never past the last, and is the first before the strip has a size', () => {
    expect(photoInView(5000, 300, 4)).toBe(3);
    expect(photoInView(120, 0, 4)).toBe(0);
  });
});
