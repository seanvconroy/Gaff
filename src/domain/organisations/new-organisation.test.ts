import { describe, expect, it } from 'vitest';
import { inboundSlugFor, newOrganisationSchema } from './new-organisation';

describe('new organisation', () => {
  it('accepts a licensed agency', () => {
    const result = newOrganisationSchema.safeParse({
      yourName: 'Ann Power',
      name: 'Halcyon Lettings',
      kind: 'agency',
      psraLicenceNumber: '001 234',
    });
    expect(result.success && result.data.psraLicenceNumber).toBe('001234');
  });

  it('requires a PSRA licence number from an agency (Principle 4)', () => {
    const result = newOrganisationSchema.safeParse({
      yourName: 'Ann Power',
      name: 'Halcyon Lettings',
      kind: 'agency',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['psraLicenceNumber']);
  });

  it('rejects a licence number that does not look like one', () => {
    const result = newOrganisationSchema.safeParse({
      yourName: 'Ann Power',
      name: 'Halcyon Lettings',
      kind: 'agency',
      psraLicenceNumber: 'ABC',
    });
    expect(result.success).toBe(false);
  });

  it('does not need or keep a licence number for a landlord letting their own homes', () => {
    const result = newOrganisationSchema.safeParse({
      yourName: 'Seán Ó Briain',
      name: 'Ó Briain Homes',
      kind: 'landlord',
      psraLicenceNumber: '123456',
    });
    expect(result.success && result.data.psraLicenceNumber).toBeUndefined();
  });

  it('asks for a name in plain words', () => {
    const result = newOrganisationSchema.safeParse({ yourName: '', name: '', kind: 'landlord' });
    expect(result.error?.issues.map((i) => i.message)).toContain('Enter your name');
  });
});

describe('R5: Gaff address for an organisation', () => {
  it.each([
    ['Halcyon Lettings', 'halcyon-lettings'],
    ['Ó Briain & Daughters', 'o-briain-and-daughters'],
    ['  DUBLIN 6 Homes Ltd. ', 'dublin-6-homes-ltd'],
    ['!!!', 'operator'],
    ['Postmaster', 'postmaster-lettings'],
  ])('%s → %s', (name, slug) => {
    expect(inboundSlugFor(name)).toBe(slug);
  });

  it('keeps addresses short', () => {
    expect(inboundSlugFor('A'.repeat(100)).length).toBeLessThanOrEqual(40);
  });
});
