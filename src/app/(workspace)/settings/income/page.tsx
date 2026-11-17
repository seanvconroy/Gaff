import type { Metadata } from 'next';
import { settingsCopy } from '@/copy/settings';
import { formatRatio, incomeRuleChoices } from '@/domain/applications/apply';
import { ChoiceGroup } from '@/ui/Field';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { incomeRuleAction } from '../actions';
import { loadSettings } from '../load';

export const metadata: Metadata = { title: 'Income rule' };
export const dynamic = 'force-dynamic';

const copy = settingsCopy.income;

/** UX-ST-1, R16, R17: the income rule, 2, 2.5 or 3 times the rent, the same for everyone. */
export default async function IncomeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { saved, problem } = await searchParams;
  const { organisation } = await loadSettings();
  return (
    <Stack gap={8}>
      <PageHeader
        back={{ href: '/settings', label: settingsCopy.back }}
        title={copy.title}
        lead={copy.lead}
      />
      <Narrow>
        <form action={incomeRuleAction}>
          <Stack gap={6}>
            {saved ? (
              <Notice tone="success" role="status">
                <p>{settingsCopy.saved}</p>
              </Notice>
            ) : null}
            <ChoiceGroup
              name="ruleTenths"
              legend={copy.legend}
              defaultValue={String(organisation.incomeRuleTenths)}
              error={problem ? settingsCopy.adminOnly : undefined}
              options={incomeRuleChoices.map((tenths) => ({
                value: String(tenths),
                label: copy.choice(formatRatio(tenths)),
              }))}
            />
            <div>
              <SubmitButton fullWidth="phone" pendingLabel="Saving…">
                {copy.button}
              </SubmitButton>
            </div>
          </Stack>
        </form>
      </Narrow>
    </Stack>
  );
}
