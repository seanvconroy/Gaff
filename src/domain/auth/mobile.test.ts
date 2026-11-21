import { describe, expect, it } from 'vitest';
import {
  diallingCodes,
  looksLikeMobile,
  maskedMobile,
  mobileEnding,
  mobileProofStands,
  mobileSignInMode,
  mobileStillVouches,
  needsDiallingCode,
  MOBILE_VOUCHES_DAYS,
  PROVEN_MOBILE_MINUTES,
  readMobile,
  showMobile,
} from './mobile';

const DAY = 24 * 60 * 60 * 1000;

describe('UX-SI-13: reading a mobile number', () => {
  it('reads an Irish mobile however it is typed', () => {
    for (const typed of [
      '087 123 4567',
      '0871234567',
      '(087) 123-4567',
      '+353 87 123 4567',
      '00353871234567',
      '+353 (0)87 123 4567',
    ]) {
      expect(readMobile(typed)).toEqual({ ok: true, mobile: '+353871234567' });
    }
  });

  it('takes a number without a plus as the picked country’s, dropping its leading 0', () => {
    expect(readMobile('07700 900123', 'GB')).toEqual({ ok: true, mobile: '+447700900123' });
    expect(readMobile('06 12 34 56 78', 'FR')).toEqual({ ok: true, mobile: '+33612345678' });
    expect(readMobile('(415) 555-0132', 'US')).toEqual({ ok: true, mobile: '+14155550132' });
  });

  it('takes a number with a plus as written, whatever is picked', () => {
    expect(readMobile('+44 7700 900123', 'IE')).toEqual({ ok: true, mobile: '+447700900123' });
    // The longest code that fits: +353 is Ireland, +358 Finland, +35 nobody.
    expect(readMobile('+358 40 123 4567', 'IE')).toEqual({ ok: true, mobile: '+358401234567' });
  });

  it('refuses what isn’t a mobile number', () => {
    for (const typed of [
      '',
      '12345',
      'ann@example.ie',
      '087 123',
      '01 234 5678',
      '+353 1 234 5678',
    ]) {
      expect(readMobile(typed)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(readMobile('0871234567', 'XX')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('says so when the country isn’t one Gaff texts', () => {
    expect(readMobile('+7 912 345 67 89')).toEqual({ ok: false, reason: 'not_texted' });
    expect(readMobile('+960 771 2345')).toEqual({ ok: false, reason: 'not_texted' });
  });

  it('lists Ireland first, each country once', () => {
    expect(diallingCodes[0]).toEqual({ iso: 'IE', name: 'Ireland', code: '353' });
    expect(new Set(diallingCodes.map((entry) => entry.iso)).size).toBe(diallingCodes.length);
    for (const entry of diallingCodes) expect(entry.code).toMatch(/^[1-9]\d{0,2}$/);
  });

  it('tells a number being typed from an email', () => {
    expect(looksLikeMobile('087')).toBe(true);
    expect(looksLikeMobile(' +44 7')).toBe(true);
    expect(looksLikeMobile('(087')).toBe(true);
    expect(looksLikeMobile('ann@example.ie')).toBe(false);
    expect(looksLikeMobile('2ann@example.ie')).toBe(false);
    expect(looksLikeMobile('ann')).toBe(false);
    expect(looksLikeMobile('')).toBe(false);
  });

  it('UX-SI-16: asks for a country code only for a number typed without one', () => {
    expect(needsDiallingCode('087')).toBe(true);
    expect(needsDiallingCode(' 087 123 4567')).toBe(true);
    expect(needsDiallingCode('+353 87')).toBe(false);
    expect(needsDiallingCode('00353 87')).toBe(false);
    expect(needsDiallingCode('ann@example.ie')).toBe(false);
    expect(needsDiallingCode('')).toBe(false);
  });
});

describe('UX-SI-13: showing a mobile number', () => {
  it('shows a number as its owner would know it', () => {
    expect(showMobile('+353871234567')).toBe('087 123 4567');
    expect(showMobile('+447700900123')).toBe('+44 7700900123');
    expect(showMobile('+14155550132')).toBe('+1 4155550132');
  });

  it('masks all but the start and the last four digits', () => {
    expect(maskedMobile('+353871234567')).toBe('087 ••• 4567');
    expect(maskedMobile('+447700900123')).toBe('+44 ••• 0123');
    expect(mobileEnding('+353871234567')).toBe('4567');
  });
});

describe('UX-SI-14: how long a number vouches for its owner', () => {
  const proven = new Date('2026-11-20T10:00:00Z');

  it('vouches for 180 days from when it last signed its owner in', () => {
    expect(MOBILE_VOUCHES_DAYS).toBe(180);
    expect(mobileStillVouches(proven, proven)).toBe(true);
    expect(mobileStillVouches(proven, new Date(proven.getTime() + 179 * DAY))).toBe(true);
    expect(mobileStillVouches(proven, new Date(proven.getTime() + 180 * DAY))).toBe(false);
  });

  it('gives a browser 15 minutes to add the email to a number it has just proved', () => {
    expect(PROVEN_MOBILE_MINUTES).toBe(15);
    expect(mobileProofStands(proven, new Date(proven.getTime() + 14 * 60_000))).toBe(true);
    expect(mobileProofStands(proven, new Date(proven.getTime() + 15 * 60_000))).toBe(false);
    expect(mobileProofStands(proven, new Date(proven.getTime() - 1))).toBe(false);
  });
});

describe('UX-SI-13: where sign-in by mobile is offered', () => {
  it('is real wherever texts are really sent', () => {
    for (const gaffEnv of ['development', 'test', 'staging', 'production'] as const) {
      expect(mobileSignInMode({ smsProvider: 'sinch', devTools: false, gaffEnv })).toBe('real');
    }
  });

  it('is a stand-in locally and in tests, with the development tools on', () => {
    expect(mobileSignInMode({ smsProvider: 'fake', devTools: true, gaffEnv: 'development' })).toBe(
      'stand_in',
    );
    expect(mobileSignInMode({ smsProvider: 'fake', devTools: true, gaffEnv: 'test' })).toBe(
      'stand_in',
    );
    expect(mobileSignInMode({ smsProvider: 'fake', devTools: false, gaffEnv: 'development' })).toBe(
      'off',
    );
  });

  it('is never a stand-in on the test copy or in production', () => {
    for (const gaffEnv of ['staging', 'production'] as const) {
      expect(mobileSignInMode({ smsProvider: 'fake', devTools: true, gaffEnv })).toBe('off');
    }
  });
});
