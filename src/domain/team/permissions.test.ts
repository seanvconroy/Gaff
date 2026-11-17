import { describe, expect, it } from 'vitest';
import {
  hasTeam,
  may,
  mayActOnLetting,
  offersHelp,
  permissionsTable,
  roleCan,
  roleLabels,
  teamActions,
} from './permissions';

const admin = { role: 'admin' } as const;
const agent = { role: 'negotiator' } as const;

describe('UX-AG-8 to UX-AG-10: the permissions table, row by row', () => {
  it('UX-AG-8: both roles see every letting the agency runs', () => {
    expect(may('see_lettings', admin)).toBe(true);
    expect(may('see_lettings', agent)).toBe(true);
  });

  it('UX-AG-9: both roles add a letting and run any letting they lead', () => {
    expect(may('add_letting', admin)).toBe(true);
    expect(may('add_letting', agent)).toBe(true);
    expect(may('run_own_letting', admin)).toBe(true);
    expect(may('run_own_letting', agent)).toBe(true);
  });

  it('an admin acts on a letting someone else leads; an agent once they help with it', () => {
    expect(may('act_on_others_letting', admin)).toBe(true);
    expect(may('act_on_others_letting', agent)).toBe(false);
    expect(may('act_on_others_letting', { ...agent, helping: true })).toBe(true);
  });

  it('rule 1: both roles make the three decisions', () => {
    expect(may('make_decisions', admin)).toBe(true);
    expect(may('make_decisions', agent)).toBe(true);
  });

  it('UX-AG-9: an admin changes any letting’s lead; an agent only their own', () => {
    expect(may('change_lead', admin)).toBe(true);
    expect(may('change_lead', agent)).toBe(false);
    expect(may('change_lead', { ...agent, leads: true })).toBe(true);
  });

  it('UX-AG-11: only an admin invites and removes members and changes roles', () => {
    expect(may('manage_team', admin)).toBe(true);
    expect(may('manage_team', agent)).toBe(false);
  });

  it('only an admin changes agency settings; an agent views them', () => {
    expect(may('change_settings', admin)).toBe(true);
    expect(may('change_settings', agent)).toBe(false);
    expect(permissionsTable.change_settings.negotiator).toBe('view_only');
  });

  it('UX-SI-10: an admin changes where tenants pay once they’ve confirmed it’s them; an agent never', () => {
    expect(may('change_payment_account', admin)).toBe(false);
    expect(may('change_payment_account', { ...admin, reconfirmed: true })).toBe(true);
    expect(may('change_payment_account', { ...agent, reconfirmed: true })).toBe(false);
    expect(roleCan('change_payment_account', 'admin')).toBe(true);
    expect(roleCan('change_payment_account', 'negotiator')).toBe(false);
  });

  it('UX-HM-11: only an admin sees "Everyone" on Today and the agency’s results', () => {
    expect(may('see_everyone', admin)).toBe(true);
    expect(may('see_everyone', agent)).toBe(false);
  });

  it('covers every action for both roles', () => {
    for (const action of teamActions) {
      expect(Object.keys(permissionsTable[action]).sort()).toEqual(['admin', 'negotiator']);
    }
    expect(roleLabels).toEqual({ admin: 'Admin', negotiator: 'Agent' });
  });
});

describe('UX-AG-8: acting on a letting', () => {
  it('the lead runs it, whatever their role', () => {
    expect(mayActOnLetting({ ...agent, leads: true, leadUserId: 'a' })).toBe(true);
    expect(mayActOnLetting({ ...admin, leads: true, leadUserId: 'a' })).toBe(true);
  });

  it('an agent helps before acting on a colleague’s letting; an admin needn’t', () => {
    const others = { leadUserId: 'someone-else' };
    expect(mayActOnLetting({ ...agent, ...others })).toBe(false);
    expect(offersHelp({ ...agent, ...others })).toBe(true);
    expect(mayActOnLetting({ ...agent, ...others, helping: true })).toBe(true);
    expect(offersHelp({ ...agent, ...others, helping: true })).toBe(false);
    expect(mayActOnLetting({ ...admin, ...others })).toBe(true);
    expect(offersHelp({ ...admin, ...others })).toBe(false);
  });

  it('a letting with no lead is everybody’s, so it never stalls', () => {
    expect(mayActOnLetting({ ...agent, leadUserId: null })).toBe(true);
  });
});

describe('UX-AG-10: who has team screens', () => {
  it('an agency and a landlord’s team do; a private landlord’s organisation of one doesn’t', () => {
    expect(hasTeam('agency')).toBe(true);
    expect(hasTeam('landlord')).toBe(true);
    expect(hasTeam('private_landlord')).toBe(false);
  });
});
