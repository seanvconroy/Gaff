import { describe, expect, it } from 'vitest';
import { failureKinds, failuresNeedALook, readCount } from './counts';

describe('M133: the map is counted by fixed codes only', () => {
  it('takes the events and kinds on the list', () => {
    expect(readCount('opened', 'phone')).toEqual({ event: 'opened', kind: 'phone' });
    expect(readCount('shown', 'larger')).toEqual({ event: 'shown', kind: 'larger' });
    expect(readCount('failed', 'auth')).toEqual({ event: 'failed', kind: 'auth' });
    expect(readCount('pin_opened', null)).toEqual({ event: 'pin_opened', kind: '' });
    expect(readCount('area_searched', '')).toEqual({ event: 'area_searched', kind: '' });
  });

  it('M120: counts every way the map can fail, an error thrown inside it included', () => {
    expect([...failureKinds]).toEqual(['script', 'auth', 'google', 'timeout', 'error']);
    for (const kind of failureKinds) {
      expect(readCount('failed', kind)).toEqual({ event: 'failed', kind });
    }
  });

  it('ignores anything else, so nothing a renter typed or searched can be stored', () => {
    expect(readCount('opened', 'rathmines')).toBeNull();
    expect(readCount('opened', null)).toBeNull();
    expect(readCount('failed', 'phone')).toBeNull();
    expect(readCount('pin_opened', '2-bed-apartment-in-ranelagh')).toBeNull();
    expect(readCount('searched_for', 'kinsale')).toBeNull();
    expect(readCount(null, null)).toBeNull();
  });

  it('asks for a person’s look when more than 1 in 20 opens fail, on a day with 50 or more', () => {
    expect(failuresNeedALook({ opened: 200, failed: 11 })).toBe(true);
    expect(failuresNeedALook({ opened: 200, failed: 10 })).toBe(false);
    // Too few opens to mean anything: one renter with a blocker.
    expect(failuresNeedALook({ opened: 12, failed: 6 })).toBe(false);
    expect(failuresNeedALook({ opened: 0, failed: 0 })).toBe(false);
  });
});
