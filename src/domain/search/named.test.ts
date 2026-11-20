import { describe, expect, it } from 'vitest';
import type { Place } from '@/domain/places/gazetteer';
import { namedBy, placeFragments, placeNamed, typingPlace } from './named';

const street = (name: string, context: string, county: Place['county'] = 'Dublin'): Place => ({
  slug: `${name}-${context}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  kind: 'street',
  county,
  centre: { lat: 53.31, lng: -6.27 },
  radiusMetres: 300,
  context,
});

const highfield = street('Highfield Road', 'Rathgar, Dublin 6');
const highfieldCavan = street('Highfield Road', 'County Cavan', 'Cavan');
const shopGalway = street('Shop Street', 'Claddagh, Galway', 'Galway');
const shopTuam = street('Shop Street', 'Tuam, County Galway', 'Galway');
const glebe: Place = { ...street('Glebe', 'Townland in County Meath', 'Meath'), kind: 'townland' };

const texts = (typed: string) => placeFragments(typed).map((fragment) => fragment.text);

describe('UX-SR-14: the road or landmark a renter’s words name', () => {
  it('UX-SR-14: only the parts that could be a place’s name are looked up', () => {
    expect(texts('Highfield Road')).toEqual(['highfield road']);
    expect(texts('2 bed near Highfield Rd under 2000')).toEqual(['highfield rd']);
    expect(texts('house on Main Street in Bray')).toEqual(['main street', 'bray']);
    expect(texts('apartment near St Stephen’s Green, Dublin 2')).toEqual([
      'st stephens green dublin',
    ]);
    expect(texts('2 bed apartment under €2,000 no pets')).toEqual([]);
  });

  it('UX-SR-11, rule 3: what a renter says about themselves is never a place to look up', () => {
    expect(texts('me and my partner, we have a dog, 2 bed')).toEqual([]);
    expect(texts('I’m looking for a 2 bed for me and my wife')).toEqual([]);
  });

  it('UX-SR-14: a part that follows "near", "in" or "on" is tried first', () => {
    const fragments = placeFragments('quiet cul de sac near Highfield Road');
    expect(fragments[0]).toMatchObject({ text: 'highfield road', cued: true, last: true });
  });

  it('UX-SR-14: the part still being typed is what suggestions are asked for', () => {
    expect(typingPlace('2 bed near highf')).toBe('highf');
    expect(typingPlace('highfield road rathg')).toBe('highfield road rathg');
    expect(typingPlace('2 bed')).toBeNull();
    expect(typingPlace('ranelagh under 2000')).toBeNull();
  });

  it('UX-SR-14: a place is named by its whole name, with only where it is left over', () => {
    expect(namedBy('highfield road', highfield)).toBe(2);
    expect(namedBy('highfield rd', highfield)).toBe(2);
    expect(namedBy('highfield road rathgar', highfield)).toBe(2.5);
    expect(namedBy('highfield road dublin 6', highfield)).toBe(2.5);
    expect(namedBy('highfield road cavan', highfieldCavan)).toBe(2);
    // Half a name, or a name with something else beside it, names nothing.
    expect(namedBy('highfield', highfield)).toBe(0);
    expect(namedBy('lovely highfield road', highfield)).toBe(0);
    expect(namedBy('highfield road cork', highfield)).toBe(0);
  });

  it('Q60: "O Connell Street", "O\'Connell Street" and "OConnell Street" name the one road', () => {
    const oconnell = street("O'Connell Street", 'Caherdavin, Limerick', 'Limerick');
    for (const typed of ['o connell street', 'oconnell street', 'o connell st']) {
      expect(namedBy(typed, oconnell), typed).toBe(2);
    }
    expect(namedBy('o connell street limerick', oconnell)).toBe(2.5);
    expect(namedBy('o connor street limerick', oconnell)).toBe(0);
    // A name the index holds written apart is named by either form too.
    const apart = street('Mc Curtain Street', 'Clones, County Monaghan', 'Monaghan');
    expect(namedBy('mccurtain street clones', apart)).toBe(2.5);
    expect(namedBy('mc curtain street', apart)).toBe(2);
    // And where it is: "Mc Kee Park" as a neighbourhood, typed joined.
    const inMcKee = street('Blackhorse Avenue', 'Mc Kee Park, Dublin 7');
    expect(namedBy('blackhorse avenue mckee park', inMcKee)).toBe(2.5);
  });

  it('UX-SR-14: of roads with one name, the one in the town that was said', () => {
    const fragment = { text: 'shop street galway', cued: false, last: true };
    expect(placeNamed(fragment, [shopTuam, shopGalway], true)).toBe(shopGalway);
    expect(
      placeNamed(
        { text: 'highfield road', cued: false, last: true },
        [highfield, highfieldCavan],
        true,
      ),
    ).toBe(highfield);
  });

  it('UX-SR-14: one bare word names a road or townland only after a cue, or alone', () => {
    const bare = { text: 'glebe', cued: false, last: false };
    expect(placeNamed(bare, [glebe], false)).toBeNull();
    expect(placeNamed({ ...bare, cued: true }, [glebe], false)).toBe(glebe);
    expect(placeNamed(bare, [glebe], true)).toBe(glebe);
  });
});
