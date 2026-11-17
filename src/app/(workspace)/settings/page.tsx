import { Bot, Building2, Inbox, Landmark, Scale } from 'lucide-react';
import type { Metadata } from 'next';
import { forwardingCopy } from '@/copy/forwarding';
import { settingsCopy as copy } from '@/copy/settings';
import { formatRatio } from '@/domain/applications/apply';
import { forwardingInPlace } from '@/domain/enquiries/forwarding';
import {
  settingsRowHref,
  settingsRows,
  type SettingsRowKey,
} from '@/domain/organisations/settings';
import { formatIban } from '@/domain/tenancy/payment';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { PageHeader, Stack } from '@/ui/Layout';
import { loadSettings } from './load';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

const icons = {
  enquiries: Inbox,
  assistant: Bot,
  income: Scale,
  payment: Landmark,
  agency: Building2,
} as const;

/**
 * UX-ST-1 to UX-ST-3: Settings, from the account menu, as a list of rows. Each opens a page with
 * one subject and one save button. "Your usual times" isn't here: it's asked at the first close
 * (UX-TN-7). Team (WP-19) adds its own row to this list.
 */
export default async function SettingsPage() {
  const { member, organisation } = await loadSettings();
  const rows = settingsRows({
    kind: organisation.kind,
    role: member.role,
    paymentAccountSet: Boolean(organisation.paymentIban),
  });
  const meta: Record<SettingsRowKey, string> = {
    enquiries: forwardingInPlace({ worksAt: organisation.forwardingWorksAt })
      ? forwardingCopy.settings.inPlace
      : forwardingCopy.settings.toDo,
    assistant: organisation.approveBeforeSend ? copy.assistant.rowOn : copy.assistant.rowOff,
    income: copy.income.choice(formatRatio(organisation.incomeRuleTenths)),
    payment: organisation.paymentIban
      ? `${organisation.paymentAccountName ?? ''}, ${formatIban(organisation.paymentIban)}`
      : '',
    agency: organisation.name,
  };
  return (
    <Stack gap={8}>
      <PageHeader title={copy.title} lead={copy.lead} />
      {rows.length === 0 ? (
        <p>{copy.noRows}</p>
      ) : (
        <ActionList bare>
          {rows.map((row) => (
            <ActionRow
              key={row}
              id={`settings-${row}`}
              href={settingsRowHref[row]}
              icon={icons[row]}
              title={copy.rows[row]}
              meta={meta[row]}
            />
          ))}
        </ActionList>
      )}
    </Stack>
  );
}
