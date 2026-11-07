import { describe, expect, it } from 'vitest';
import { dublinDistricts, parseRoutingKey, routingKeyName, routingKeyOf } from './eircode';

describe('M56: routing keys', () => {
  it('reads Dublin districts however they are typed', () => {
    expect(parseRoutingKey('Dublin 6')).toBe('D06');
    expect(parseRoutingKey('dublin 6w')).toBe('D6W');
    expect(parseRoutingKey('D6')).toBe('D06');
    expect(parseRoutingKey('d 06')).toBe('D06');
    expect(parseRoutingKey('D24')).toBe('D24');
  });

  it('reads other routing keys', () => {
    expect(parseRoutingKey('a94')).toBe('A94');
    expect(parseRoutingKey('T12')).toBe('T12');
  });

  it("refuses districts that don't exist and things that aren't routing keys", () => {
    expect(parseRoutingKey('Dublin 19')).toBeNull();
    expect(parseRoutingKey('Dublin 7W')).toBeNull();
    expect(parseRoutingKey('Rathmines')).toBeNull();
    expect(parseRoutingKey('B12')).toBeNull();
  });

  it('M38: takes the routing key from a full Eircode', () => {
    expect(routingKeyOf('d06 f2x3')).toBe('D06');
    expect(routingKeyOf('D6W XY12')).toBe('D6W');
    expect(routingKeyOf('not an eircode')).toBeNull();
  });

  it('names Dublin districts in words', () => {
    expect(routingKeyName('D06')).toBe('Dublin 6');
    expect(routingKeyName('A94')).toBe('A94');
    expect(dublinDistricts).toHaveLength(22);
  });
});
