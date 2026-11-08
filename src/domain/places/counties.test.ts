import { describe, expect, it } from 'vitest';
import { counties } from '@/domain/lettings/new-letting';
import { COUNTY_POPULATION } from './counties';

describe('M56: county sizes, for ordering equal suggestions', () => {
  it("has every county's Census 2022 population, adding up to the State's", () => {
    expect(Object.keys(COUNTY_POPULATION).sort()).toEqual([...counties].sort());
    const total = Object.values(COUNTY_POPULATION).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(5_149_139);
  });
});
