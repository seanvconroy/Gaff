import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { db } from '@/db/client';
import { organisations } from '@/db/schema';
import { env } from '@/lib/env';
import { requireMember } from '@/server/auth/member';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { SubmitButton } from '@/ui/SubmitButton';
import { approveBeforeSendAction, usualTimesAction } from './actions';
import styles from './settings.module.css';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { saved, problem } = await searchParams;
  const member = await requireMember();
  const [organisation] = await db()
    .select()
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  const address = `${organisation!.inboundSlug}@${env().INBOUND_DOMAIN}`;

  return (
    <Stack gap={8}>
      <PageHeader eyebrow={member.organisationName} title="Settings" />
      {saved ? (
        <Notice tone="success" role="status">
          <p>Saved.</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="warning" role="alert">
          <p>
            {problem === 'usual'
              ? 'Enter the hours and days as numbers, like 6.5 and 30, or leave them blank.'
              : 'Only an admin can change that.'}
          </p>
        </Notice>
      ) : null}

      <Card labelledBy="approvals-heading">
        <h2 id="approvals-heading" className="type-title">
          Approve before send
        </h2>
        <p>
          While this is on, every answer the AI writes waits for you in Approvals. Fixed messages,
          like first replies and reminders, always go straight out. Most operators keep it on for
          their first few lettings.
        </p>
        <form action={approveBeforeSendAction}>
          <Stack gap={4}>
            <ChoiceGroup
              name="on"
              legend="AI-written answers"
              defaultValue={organisation!.approveBeforeSend ? 'yes' : 'no'}
              options={[
                { value: 'yes', label: 'Wait for my approval' },
                { value: 'no', label: 'Send straight away' },
              ]}
            />
            <div>
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                Save
              </SubmitButton>
            </div>
          </Stack>
        </form>
      </Card>

      <Card labelledBy="usual-heading">
        <h2 id="usual-heading" className="type-title">
          Your usual times
        </h2>
        <p>
          How long a letting took you before Gaff, from your pilot interview. Your lettings page
          compares your time in Gaff with these.
        </p>
        <form action={usualTimesAction}>
          <Stack gap={4}>
            <div className={styles.narrow}>
              <TextField
                name="hoursPerLetting"
                label="Hours of your time a letting usually takes"
                inputMode="decimal"
                optional
                defaultValue={
                  organisation!.baselineMinutesPerLetting === null
                    ? ''
                    : String(Math.round((organisation!.baselineMinutesPerLetting / 60) * 10) / 10)
                }
              />
            </div>
            <div className={styles.narrow}>
              <TextField
                name="daysToLet"
                label="Days from advert to signed tenancy, usually"
                inputMode="numeric"
                optional
                defaultValue={
                  organisation!.baselineDaysToLet === null
                    ? ''
                    : String(organisation!.baselineDaysToLet)
                }
              />
            </div>
            <div>
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                Save usual times
              </SubmitButton>
            </div>
          </Stack>
        </form>
        <p className={styles.hint}>
          Gaff counts a minute of your time only while you’re using it, and shows totals for each
          letting, never for each person.
        </p>
      </Card>

      <Card labelledBy="address-heading">
        <h2 id="address-heading" className="type-title">
          Your Gaff address
        </h2>
        <p>Send your Daft and MyHome enquiries here, and Gaff answers every one.</p>
        <p className={styles.address}>
          <code>{address}</code>
        </p>
        <h3 className="type-title">Set up forwarding once</h3>
        <ol className={styles.steps}>
          <li>
            <strong>Gmail:</strong> in Settings, open Forwarding and add {address}. Then create a
            filter for emails from <code>daft.ie</code> or <code>myhome.ie</code> and choose
            “Forward it to” your Gaff address.
          </li>
          <li>
            <strong>Outlook:</strong> in Settings, open Rules and add a rule: if the sender contains{' '}
            <code>daft.ie</code> or <code>myhome.ie</code>, forward to your Gaff address.
          </li>
        </ol>
        <Notice tone="info" title="Gmail asks you to confirm">
          <p>
            Gmail sends a confirmation email to your Gaff address. You’ll find it under “Needs
            attention” on your lettings page, with the code to finish setting up.
          </p>
        </Notice>
        <p className={styles.hint}>
          Gaff matches each enquiry to a home using the Daft or MyHome advert links you added to the
          letting. Anything it can’t match waits for you, so nothing is missed.
        </p>
      </Card>
    </Stack>
  );
}
