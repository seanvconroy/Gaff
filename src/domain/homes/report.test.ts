import { describe, expect, it } from 'vitest';
import {
  REPORT_KEPT_DAYS,
  hideListingSchema,
  likeliestReason,
  listingReportSchema,
  reportDeleteAfter,
} from './report';

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

describe('UX-TS-3, UX-TS-4: keeping a report, and hiding a listing', () => {
  it('UX-TS-3 (rule 9): a report is deleted six months after it was answered', () => {
    const answered = new Date('2026-11-17T10:00:00Z');
    expect(REPORT_KEPT_DAYS).toBe(183);
    expect(reportDeleteAfter(answered).toISOString()).toBe('2027-05-19T10:00:00.000Z');
  });

  it('UX-TS-4: a listing is hidden for one of the four reasons, and no other', () => {
    const lettingId = crypto.randomUUID();
    expect(hideListingSchema.parse({ lettingId, reason: 'scam' })).toEqual({
      lettingId,
      reason: 'scam',
    });
    expect(hideListingSchema.safeParse({ lettingId, reason: 'spite' }).success).toBe(false);
    expect(hideListingSchema.safeParse({ lettingId: 'nope', reason: 'scam' }).success).toBe(false);
  });

  it('UX-TS-4: the reason offered first is the one most reports gave, then the latest', () => {
    const at = (day: number) => new Date(Date.UTC(2026, 10, day));
    expect(likeliestReason([])).toBeNull();
    expect(
      likeliestReason([
        { reason: 'scam', receivedAt: at(1) },
        { reason: 'unfair', receivedAt: at(3) },
        { reason: 'scam', receivedAt: at(2) },
      ]),
    ).toBe('scam');
    expect(
      likeliestReason([
        { reason: 'scam', receivedAt: at(1) },
        { reason: 'wrong_details', receivedAt: at(4) },
      ]),
    ).toBe('wrong_details');
  });
});
