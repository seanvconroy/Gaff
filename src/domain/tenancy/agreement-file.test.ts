import { describe, expect, it } from 'vitest';
import { agreementFile, agreementFileName } from './agreement-file';

describe('UX-RN-21: a copy of the agreement to download', () => {
  const file = agreementFile({
    title: 'Tenancy agreement: 12 Ranelagh Road',
    sections: [
      { heading: '1. The home', paragraphs: ['12 Ranelagh Road, Ranelagh, Dublin 6.'] },
      { heading: '2. The rent', paragraphs: ['€1,850 a month, paid in advance.'] },
    ],
    signatures: ['Tenant: signed electronically by Aoife Byrne on Monday 16 November, 10am'],
  });

  it('holds every section and the signatures, in order', () => {
    expect(file.indexOf('1. The home')).toBeGreaterThan(-1);
    expect(file.indexOf('2. The rent')).toBeGreaterThan(file.indexOf('1. The home'));
    expect(file.indexOf('signed electronically by Aoife Byrne')).toBeGreaterThan(
      file.indexOf('2. The rent'),
    );
  });

  it('is one file that needs nothing from anywhere: no scripts, links or images', () => {
    expect(file).not.toMatch(/<script|<link|<img|https?:\/\//i);
  });

  it('writes whatever a name or an address holds as text, never as markup', () => {
    const odd = agreementFile({
      title: 'Agreement <b>',
      sections: [{ heading: 'A & B', paragraphs: ['"Flat 2" <script>alert(1)</script>'] }],
      signatures: [],
    });
    expect(odd).toContain('A &amp; B');
    expect(odd).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(odd).not.toContain('<script>');
    expect(odd).not.toContain('class="signatures"');
  });

  it('is named by the home’s address, in a way any phone can save', () => {
    expect(agreementFileName('12 Ranelagh Road')).toBe('Tenancy agreement - 12 Ranelagh Road.html');
    expect(agreementFileName('Apt 4/2, "The Mews"')).toBe(
      'Tenancy agreement - Apt 42, The Mews.html',
    );
    expect(agreementFileName('///')).toBe('Tenancy agreement - your home.html');
  });
});
