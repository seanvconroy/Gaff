import { describe, expect, it } from 'vitest';
import {
  deletionDateAfterNotice,
  deletionRemoves,
  profileDeletionDate,
  profileNoticeDate,
  profileRetention,
  useIsWorthNoting,
} from './retention';

const at = (iso: string) => new Date(iso);

describe('UX-PF-7: a profile unused for two years is deleted, with a notice 30 days before', () => {
  it('UX-PF-7: the deletion date is two years after it was last used, on the Irish date', () => {
    expect(profileDeletionDate(at('2026-11-17T10:00:00Z'))).toBe('2028-11-17');
    // Summer time: 11:30pm on 30 June in Dublin is 10:30pm UTC, and half past midnight is 1 July.
    expect(profileDeletionDate(at('2026-06-30T22:30:00Z'))).toBe('2028-06-30');
    expect(profileDeletionDate(at('2026-06-30T23:30:00Z'))).toBe('2028-07-01');
    // 29 February has no day two years on.
    expect(profileDeletionDate(at('2028-02-29T12:00:00Z'))).toBe('2030-03-01');
  });

  it('UX-PF-7: the notice is due 30 days before', () => {
    expect(profileNoticeDate(at('2026-11-17T10:00:00Z'))).toBe('2028-10-18');
  });

  it('UX-PF-7: nothing happens to a profile that has been used lately', () => {
    const profile = { lastUsedAt: at('2026-11-17T10:00:00Z'), noticeSentAt: null };
    expect(profileRetention(profile, at('2026-11-18T03:00:00Z'))).toBe('keep');
    expect(profileRetention(profile, at('2028-10-17T03:00:00Z'))).toBe('keep');
  });

  it('UX-PF-7: 30 days before two years, the notice is sent, once', () => {
    const lastUsedAt = at('2026-11-17T10:00:00Z');
    expect(profileRetention({ lastUsedAt, noticeSentAt: null }, at('2028-10-18T03:00:00Z'))).toBe(
      'send_notice',
    );
    const noticed = { lastUsedAt, noticeSentAt: at('2028-10-18T03:00:00Z') };
    expect(profileRetention(noticed, at('2028-10-19T03:00:00Z'))).toBe('keep');
    expect(profileRetention(noticed, at('2028-11-16T03:00:00Z'))).toBe('keep');
  });

  it('UX-PF-7: at two years, a profile whose notice went 30 days ago is deleted', () => {
    const noticed = {
      lastUsedAt: at('2026-11-17T10:00:00Z'),
      noticeSentAt: at('2028-10-18T03:00:00Z'),
    };
    expect(profileRetention(noticed, at('2028-11-17T03:00:00Z'))).toBe('delete');
    expect(deletionDateAfterNotice(noticed.lastUsedAt, noticed.noticeSentAt)).toBe('2028-11-17');
  });

  it('UX-PF-7: a late notice still gives 30 days: nobody is deleted on less', () => {
    const lastUsedAt = at('2026-11-17T10:00:00Z');
    // The job was down: two years have passed and no notice went.
    expect(profileRetention({ lastUsedAt, noticeSentAt: null }, at('2028-11-20T03:00:00Z'))).toBe(
      'send_notice',
    );
    const noticed = { lastUsedAt, noticeSentAt: at('2028-11-20T03:00:00Z') };
    expect(deletionDateAfterNotice(lastUsedAt, noticed.noticeSentAt)).toBe('2028-12-20');
    expect(profileRetention(noticed, at('2028-12-19T03:00:00Z'))).toBe('keep');
    expect(profileRetention(noticed, at('2028-12-20T03:00:00Z'))).toBe('delete');
  });

  it('UX-PF-7: using the profile is noted once a day, and always when a notice is out', () => {
    const lastUsedAt = at('2026-11-17T10:00:00Z');
    expect(useIsWorthNoting({ lastUsedAt, noticeSentAt: null }, at('2026-11-17T18:00:00Z'))).toBe(
      false,
    );
    expect(useIsWorthNoting({ lastUsedAt, noticeSentAt: null }, at('2026-11-18T09:00:00Z'))).toBe(
      true,
    );
    expect(
      useIsWorthNoting(
        { lastUsedAt, noticeSentAt: at('2026-11-17T11:00:00Z') },
        at('2026-11-17T18:00:00Z'),
      ),
    ).toBe(true);
  });
});

describe('UX-PF-6: what "Delete my profile" removes', () => {
  it('UX-PF-6: for someone who only rents, everything goes, the sign-in included', () => {
    expect(deletionRemoves({ organisations: 0 })).toEqual({
      kept: true,
      enquiries: true,
      account: true,
    });
  });

  it('UX-PF-6: someone who also lets homes keeps the sign-in their lettings need', () => {
    expect(deletionRemoves({ organisations: 1 })).toEqual({
      kept: true,
      enquiries: true,
      account: false,
    });
  });
});
