import type { Metadata } from 'next';
import { settingsCopy } from '@/copy/settings';
import { ChoiceGroup } from '@/ui/Field';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { assistantAction } from '../actions';
import { loadSettings } from '../load';
import styles from '../settings.module.css';

export const metadata: Metadata = { title: 'The assistant' };
export const dynamic = 'force-dynamic';

const copy = settingsCopy.assistant;

/**
 * UX-ST-2, UX-AI-14 (R29): the assistant's one setting, "Check Gaff's answers before they go".
 * On for every new account. Off, grounded answers go straight out. Fixed messages always go.
 */
export default async function AssistantSettingsPage({
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
        <form action={assistantAction}>
          <Stack gap={6}>
            {saved ? (
              <Notice tone="success" role="status">
                <p>{settingsCopy.saved}</p>
              </Notice>
            ) : null}
            <ChoiceGroup
              name="on"
              legend={copy.switch}
              defaultValue={organisation.approveBeforeSend ? 'yes' : 'no'}
              error={problem ? settingsCopy.adminOnly : undefined}
              options={[
                { value: 'yes', label: copy.on, hint: copy.onHelp },
                { value: 'no', label: copy.off, hint: copy.offHelp },
              ]}
            />
            <p className={styles.description}>{copy.fixed}</p>
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
