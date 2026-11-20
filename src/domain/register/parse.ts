/**
 * UX-AG-1, Q39: reads the PSRA's register of licensed property services providers, as published
 * for download, and keeps the businesses licensed to let. Nothing else is kept.
 *
 * THE FORMAT THIS EXPECTS. It was written without sight of the real download (psr.ie couldn't be
 * reached from the build), so a person must check it against the real file before the first
 * real refresh (docs/deploy.md, "The PSRA register"):
 *
 * - A CSV file in UTF-8 (a byte-order mark is fine), with commas between fields, double quotes
 *   round a field that holds a comma or a line break, and `""` for a quote inside one.
 * - The first row names the columns. They are found by name, in any order and any letter case;
 *   spaces and punctuation in a name are ignored. Other columns are ignored and never stored.
 * - These six columns must be there:
 *   - `Licence Number`: digits only for a business, such as 001234.
 *   - `Licensee Name`: the registered name.
 *   - `Trading Name`: may be empty.
 *   - `Licence Type`: one of the values in `licenceTypes` below.
 *   - `Licence Category`: the letters A to D that the licence covers, in any order, with or
 *     without separators ("A, B, C", "ABC", "C"). C is letting.
 *   - `County`.
 *
 * It fails loudly on anything else: a missing column, a licence type or a category letter it
 * doesn't know, a business without a name, a number or a county, or the same business twice. A
 * failed refresh leaves Gaff's copy as it was. An error names the row and the column, and never
 * holds what the row said, because a row may name a person (rule 8).
 *
 * WHO IS KEPT. Businesses only: a company, a partnership, or a sole trader, licensed in category
 * C. An employee's, a principal officer's or an independent contractor's own licence names a
 * person, not a business; such a row is counted and
 * dropped here, so it is never stored (Q38: individual licences aren't checked).
 */

export const businessLicenceTypes = ['company', 'partnership', 'sole_trader'] as const;
export type BusinessLicenceType = (typeof businessLicenceTypes)[number];

/**
 * Every value `Licence Type` may hold, as the register is expected to write it (compared in
 * lower case, ignoring punctuation), and what it is. `null` is an individual's own licence.
 */
export const licenceTypes: Readonly<Record<string, BusinessLicenceType | null>> = {
  company: 'company',
  partnership: 'partnership',
  'sole trader': 'sole_trader',
  'independent contractor': null,
  'principal officer': null,
  employee: null,
};

export const licenceTypeLabels: Record<BusinessLicenceType, string> = {
  company: 'Company',
  partnership: 'Partnership',
  sole_trader: 'Sole trader',
};

/** The category that covers letting. A and B are sales, D is management. */
export const LETTING_CATEGORY = 'C';
const CATEGORIES = new Set(['A', 'B', 'C', 'D']);

export interface RegisterEntry {
  licenceNumber: string;
  registeredName: string;
  tradingName: string | null;
  licenceType: BusinessLicenceType;
  county: string;
}

export interface ParsedRegister {
  /** Businesses licensed to let, one per licence number. */
  entries: RegisterEntry[];
  /** Rows read and dropped, as counts: never stored. */
  dropped: { individuals: number; notLetting: number };
}

/** The file isn't the format above. The refresh stops and Gaff's copy stays as it was. */
export class RegisterFormatError extends Error {
  constructor(message: string) {
    super(`The PSRA register isn't in the expected format: ${message}`);
    this.name = 'RegisterFormatError';
  }
}

const columns = {
  licenceNumber: 'licencenumber',
  registeredName: 'licenseename',
  tradingName: 'tradingname',
  licenceType: 'licencetype',
  category: 'licencecategory',
  county: 'county',
} as const;
type Column = keyof typeof columns;

const columnNames: Record<Column, string> = {
  licenceNumber: 'Licence Number',
  registeredName: 'Licensee Name',
  tradingName: 'Trading Name',
  licenceType: 'Licence Type',
  category: 'Licence Category',
  county: 'County',
};

const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Splits CSV text into rows of fields (RFC 4180): quoted fields, doubled quotes, any newline. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  const source = text.replace(/^﻿/, '');
  const endField = () => {
    row.push(field);
    field = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    // A line with nothing on it isn't a row.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
    } else if (char === '"' && field === '' && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
    } else if (char === ',') endField();
    else if (char === '\n') endRow();
    else if (char === '\r') {
      if (source[i + 1] === '\n') i += 1;
      endRow();
    } else field += char;
  }
  if (quoted) throw new RegisterFormatError('a quoted field is never closed');
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Reads the register's download. Throws `RegisterFormatError` if it isn't the expected format. */
export function parseRegister(text: string): ParsedRegister {
  const [header, ...rows] = csvRows(text);
  if (!header) throw new RegisterFormatError('the file is empty');
  const names = header.map(plain);
  const at = {} as Record<Column, number>;
  for (const column of Object.keys(columns) as Column[]) {
    const index = names.indexOf(columns[column]);
    if (index === -1) {
      throw new RegisterFormatError(`there is no "${columnNames[column]}" column`);
    }
    if (names.indexOf(columns[column], index + 1) !== -1) {
      throw new RegisterFormatError(`there are two "${columnNames[column]}" columns`);
    }
    at[column] = index;
  }

  const entries: RegisterEntry[] = [];
  const seen = new Set<string>();
  const dropped = { individuals: 0, notLetting: 0 };
  rows.forEach((row, index) => {
    // Row 1 is the header, so the first row of data is row 2, as a spreadsheet numbers it.
    const where = `row ${index + 2}`;
    const read = (column: Column) => tidy(row[at[column]] ?? '');
    const need = (column: Column) => {
      const value = read(column);
      if (!value) throw new RegisterFormatError(`${where} has no "${columnNames[column]}"`);
      return value;
    };

    const typeKey = need('licenceType')
      .toLowerCase()
      .replace(/[^a-z]+/g, ' ')
      .trim();
    if (!(typeKey in licenceTypes)) {
      throw new RegisterFormatError(`${where} has a "Licence Type" that isn't known`);
    }
    const licenceType = licenceTypes[typeKey]!;
    // An individual's own licence: counted, and nothing about it is read further or kept.
    if (licenceType === null) {
      dropped.individuals += 1;
      return;
    }

    const letters = need('category')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    if (!letters || [...letters].some((letter) => !CATEGORIES.has(letter))) {
      throw new RegisterFormatError(`${where} has a "Licence Category" that isn't A, B, C or D`);
    }
    if (!letters.includes(LETTING_CATEGORY)) {
      dropped.notLetting += 1;
      return;
    }

    const licenceNumber = need('licenceNumber').replace(/\s+/g, '');
    if (!/^\d{3,7}$/.test(licenceNumber)) {
      throw new RegisterFormatError(`${where} has a business "Licence Number" that isn't digits`);
    }
    if (seen.has(licenceNumber)) {
      throw new RegisterFormatError(`${where} repeats a business "Licence Number"`);
    }
    seen.add(licenceNumber);
    entries.push({
      licenceNumber,
      registeredName: need('registeredName'),
      tradingName: read('tradingName') || null,
      licenceType,
      county: need('county'),
    });
  });
  if (entries.length === 0) {
    throw new RegisterFormatError('it holds no business licensed to let');
  }
  return { entries, dropped };
}

/**
 * A second guard against a download that was cut short: a register that has lost more than half
 * of its businesses in a week isn't believed. Without it, every agency missing from a short file
 * would be told its licence had lapsed (UX-AG-6).
 */
export function refreshIsPlausible(heldNow: number, incoming: number): boolean {
  return heldNow < 20 || incoming * 2 >= heldNow;
}
