import { describe, expect, it } from 'vitest';
import { listingReportSchema } from './report';

describe('UX-TS-3: reporting a listing', () => {
  it('UX-TS-3: one of four tap answers', () => {
    expect(listingReportSchema.parse({ reason: 'scam' })).toEqual({
      reason: 'scam',
      note: undefined,
    });
    expect(listingReportSchema.safeParse({ reason: 'other' }).success).toBe(false);
    expect(listingReportSchema.safeParse({}).success).toBe(false);
  });

  it('UX-TS-3: "Something else" needs a short note, and only it keeps one', () => {
    expect(listingReportSchema.safeParse({ reason: 'something_else', note: ' ' }).success).toBe(
      false,
    );
    expect(
      listingReportSchema.safeParse({ reason: 'something_else', note: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(
      listingReportSchema.parse({
        reason: 'something_else',
        note: ' The photos are of another home ',
      }),
    ).toEqual({ reason: 'something_else', note: 'The photos are of another home' });
    expect(listingReportSchema.parse({ reason: 'unfair', note: 'ignored' })).toEqual({
      reason: 'unfair',
      note: undefined,
    });
  });
});
