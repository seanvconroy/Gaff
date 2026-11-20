import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { settingsCopy } from '@/copy/settings';
import { isBeingConfirmed } from '@/domain/organisations/go-live-gate';
import { TextField } from '@/ui/Field';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { phoneAction } from '../actions';
import { loadSettingsPage } from '../load';

export const metadata: Metadata = { title: 'The agency' };
export const dynamic = 'force-dynamic';

const copy = settingsCopy.agency;

/**
 * UX-ST-1: the agency as renters see it: its name, the number they can ring (Q43), its licence
 * and whether Gaff has confirmed it (UX-AG-4). The number is the one thing changed here.
 */
export default async function AgencySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { saved, problem } = await searchParams;
  const { organisation } = await loadSettingsPage();
  if (organisation.kind !== 'agency') redirect('/settings');
  return (
    <Stack gap={8}>
      <PageHeader
        back={{ href: '/settings', label: settingsCopy.back }}
        title={copy.title}
        lead={copy.lead}
      />
      <Narrow>
        <Stack gap={6}>
          {saved ? (
            <Notice tone="success" role="status">
              <p>{settingsCopy.saved}</p>
            </Notice>
          ) : null}
          <SummaryList
            rows={[
              { label: copy.name, value: organisation.name },
              { label: copy.licence, value: organisation.psraLicenceNumber ?? copy.notGiven },
              {
                label: copy.status,
                value: isBeingConfirmed(organisation) ? copy.beingConfirmed : copy.confirmed,
              },
            ]}
          />
          <form action={phoneAction}>
            <Stack gap={6}>
              <TextField
                name="phone"
                label={copy.phone}
                hint={copy.phoneHint}
                type="tel"
                inputMode="tel"
                width="medium"
                optional
                autoComplete="off"
                defaultValue={organisation.phone ?? ''}
                error={
                  problem === 'phone'
                    ? 'Enter a phone number, like 01 234 5678, or leave it blank'
                    : problem
                      ? settingsCopy.adminOnly
                      : undefined
                }
              />
              <div>
                <SubmitButton fullWidth="phone" pendingLabel="Saving…">
                  {copy.button}
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </Stack>
      </Narrow>
    </Stack>
  );
}
