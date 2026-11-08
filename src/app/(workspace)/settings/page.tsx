import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { db } from '@/db/client';
import { organisations } from '@/db/schema';
import { formatRatio, incomeRuleChoices } from '@/domain/applications/apply';
import { formatIban } from '@/domain/tenancy/payment';
import { env } from '@/lib/env';
import { requireMember } from '@/server/auth/member';
import { CopyButton } from '@/ui/CopyButton';
import { Disclosure } from '@/ui/Disclosure';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Columns } from '@/ui/Form';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { approveBeforeSendAction, incomeRuleAction, usualTimesAction } from './actions';
import { PaymentAccountForm } from './PaymentAccountForm';
import styles from './settings.module.css';

export const metadata: Metadata = { title: 'Settings' };

/** A setting: what it is and why on the left, the form on the right (one column on a phone). */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.about}>
        <h2 id={id} className="type-title">
          {title}
        </h2>
        <div className={styles.description}>{description}</div>
      </div>
      <div className={styles.panel}>{children}</div>
    </section>
  );
}

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
      <PageHeader
        eyebrow={member.organisationName}
        title="Settings"
        lead="Where enquiries come in, how much the AI does on its own, and the rules you use for every letting."
      />
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

      <div className={styles.sections}>
        <Section
          id="account-heading"
          title="Your account"
          description={
            <p>
              What Gaff has checked about you, which renters see on your listings, and who works
              with you.
            </p>
          }
        >
          <ul className={styles.links}>
            <li>
              <Link href="/settings/checks">Checks: what renters see Gaff has checked</Link>
            </li>
            <li>
              <Link href="/settings/profile">Profile: your name and details on listings</Link>
            </li>
            <li>
              <Link href="/settings/team">Team: your colleagues, and inviting more</Link>
            </li>
          </ul>
        </Section>

        <Section
          id="address-heading"
          title="Your Gaff address"
          description={
            <p>
              Send your Daft and MyHome enquiries here, and Gaff answers every one. Gaff matches
              each enquiry to a home using the advert links on the letting; anything it can’t match
              waits for you in Needs attention.
            </p>
          }
        >
          <div className={styles.address}>
            <code>{address}</code>
            <CopyButton value={address} what="your Gaff address" />
          </div>
          <Disclosure summary="Set up forwarding once">
            <ol className={styles.steps}>
              <li>
                <strong>Gmail:</strong> in Settings, open Forwarding and add {address}. Then create
                a filter for emails from <code>daft.ie</code> or <code>myhome.ie</code> and choose
                “Forward it to” your Gaff address.
              </li>
              <li>
                <strong>Outlook:</strong> in Settings, open Rules and add a rule: if the sender
                contains <code>daft.ie</code> or <code>myhome.ie</code>, forward to your Gaff
                address.
              </li>
            </ol>
            <Notice tone="info" title="Gmail asks you to confirm">
              <p>
                Gmail sends a confirmation email to your Gaff address. You’ll find it under “Needs
                attention”, with the code to finish setting up.
              </p>
            </Notice>
          </Disclosure>
        </Section>

        <Section
          id="approvals-heading"
          title="Approve before send"
          description={
            <p>
              While this is on, every answer the AI writes waits for you in Approvals. Fixed
              messages, like first replies and reminders, always go straight out. Most operators
              keep it on for their first few lettings.
            </p>
          }
        >
          <form action={approveBeforeSendAction}>
            <Stack gap={4}>
              <ChoiceGroup
                name="on"
                legend="AI-written answers"
                inline
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
        </Section>

        <Section
          id="income-heading"
          title="Income rule"
          description={
            <p>
              The take-home income you look for, compared with the rent. It’s the same for everyone,
              and renters see it before they apply. Housing support, such as HAP, always counts as
              income. A renter below the rule isn’t turned away: you decide.
            </p>
          }
        >
          <form action={incomeRuleAction}>
            <Stack gap={4}>
              <ChoiceGroup
                name="ruleTenths"
                legend="Take-home income of at least"
                inline
                defaultValue={String(organisation!.incomeRuleTenths)}
                options={incomeRuleChoices.map((tenths) => ({
                  value: String(tenths),
                  label: `${formatRatio(tenths)} times the rent`,
                }))}
              />
              <div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save income rule
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </Section>

        <Section
          id="payment-heading"
          title="Where tenants pay"
          description={
            <p>
              The account a new tenant pays the deposit and first month’s rent into: your own, or
              your client account. Gaff never handles the money. Tenants see these details only on
              their private page, and are asked to check them with you by phone.
            </p>
          }
        >
          <PaymentAccountForm
            accountName={organisation!.paymentAccountName ?? ''}
            iban={organisation!.paymentIban ? formatIban(organisation!.paymentIban) : ''}
          />
        </Section>

        <Section
          id="usual-heading"
          title="Your usual times"
          description={
            <>
              <p>
                How long a letting took you before Gaff, from your pilot interview. Your lettings
                page compares your time in Gaff with these.
              </p>
              <p>
                Gaff counts a minute of your time only while you’re using it, and shows totals for
                each letting, never for each person.
              </p>
            </>
          }
        >
          <form action={usualTimesAction}>
            <Stack gap={4}>
              <Columns>
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
              </Columns>
              <div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save usual times
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </Section>
      </div>
    </Stack>
  );
}
