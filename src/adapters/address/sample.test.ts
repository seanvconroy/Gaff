import { describe, expect, it } from 'vitest';
import { noAddressSearch } from './index';
import { sampleAddressSearch } from './sample';

describe('UX-LT-9: the stand-in for address search', () => {
  it('UX-LT-9: an Eircode, however it is typed, finds the one full address', async () => {
    const found = await sampleAddressSearch.suggest('d06f2x3');
    expect(found).toEqual([
      { id: found[0]!.id, label: '12 Ranelagh Road, Ranelagh, Dublin 6, D06 F2X3' },
    ]);
    expect(await sampleAddressSearch.lookUp(found[0]!.id)).toEqual({
      addressLine1: '12 Ranelagh Road',
      area: 'Ranelagh, Dublin 6',
      county: 'Dublin',
      eircode: 'D06 F2X3',
    });
  });

  it('UX-LT-9: typed words find addresses, whatever their case or accents', async () => {
    const labels = async (query: string) =>
      (await sampleAddressSearch.suggest(query)).map((each) => each.label);
    expect(await labels('ranelagh road')).toHaveLength(2);
    expect(await labels('dun laoghaire')).toEqual([
      'Apartment 4, Harbour View, Dún Laoghaire, A96 K2N4',
    ]);
    expect(await labels('OCONNELL avenue limerick')).toHaveLength(1);
    expect(await labels('Zzyzx Boulevard')).toEqual([]);
    // Too little to go on isn't looked up.
    expect(await labels('ra')).toEqual([]);
  });

  it('UX-LT-9: an address without an Eircode is found, and accepted without one', async () => {
    const [cottage] = await sampleAddressSearch.suggest('rose cottage');
    const address = await sampleAddressSearch.lookUp(cottage!.id);
    expect(address).toEqual({
      addressLine1: 'Rose Cottage, Chapel Lane',
      area: 'Kinvara',
      county: 'Galway',
    });
    expect(await sampleAddressSearch.lookUp('not-an-address')).toBeNull();
  });

  it('Q40: with no lookup connected, nothing is looked up at all', async () => {
    expect(noAddressSearch.name).toBe('off');
    expect(await noAddressSearch.suggest('12 Ranelagh Road')).toEqual([]);
    expect(await noAddressSearch.lookUp('sample-1')).toBeNull();
  });
});
