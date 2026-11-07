import { describe, expect, it } from 'vitest';
import { agencyProfileSchema, memberProfileSchema } from './profile';

describe('M17: the agency’s public profile', () => {
  it('takes the legal name and optional details', () => {
    const parsed = agencyProfileSchema.parse({
      legalName: 'Halcyon Property Solutions Ltd',
      officeAddress: '',
      publicPhone: '01 234 5678',
      website: 'https://halcyon.example.ie',
      about: 'Lettings across south Dublin since 2011.',
    });
    expect(parsed).toMatchObject({
      legalName: 'Halcyon Property Solutions Ltd',
      officeAddress: undefined,
    });
  });

  it('keeps protected grounds and contact details out of the description', () => {
    const noHap = agencyProfileSchema.safeParse({ legalName: 'Halcyon', about: 'No HAP please' });
    expect(noHap.success).toBe(false);
    const link = agencyProfileSchema.safeParse({ legalName: 'Halcyon', about: 'See www.x.ie' });
    expect(link.error?.issues[0]?.message).toMatch(/their own boxes/);
  });

  it('wants websites on https', () => {
    expect(
      agencyProfileSchema.safeParse({ legalName: 'Halcyon', website: 'http://x.ie' }).success,
    ).toBe(false);
  });
});

describe('M18: an agent’s public profile', () => {
  it('needs a number to show when showing one', () => {
    const parsed = memberProfileSchema.safeParse({ displayName: 'Ann Power', showPhone: 'yes' });
    expect(parsed.error?.issues[0]?.path).toEqual(['publicPhone']);
    expect(
      memberProfileSchema.parse({
        displayName: 'Ann Power',
        psraLicenceNumber: '00 2345',
        showPhone: 'no',
      }),
    ).toMatchObject({ psraLicenceNumber: '002345', showPhone: false });
  });
});
