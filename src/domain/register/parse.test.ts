import { describe, expect, it } from 'vitest';
import { sampleRegisterCsv } from '@/adapters/register/sample-register';
import { csvRows, parseRegister, refreshIsPlausible, RegisterFormatError } from './parse';

const HEADER = 'Licence Number,Licensee Name,Trading Name,Licence Type,Licence Category,County';
const register = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('UX-AG-1: reading the PSRA register', () => {
  it('keeps a business licensed to let: its names, licence number, type and county', () => {
    const { entries } = parseRegister(
      register('001234,Halcyon Lettings Limited,Halcyon Lettings,Company,"A, B, C, D",Dublin'),
    );
    expect(entries).toEqual([
      {
        licenceNumber: '001234',
        registeredName: 'Halcyon Lettings Limited',
        tradingName: 'Halcyon Lettings',
        licenceType: 'company',
        county: 'Dublin',
      },
    ]);
  });

  it('only businesses licensed to let (category C) are kept', () => {
    const { entries, dropped } = parseRegister(
      register(
        '001234,Halcyon Lettings Limited,,Company,C,Dublin',
        '001240,Slaney Auctioneers Limited,,Company,"A, B",Wexford',
        '001241,Blackwater Block Management Limited,,Company,D,Waterford',
        '001243,Moy Partners,,Partnership,BC,Mayo',
      ),
    );
    expect(entries.map((entry) => entry.licenceNumber)).toEqual(['001234', '001243']);
    expect(dropped.notLetting).toBe(2);
  });

  it('Q39: a person’s own licence is never kept, whatever it is licensed for', () => {
    const { entries, dropped } = parseRegister(
      register(
        '001234,Halcyon Lettings Limited,,Company,C,Dublin',
        '001234-004501,Ciara Whelan,,Employee,"A, B, C, D",Dublin',
        '001234-004502,Declan Farrell,,Principal Officer,C,Dublin',
        '001238-004611,Orla Tierney,,Independent Contractor,C,Limerick',
      ),
    );
    expect(entries).toHaveLength(1);
    expect(dropped.individuals).toBe(3);
    expect(JSON.stringify(entries)).not.toMatch(/Whelan|Farrell|Tierney/);
  });

  it('a sole trader is a business, and a partnership is one', () => {
    const { entries } = parseRegister(
      register(
        '001242,Aisling Carroll,Carroll Lettings,Sole Trader,C,Kilkenny',
        '001237,Ó Súilleabháin & Daughters,Lee Valley Lettings,Partnership,C,Cork',
      ),
    );
    expect(entries.map((entry) => entry.licenceType)).toEqual(['sole_trader', 'partnership']);
  });

  it('finds its columns by name: any order, any case, and other columns are ignored', () => {
    const { entries } = parseRegister(
      [
        'COUNTY,licence expiry,Licence  Type,Trading Name,LICENSEE NAME,Licence No.,Licence Number,Licence Category',
        'Galway,2027-08-31,Company,,Corrib Homes Limited,x,001236,"C, D"',
      ].join('\r\n'),
    );
    expect(entries).toEqual([
      {
        licenceNumber: '001236',
        registeredName: 'Corrib Homes Limited',
        tradingName: null,
        licenceType: 'company',
        county: 'Galway',
      },
    ]);
  });

  it('reads quoted fields, doubled quotes, a byte-order mark and blank lines', () => {
    const text = `﻿${HEADER}\r\n\r\n001243,"Moy, Deel and Partners","The ""Moy"" Lettings",Partnership,"B, C",Mayo\r\n`;
    expect(parseRegister(text).entries[0]).toMatchObject({
      registeredName: 'Moy, Deel and Partners',
      tradingName: 'The "Moy" Lettings',
    });
    expect(csvRows('a,"b\nc",d\n')).toEqual([['a', 'b\nc', 'd']]);
  });

  it('the made-up sample is in the expected format', () => {
    const { entries, dropped } = parseRegister(sampleRegisterCsv);
    expect(entries).toHaveLength(12);
    expect(dropped).toEqual({ individuals: 3, notLetting: 2 });
    expect(entries.find((entry) => entry.licenceNumber === '001234')).toMatchObject({
      registeredName: 'Halcyon Lettings Limited',
      tradingName: 'Halcyon Lettings',
      county: 'Dublin',
    });
  });
});

