import { describe, expect, it } from 'vitest';
import { lettingsOpensOn } from './one-home';

describe('UX-NV-7: a private landlord with one home has no list of one', () => {
  it('Lettings opens straight on that home’s page', () => {
    expect(lettingsOpensOn({ organisationKind: 'landlord', lettingIds: ['3f0c'] })).toBe(
      '/lettings/3f0c',
    );
  });

  it('with no home yet, or more than one, it is the list', () => {
    expect(lettingsOpensOn({ organisationKind: 'landlord', lettingIds: [] })).toBeNull();
    expect(
      lettingsOpensOn({ organisationKind: 'landlord', lettingIds: ['3f0c', '9a1b'] }),
    ).toBeNull();
  });

  it('an agency always sees its list, even of one', () => {
    expect(lettingsOpensOn({ organisationKind: 'agency', lettingIds: ['3f0c'] })).toBeNull();
  });
});
