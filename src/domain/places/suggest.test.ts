import { describe, expect, it } from 'vitest';
import { fixturePlaces } from './fixture';
import type { County, Place } from './gazetteer';
import { rankSuggestions, suggestFrom } from './suggest';

const slugs = (query: string) =>
  suggestFrom(query, fixturePlaces).groups.flatMap((g) => g.items.map((i) => i.slug));
const groups = (query: string) => suggestFrom(query, fixturePlaces).groups.map((g) => g.kind);

describe('M56: what the Where box suggests', () => {
  it('suggests towns anywhere in Ireland, and Kinsale before Kinsealy and Kinsale Road', () => {
    expect(slugs('Kins')).toEqual([
      'kinsale',
      'kinsealy',
      'kinsalebeg',
      'kinsale-road-ballyphehane-cork',
    ]);
    expect(groups('Kins')).toEqual(['places', 'streets']);
  });

  it('finds streets by name, with the best group first', () => {
    expect(slugs('Highfield road')).toEqual([
      'highfield-road-rathgar-dublin-6',
      'highfield-road-ballintemple-cork',
    ]);
    // "Highf" also matches an area: the area leads (its kind ranks higher), then streets.
    expect(groups('Highf')).toEqual(['places', 'streets', 'landmarks']);
    expect(slugs('Highfield rd rathgar')[0]).toBe('highfield-road-rathgar-dublin-6');
  });

  it('keeps the old behaviour for places with pages', () => {
    expect(slugs('rath').slice(0, 3)).toEqual(['rathfarnham', 'rathgar', 'rathmines']);
    expect(slugs('dublin 6')[0]).toBe('dublin-6');
    expect(slugs('D6W')[0]).toBe('dublin-6w');
    expect(slugs('cork')[0]).toBe('cork');
    expect(slugs('Dun L')[0]).toBe('dun-laoghaire');
    expect(slugs('r')).toEqual([]);
    expect(slugs('County Sligo')[0]).toBe('sligo');
    expect(slugs('Co. Kerry')[0]).toBe('kerry');
    expect(slugs('County Dublin')[0]).toBe('dublin');
  });

  it('forgives fadas, Irish names, aliases and typos', () => {
    expect(slugs('dun laoghaire')[0]).toBe('dun-laoghaire');
    expect(slugs('Cionn tSáile')[0]).toBe('kinsale');
    expect(slugs('UCD')[0]).toBe('university-college-dublin-belfield-dublin-4');
    expect(slugs('Rathmins')[0]).toBe('rathmines');
    const typo = suggestFrom('Kinsael', fixturePlaces);
    expect(typo.didYouMean).toBe(true);
    expect(typo.groups[0]!.items[0]!.slug).toBe('kinsale');
    expect(suggestFrom('Kinsale', fixturePlaces).didYouMean).toBe(false);
  });

  it('suggests an Eircode area for a routing key, with its town when known', () => {
    const p17 = suggestFrom('P17', fixturePlaces).groups[0]!.items[0]!;
    expect(p17).toMatchObject({
      kind: 'routing_key',
      slug: 'p17',
      context: 'Eircode area · Kinsale',
    });
    expect(suggestFrom('D06 F2X3', fixturePlaces).groups).toEqual([]);
    expect(slugs('d06')[0]).toBe('dublin-6');
  });

  it('never lets streets and landmarks crowd out places, and shows at most 8', () => {
    const streets: Place[] = Array.from({ length: 6 }, (_, i) => ({
      slug: `kinsale-lane-${i}`,
      name: `Kinsale Lane ${i}`,
      kind: 'street',
      county: 'Cork',
      context: `Area ${i}, Cork`,
      centre: { lat: 51.9, lng: -8.47 },
      radiusMetres: 200,
    }));
    const ranked = rankSuggestions('kins', [...fixturePlaces, ...streets]);
    const all = ranked.groups.flatMap((g) => g.items);
    expect(all.filter((s) => s.kind === 'street')).toHaveLength(3);
    expect(all.length).toBeLessThanOrEqual(8);
    // With nothing else matching, streets fill the list.
    expect(rankSuggestions('kinsale lane', streets).groups[0]!.items).toHaveLength(6);
  });

  it('ADR-0027: puts the name closest to what was typed first among those it starts', () => {
    const ucd = (slug: string, name: string, county: County): Place => ({
      slug,
      name,
      kind: 'landmark',
      landmarkKind: 'college',
      county,
      centre: { lat: 53.3, lng: -6.22 },
      radiusMetres: 200,
    });
    const found = rankSuggestions('University College Dublin', [
      ucd('ucd-lyons', 'University College Dublin - Lyons Research Farm', 'Kildare'),
      ucd('ucd-belfield', 'University College Dublin (Belfield Campus)', 'Dublin'),
    ]);
    expect(found.groups[0]!.items.map((i) => i.slug)).toEqual(['ucd-belfield', 'ucd-lyons']);
  });

  it('ADR-0027: matches a finished word whole, so "main" never finds "mainistreach"', () => {
    const street = (slug: string, name: string, context: string, irishName?: string): Place => ({
      slug,
      name,
      kind: 'street',
      county: 'Kilkenny',
      context,
      centre: { lat: 52.65, lng: -7.25 },
      radiusMetres: 0,
      ...(irishName ? { irishName } : {}),
    });
    const found = rankSuggestions('Main Street Kilkenny', [
      street('abbey', 'Abbey Street', 'Kilkenny city, County Kilkenny', 'Sráid na Mainistreach'),
      street('main', 'Main Street', 'Piltown, County Kilkenny'),
    ]);
    expect(found.groups.flatMap((g) => g.items.map((i) => i.slug))).toEqual(['main']);
  });

  it('ranks places with more homes higher among equals', () => {
    const a: Place = {
      slug: 'newtown-a',
      name: 'Newtown',
      kind: 'village',
      county: 'Kildare',
      context: 'Village in County Kildare',
      centre: { lat: 53.2, lng: -6.8 },
      radiusMetres: 1000,
      liveHomes: 0,
    };
    const b: Place = {
      ...a,
      slug: 'newtown-b',
      county: 'Meath',
      context: 'Village in County Meath',
      liveHomes: 12,
    };
    expect(rankSuggestions('newtown', [a, b]).groups[0]!.items.map((i) => i.slug)).toEqual([
      'newtown-b',
      'newtown-a',
    ]);
  });
});