describe('UX-AG-1: an unexpected file fails loudly, and says where without saying what', () => {
  const failure = (text: string) => {
    try {
      parseRegister(text);
    } catch (error) {
      expect(error).toBeInstanceOf(RegisterFormatError);
      return (error as Error).message;
    }
    throw new Error('expected the register to be refused');
  };

  it('an empty file', () => {
    expect(failure('')).toMatch(/the file is empty/);
  });

  it('a missing column, by name', () => {
    expect(failure('Licence Number,Licensee Name,Trading Name,Licence Type,County\n')).toMatch(
      /there is no "Licence Category" column/,
    );
  });

  it('a column that appears twice', () => {
    expect(failure(`${HEADER},County\n`)).toMatch(/there are two "County" columns/);
  });

  it('a licence type it doesn’t know: it can’t tell a business from a person', () => {
    expect(failure(register('001234,Halcyon Lettings Limited,,Franchise,C,Dublin'))).toMatch(
      /row 2 has a "Licence Type" that isn't known/,
    );
  });

  it('a category letter it doesn’t know', () => {
    expect(failure(register('001234,Halcyon Lettings Limited,,Company,"C, E",Dublin'))).toMatch(
      /row 2 has a "Licence Category" that isn't A, B, C or D/,
    );
  });

  it('a business with no name, no county or a number that isn’t digits', () => {
    expect(failure(register('001234,,,Company,C,Dublin'))).toMatch(/row 2 has no "Licensee Name"/);
    expect(failure(register('001234,Halcyon Lettings Limited,,Company,C,'))).toMatch(
      /row 2 has no "County"/,
    );
    expect(failure(register('L-1234,Halcyon Lettings Limited,,Company,C,Dublin'))).toMatch(
      /row 2 has a business "Licence Number" that isn't digits/,
    );
  });

  it('the same business twice', () => {
    expect(
      failure(
        register(
          '001234,Halcyon Lettings Limited,,Company,C,Dublin',
          '001234,Halcyon Lettings Limited,,Company,C,Dublin',
        ),
      ),
    ).toMatch(/row 3 repeats a business "Licence Number"/);
  });

  it('a file with no business licensed to let', () => {
    expect(failure(register('001240,Slaney Auctioneers Limited,,Company,"A, B",Wexford'))).toMatch(
      /holds no business licensed to let/,
    );
    expect(failure(`${HEADER}\n`)).toMatch(/holds no business licensed to let/);
  });

  it('a quoted field that is never closed', () => {
    expect(failure(`${HEADER}\n001234,"Halcyon`)).toMatch(/quoted field is never closed/);
  });

  it('rule 8: the error never holds what a row said, since a row may name a person', () => {
    const message = failure(register('001234-9,Ciara Whelan,Whelan Homes,Trainee,C,Dublin'));
    expect(message).not.toMatch(/Whelan|Ciara|001234/);
  });
});

describe('UX-AG-6: a download that was cut short isn’t believed', () => {
  it('a register that lost more than half its businesses in a week is refused', () => {
    expect(refreshIsPlausible(4000, 3900)).toBe(true);
    expect(refreshIsPlausible(4000, 2000)).toBe(true);
    expect(refreshIsPlausible(4000, 1999)).toBe(false);
    expect(refreshIsPlausible(4000, 12)).toBe(false);
  });

  it('a first load, or a small copy, is taken as it comes', () => {
    expect(refreshIsPlausible(0, 12)).toBe(true);
    expect(refreshIsPlausible(12, 3)).toBe(true);
  });
});
