import { describe, expect, it } from 'vitest';
import { counties } from '@/domain/lettings/new-letting';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { slugify } from '@/domain/places/slug';
import {
  canonicalPlaceSlug,
  defaultNearMetres,
  guessPlace,
  type HomeAddress,
  placeHasHome,
  placeInSentence,
  placeLabel,
  searchPlace,
  type SearchPlace,
  streetName,
} from './places';

const g = fixtureGazetteer();
const where = (slug: string): SearchPlace => {
  const found = searchPlace(slug, g);
  if (!found) throw new Error(`No place ${slug}`);
  return found;
};

const home = (over: Partial<HomeAddress> = {}): HomeAddress => ({
  addressLine1: '12 Ranelagh Road',
  addressLine2: null,
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  eircode: null,
  ...over,
});

describe('UX-SR-5, M56: "Where" is a place in Gaff’s own place index', () => {
  it('UX-SR-5: knows every county and Dublin district, and towns and areas, by slug', () => {
    for (const county of counties) expect(where(slugify(county)).kind).toBe('area');
    expect(where('dublin-6w')).toMatchObject({ kind: 'area', place: { routingKey: 'D6W' } });
    expect(where('ranelagh').kind).toBe('area');
    expect(where('kinsale').kind).toBe('area');
    expect(searchPlace('narnia', g)).toBeNull();
  });

  it('M56: a routing key is a place too, and a Dublin one is its district', () => {
    expect(where('p17')).toEqual({
      kind: 'routing_key',
      slug: 'p17',
      routingKey: 'P17',
      town: null,
    });
    expect(where('d06')).toMatchObject({ kind: 'area', slug: 'dublin-6' });
  });

  it('M113: a street or landmark is searched near, 1 km in a city and 3 km elsewhere', () => {
    expect(where('highfield-road-rathgar-dublin-6')).toMatchObject({
      kind: 'near',
      withinMetres: 1000,
    });
    expect(where('highfield-road-ballintemple-cork')).toMatchObject({ withinMetres: 1000 });
    expect(defaultNearMetres(g.bySlug('kinsalebeg')!, g)).toBe(3000);
  });

  it('M56: the first list’s old IDs open the same place', () => {
    expect(canonicalPlaceSlug('Dingle')).toBe('dingle-daingean-ui-chuis');
    expect(canonicalPlaceSlug('bagenalstown')).toBe('muine-bheag');
    expect(canonicalPlaceSlug('ranelagh')).toBe('ranelagh');
    expect(where('dingle').slug).toBe('dingle-daingean-ui-chuis');
  });

  it('UX-SR-5: names places as people say them', () => {
    expect(placeLabel(where('ranelagh'))).toBe('Ranelagh, Dublin 6');
    expect(placeLabel(where('blackrock'))).toBe('Blackrock, Co. Dublin');
    expect(placeLabel(where('bray'))).toBe('Bray, Co. Wicklow');
    expect(placeLabel(where('kinsale'))).toBe('Kinsale, Co. Cork');
    expect(placeLabel(where('cork'))).toBe('Co. Cork');
    expect(placeLabel(where('dublin'))).toBe('Dublin');
    expect(placeLabel(where('dublin-6w'))).toBe('Dublin 6W');
    expect(placeLabel(where('cork-city'))).toBe('Cork city');
    expect(placeLabel(where('highfield-cork'))).toBe('Highfield, Cork city');
    expect(placeLabel(where('highfield-road-rathgar-dublin-6'))).toBe(
      'Near Highfield Road, Rathgar',
    );
    expect(placeLabel(where('trinity-college-dublin-dublin-2'))).toBe(
      'Near Trinity College Dublin, Dublin 2',
    );
    expect(placeLabel(where('p17'))).toBe('P17, Kinsale');
    expect(placeLabel(where('h53'))).toBe('Eircode area H53');
  });
});

