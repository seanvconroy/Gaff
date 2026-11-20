import { describe, expect, it } from 'vitest';
import { codeDigits, initialsOf, isCompleteCode } from './code';

describe('code input: the six-digit code', () => {
  it('keeps digits only, so a pasted "123 456" or "123-456" works', () => {
    expect(codeDigits('123456')).toBe('123456');
    expect(codeDigits('123 456')).toBe('123456');
    expect(codeDigits('123-456')).toBe('123456');
    expect(codeDigits(' 12a3\n')).toBe('123');
    expect(codeDigits('')).toBe('');
  });

  it('takes a code out of a pasted sentence, and never more than six digits', () => {
    expect(codeDigits('Your Gaff code is 482913.')).toBe('482913');
    expect(codeDigits('1234567890')).toBe('123456');
    expect(codeDigits('1234567890', 4)).toBe('1234');
  });

  it('reads Arabic-Indic and full-width digits a phone keyboard can send', () => {
    expect(codeDigits('１２３４５６')).toBe('123456');
    expect(codeDigits('٤٨٢٩١٣')).toBe('482913');
  });

  it('is complete, and sent, only when every box is filled', () => {
    expect(isCompleteCode('123456')).toBe(true);
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode('1234', 4)).toBe(true);
    expect(isCompleteCode('12345a')).toBe(false);
  });
});

describe('avatar: initials', () => {
  it('uses the first letters of the first and last words', () => {
    expect(initialsOf('Ann Power')).toBe('AP');
    expect(initialsOf('Halcyon Lettings')).toBe('HL');
    expect(initialsOf('mary o’brien')).toBe('MO');
    expect(initialsOf('Seán Óg Ó hAilpín')).toBe('SH');
  });

  it('uses one letter for one word, and a plain mark when there is no name', () => {
    expect(initialsOf('Halcyon')).toBe('H');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf('')).toBe('?');
  });
});
