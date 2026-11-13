import { describe, expect, it } from 'vitest';
import {
  assertMove,
  canMove,
  isPublic,
  isSearchable,
  listingStatuses,
  statusWords,
} from './lifecycle';

describe('M50: a listing’s status follows its letting', () => {
  it('publishes a draft, straight to live or through review', () => {
    expect(canMove('draft', 'live')).toBe(true);
    expect(canMove('draft', 'in_review')).toBe(true);
    expect(canMove('in_review', 'live')).toBe(true);
  });

  it('pauses and reopens, closes enquiries, and is let', () => {
    expect(canMove('live', 'paused')).toBe(true);
    expect(canMove('paused', 'live')).toBe(true);
    expect(canMove('live', 'enquiries_closed')).toBe(true);
    expect(canMove('let_agreed', 'let')).toBe(true);
    expect(canMove('let_agreed', 'live')).toBe(true);
  });

  it('never leaves let or withdrawn, and never skips to let', () => {
    for (const to of listingStatuses) {
      expect(canMove('let', to)).toBe(false);
      expect(canMove('withdrawn', to)).toBe(false);
    }
    expect(canMove('live', 'let')).toBe(false);
    expect(() => assertMove('draft', 'let')).toThrow(/draft to let/);
  });

  it('shows public pages only for statuses renters can see, and searches live ones only', () => {
    expect(isPublic('draft')).toBe(false);
    expect(isPublic('in_review')).toBe(false);
    expect(isPublic('paused')).toBe(false);
    expect(isPublic('let')).toBe(true);
    expect(isSearchable('live')).toBe(true);
    expect(isSearchable('enquiries_closed')).toBe(false);
    expect(statusWords.let_agreed).toBe('Let agreed');
  });
});
