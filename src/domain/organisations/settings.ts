import { hasTeam } from '@/domain/team/permissions';
import type { OrganisationKind } from './kinds';

/**
 * UX-ST-1 (section 4, "Settings"): Settings is a list of rows. Each opens a page with one
 * subject and one save button. Who sees each row follows the table in section 4.
 *
 * - UX-ST-2: the assistant's one switch is "Check Gaff's answers before they go" (UX-AI-14).
 * - UX-ST-3: "Your usual times" is not here: it's asked at the first close (UX-TN-7).
 * - "Where tenants pay" appears once it's been set: it's first asked at the payment step of the
 *   first tenancy (UX-TN-2).
 * - Team is a row for an agency and a landlord's team (UX-AG-10): admins change it, agents see
 *   it, so it is the one row an agent has. "Agreement" (Gaff's standard or your own) waits
 *   until an operator's own agreement can be used.
 */
export type SettingsRowKey = 'enquiries' | 'assistant' | 'income' | 'payment' | 'agency' | 'team';

export const settingsRowHref: Record<SettingsRowKey, string> = {
  enquiries: '/settings/enquiries',
  assistant: '/settings/assistant',
  income: '/settings/income',
  payment: '/settings/payment',
  agency: '/settings/agency',
  team: '/settings/team',
};

export function settingsRows(input: {
  kind: OrganisationKind;
  role: 'admin' | 'negotiator';
  paymentAccountSet: boolean;
}): SettingsRowKey[] {
  const team: SettingsRowKey[] = hasTeam(input.kind) ? ['team'] : [];
  if (input.role !== 'admin') return team;
  const rows: SettingsRowKey[] = ['enquiries', 'assistant', 'income'];
  if (input.paymentAccountSet) rows.push('payment');
  if (input.kind === 'agency') rows.push('agency');
  return [...rows, ...team];
}
