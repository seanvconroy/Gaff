import { describe, expect, it } from 'vitest';
import { listingPageState, paginate, searchIsIndexable } from './pages';

const now = new Date('2026-11-07T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('M74: a let or withdrawn home keeps its page for 90 days', () => {
  it('keeps an open listing’s page', () => {
    expect(listingPageState({ status: 'live', closedAt: null }, now)).toBe('open');
    expect(listingPageState({ status: 'let_agreed', closedAt: null }, now)).toBe('open');
  });

  it('says a home is let for 90 days, then the page goes', () => {
    expect(listingPageState({ status: 'let', closedAt: daysAgo(10) }, now)).toBe('closed');
    expect(listingPageState({ status: 'withdrawn', closedAt: daysAgo(90) }, now)).toBe('closed');
    expect(listingPageState({ status: 'let', closedAt: daysAgo(91) }, now)).toBe('gone');
  });
});

describe('M111: which searches search engines index', () => {
  it('indexes area pages but not filtered searches', () => {
    expect(searchIsIndexable('')).toBe(true);
    expect(searchIsIndexable('beds=2')).toBe(false);
  });
});

describe('Pages of results', () => {
  it('keeps the page asked for in range', () => {
    expect(paginate(0, 1)).toEqual({ pages: 1, page: 1, offset: 0 });
    expect(paginate(45, 2)).toEqual({ pages: 3, page: 2, offset: 20 });
    expect(paginate(45, 9)).toEqual({ pages: 3, page: 3, offset: 40 });
  });
});
