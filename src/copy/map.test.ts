import { describe, expect, it } from 'vitest';
import type { MapPin } from '@/domain/map/points';
import { groupByPoint } from '@/domain/map/points';
import {
  MAP_UNAVAILABLE,
  clusterName,
  drawingNote,
  pinLabel,
  pinName,
  pinOutsideWords,
  pinPrice,
  pinStartWords,
  pinWhere,
  pinWords,
  shapeProblem,
} from './map';

const home = (id: string, rentCents: number, title: string): MapPin => ({
  id,
  lat: 53.3157,
  lng: -6.2672,
  rentCents,
  title,
  slug: id,
});

describe('M117: what pins say', () => {
  it('shows the rent, and names the home', () => {
    const [group] = groupByPoint([home('a', 225_000, '2 bed apartment in Ranelagh, Dublin 6')]);
    expect(pinPrice(225_000)).toBe('€2,250');
    expect(pinLabel(group!)).toBe('€2,250');
    expect(pinName(group!)).toBe('€2,250 a month, 2 bed apartment in Ranelagh, Dublin 6');
  });

  it('says how many homes share a point, and from what rent', () => {
    const [group] = groupByPoint([
      home('a', 225_000, '2 bed apartment in Rathgar, Dublin 6'),
      home('b', 185_000, '1 bed apartment in Rathgar, Dublin 6'),
      home('c', 260_000, '3 bed apartment in Rathgar, Dublin 6'),
    ]);
    expect(pinLabel(group!)).toBe('3 homes');
    expect(pinName(group!)).toBe('3 homes here, from €1,850 a month');
    expect(clusterName(12)).toBe('12 homes here: zoom in');
  });
});

describe('M120, M128: the map’s words are plain, and say what to do next', () => {
  it('has one calm sentence for a map that can’t load', () => {
    expect(MAP_UNAVAILABLE).toBe(
      'The map isn’t available right now. Every home is still in the list.',
    );
  });

  it('says how to draw, by dragging or by tapping corners, and how far along it is', () => {
    expect(drawingNote(0)).toContain('or tap its corners and choose Done');
    expect(drawingNote(1)).toBe('1 corner so far. Tap the next corner.');
    expect(drawingNote(3)).toBe('3 corners so far. Tap the next corner, or choose Done.');
    expect(shapeProblem('too_big')).toBe('That area is too big. Draw round a smaller one.');
    expect(shapeProblem('outside')).toBe('Draw round an area in Ireland.');
  });

  it('never shouts or blames', () => {
    const words = [
      MAP_UNAVAILABLE,
      ...Object.values(pinWords),
      drawingNote(0),
      drawingNote(2),
      shapeProblem('too_small'),
      pinOutsideWords('Rathgar', 'Ranelagh'),
      pinOutsideWords('Rathgar', null),
    ];
    for (const sentence of words) {
      expect(sentence, sentence).not.toMatch(/!/);
      expect(sentence, sentence).not.toMatch(/\b(invalid|error|failed|wrong|must)\b/i);
    }
  });
});

describe('M38, M126: the pin’s words', () => {
  it('says where the pin is, as a letter would', () => {
    expect(pinWhere({ street: 'Highfield Road', place: 'Rathgar' })).toBe(
      'The pin is on Highfield Road, in Rathgar.',
    );
    expect(pinWhere({ street: null, place: 'Rathgar' })).toBe('The pin is in Rathgar.');
    // A village's main street often carries its name.
    expect(pinWhere({ street: 'Ranelagh', place: 'Ranelagh' })).toBe('The pin is on Ranelagh.');
    expect(pinWhere({ street: null, place: null })).toBe(
      'The pin isn’t on a street or in an area Gaff knows.',
    );
  });

  it('says where the pin starts', () => {
    expect(pinStartWords('street', 'Highfield Road')).toBe(
      'The pin starts on Highfield Road, from the address. Move it to the home.',
    );
    expect(pinStartWords('area', null)).toBe(
      'The pin starts in the middle of the area. Move it to the home.',
    );
    expect(pinStartWords('pin', null)).toBe('');
  });

  it('asks about a pin outside the address’s area, and never refuses it', () => {
    expect(pinOutsideWords('Rathgar', 'Ranelagh')).toBe(
      'This pin is in Ranelagh, but the address says Rathgar. Is that right? If it is, there’s nothing more to do. If not, move the pin and save it again.',
    );
    expect(pinOutsideWords('Rathgar', null)).toMatch(
      /^This pin isn’t in Rathgar, where the address says the home is\. Is that right\?/,
    );
  });
});
