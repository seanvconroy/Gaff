import { describe, expect, it } from 'vitest';
import { settingsRowHref, settingsRows } from './settings';

describe('UX-ST-1: Settings is a list of rows, each its own page', () => {
  it('UX-ST-1: an agency admin sees the agency’s rows; where tenants pay once it’s set', () => {
    expect(settingsRows({ kind: 'agency', role: 'admin', paymentAccountSet: false })).toEqual([
      'enquiries',
      'assistant',
      'income',
      'agency',
    ]);
    expect(settingsRows({ kind: 'agency', role: 'admin', paymentAccountSet: true })).toEqual([
      'enquiries',
      'assistant',
      'income',
      'payment',
      'agency',
    ]);
  });

  it('UX-ST-1: a private landlord has no agency row', () => {
    expect(
      settingsRows({ kind: 'private_landlord', role: 'admin', paymentAccountSet: true }),
    ).toEqual(['enquiries', 'assistant', 'income', 'payment']);
  });

  it('UX-ST-1: an agent who isn’t an admin changes none of them', () => {
    expect(settingsRows({ kind: 'agency', role: 'negotiator', paymentAccountSet: true })).toEqual(
      [],
    );
  });

  it('UX-ST-3, UX-AI-14: no usual times, and one row for the assistant', () => {
    const all = settingsRows({ kind: 'agency', role: 'admin', paymentAccountSet: true });
    expect(all.filter((row) => row === 'assistant')).toHaveLength(1);
    expect(Object.keys(settingsRowHref)).not.toContain('usual');
    for (const row of all) expect(settingsRowHref[row]).toBe(`/settings/${row}`);
  });
});