describe('UX-SR-3: the place a sentence names', () => {
  it('UX-SR-3: finds the most specific place said', () => {
    expect(placeInSentence('2-bed in Ranelagh, Dublin 6', g)?.slug).toBe('ranelagh');
    expect(placeInSentence('something in dublin 6w please', g)?.slug).toBe('dublin-6w');
    expect(placeInSentence('D8 or thereabouts', g)?.slug).toBe('dublin-8');
    expect(placeInSentence('a house in Bray', g)?.slug).toBe('bray');
    expect(placeInSentence('anywhere in Cork', g)?.slug).toBe('cork');
    expect(placeInSentence('Dun Laoghaire', g)?.slug).toBe('dun-laoghaire');
    expect(placeInSentence('harolds cross', g)?.slug).toBe('harolds-cross');
    expect(placeInSentence('a flat in Cionn tSáile', g)?.slug).toBe('kinsale');
    expect(placeInSentence('1 bed in Dingle', g)?.slug).toBe('dingle-daingean-ui-chuis');
  });

  it('UX-SR-3: a name that is also a word or a first name needs "in" before it', () => {
    expect(placeInSentence('no rush, from January', g)).toBeNull();
    expect(placeInSentence('a flat in Rush', g)?.slug).toBe('rush');
    expect(placeInSentence('Clare here, looking for a 2-bed', g)).toBeNull();
    expect(placeInSentence('a house in county Clare', g)?.slug).toBe('clare');
    // Villages and areas beyond the curated base always need one.
    expect(placeInSentence('Kinsealy', g)).toBeNull();
    expect(placeInSentence('near Kinsealy', g)?.slug).toBe('kinsealy');
  });

  it('UX-SR-3: a place Gaff doesn’t know is nothing', () => {
    expect(placeInSentence('a castle in Narnia', g)).toBeNull();
  });

  it('UX-SR-3, M56: words alone are tried as a place, and a near spelling is offered', () => {
    expect(guessPlace('rathm', g).place?.slug).toBe('rathmines');
    const typo = guessPlace('Kinsael', g);
    expect(typo.place).toBeNull();
    expect(typo.didYouMean?.slug).toBe('kinsale');
    expect(guessPlace('somewhere lovely', g)).toEqual({ place: null, didYouMean: null });
  });
});

describe('UX-SR-4: a place is matched against the home’s address', () => {
  it('UX-SR-4: an area is its name in the address, in the same county', () => {
    expect(placeHasHome(where('ranelagh'), home())).toBe(true);
    expect(placeHasHome(where('rathmines'), home())).toBe(false);
    expect(placeHasHome(where('ranelagh'), home({ county: 'Cork' }))).toBe(false);
    expect(placeHasHome(where('dun-laoghaire'), home({ area: 'Dún Laoghaire' }))).toBe(true);
    expect(placeHasHome(where('cork-city'), home({ area: 'Cork', county: 'Cork' }))).toBe(true);
  });

  it('UX-SR-4: a district is written in the address or is its Eircode’s routing key', () => {
    expect(placeHasHome(where('dublin-6'), home())).toBe(true);
    expect(placeHasHome(where('dublin-6w'), home())).toBe(false);
    expect(placeHasHome(where('dublin-6w'), home({ area: 'Terenure', eircode: 'D6W XY12' }))).toBe(
      true,
    );
  });

  it('M56: a routing key is the home’s Eircode’s', () => {
    expect(placeHasHome(where('p17'), home({ county: 'Cork', eircode: 'P17 AB12' }))).toBe(true);
    expect(placeHasHome(where('p17'), home({ county: 'Cork', eircode: null }))).toBe(false);
  });

  it('UX-SR-4: a county is the home’s county', () => {
    expect(placeHasHome(where('dublin'), home())).toBe(true);
    expect(placeHasHome(where('wicklow'), home())).toBe(false);
  });
});

describe('M113: near a street or landmark', () => {
  const highfield = where('highfield-road-rathgar-dublin-6');

  it('M113: with a home’s point (the map package’s seam), measures the distance', () => {
    const near = home({ point: { lat: 53.3164, lng: -6.264 } });
    const far = home({ point: { lat: 53.36, lng: -6.26 } });
    expect(placeHasHome(highfield, near)).toBe(true);
    expect(placeHasHome(highfield, far)).toBe(false);
  });

  it('M113: without one, reads the street’s name in the address, in its county and Eircode area', () => {
    const on = home({ addressLine1: '7 Highfield Rd', area: 'Rathgar, Dublin 6' });
    expect(placeHasHome(highfield, on)).toBe(true);
    expect(placeHasHome(highfield, { ...on, eircode: 'D04 AB12' })).toBe(false);
    expect(placeHasHome(highfield, { ...on, county: 'Cork' })).toBe(false);
    expect(placeHasHome(highfield, home())).toBe(false);
  });

  it('M113: a landmark is its neighbourhood, or its Eircode area', () => {
    const svuh = where('st-vincents-university-hospital-elm-park-dublin-4');
    expect(placeHasHome(svuh, home({ area: 'Elm Park, Dublin 4' }))).toBe(true);
    expect(placeHasHome(svuh, home({ area: 'Donnybrook', eircode: 'D04 X2Y3' }))).toBe(true);
    expect(placeHasHome(svuh, home())).toBe(false);
  });

  it('M56: writes a street’s name one way', () => {
    expect(streetName('Highfield Rd')).toBe('highfield road');
    expect(streetName('St Kevin’s Pk')).toBe('saint kevins park');
    expect(streetName('Main St')).toBe('main street');
  });
});
