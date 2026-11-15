import { Building2, KeyRound, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import { ButtonLink } from '@/ui/Button';
import { Chips } from '@/ui/Chips';
import { ChoiceCards } from '@/ui/ChoiceCards';
import { TextField } from '@/ui/Field';
import { FlowExit, FlowShell } from '@/ui/FlowShell';
import { DateField, TimeField } from '@/ui/Pickers';
import styles from '../ui.module.css';

export const metadata: Metadata = { title: 'Flow shell' };
export const dynamic = 'force-dynamic';

const names = ['You', 'The home', 'Viewings'];

const steps: Array<{ title: string; lead: string; content: ReactNode }> = [
  {
    title: 'Who are you letting for?',
    lead: 'This sets up what Gaff asks you next.',
    content: (
      <ChoiceCards
        name="flow-for"
        legend="Who are you letting for?"
        hideLegend
        defaultValue="own"
        options={[
          { value: 'own', label: 'My own home', help: 'I’m the landlord.', icon: KeyRound },
          {
            value: 'agency',
            label: 'Other people',
            help: 'We’re a letting agency.',
            icon: Building2,
          },
          {
            value: 'renting',
            label: 'I’m looking',
            help: 'I want to rent a home.',
            icon: UserRound,
          },
        ]}
      />
    ),
  },
  {
    title: 'When is it free, and what’s the rent?',
    lead: 'Renters see both on the home’s page.',
    content: (
      <>
        <DateField name="flow-available" label="Available from" defaultValue="2026-12-15" />
        <TextField
          name="flow-rent"
          label="Rent a month"
          prefix="€"
          width="medium"
          inputMode="numeric"
          defaultValue="1,850"
        />
      </>
    ),
  },
  {
    title: 'When can people view?',
    lead: 'Renters book themselves into the times you add.',
    content: (
      <>
        <DateField name="flow-viewing" label="Date" min="2026-11-16" />
        <TimeField name="flow-from" label="From" defaultValue="18:00" />
        <TimeField name="flow-until" label="Until" defaultValue="19:00" />
        <Chips
          name="flow-slot"
          legend="Length of each slot"
          defaultValue="15"
          options={[
            { value: '10', label: '10 minutes' },
            { value: '15', label: '15 minutes' },
            { value: '20', label: '20 minutes' },
            { value: '30', label: '30 minutes' },
          ]}
        />
      </>
    ),
  },
];

/**
 * Development only (DEV_TOOLS=1): the flow shell holding a made-up task of three steps, to see
 * the frame at both widths (work package WP-2). Nothing is saved.
 */
export default async function FlowShellPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; from?: string }>;
}) {
  if (!env().DEV_TOOLS) notFound();
  const { step: asked, from } = await searchParams;
  const index = Math.min(Math.max(Number(asked ?? 1) || 1, 1), steps.length) - 1;
  const step = steps[index]!;
  const last = index === steps.length - 1;
  return (
    <FlowShell
      // The key makes each step arrive afresh, so it slides in.
      key={index}
      leave={
        index === 0
          ? { kind: 'close', href: '/dev/ui' }
          : { kind: 'back', href: `/dev/ui/flow?step=${index}&from=back` }
      }
      progress={{ label: 'Add a letting', segments: names, current: index }}
      saveAndExit={<FlowExit href="/dev/ui" />}
      direction={from === 'back' ? 'back' : 'forward'}
      back={
        index > 0 ? (
          <ButtonLink href={`/dev/ui/flow?step=${index}&from=back`} variant="quiet">
            Back
          </ButtonLink>
        ) : undefined
      }
      primary={
        <ButtonLink
          href={last ? '/dev/ui' : `/dev/ui/flow?step=${index + 2}`}
          variant="primary"
          fullWidth="phone"
        >
          {last ? 'Finish' : 'Continue'}
        </ButtonLink>
      }
    >
      <div className={styles.stepHead}>
        <h1 className={`${styles.title} type-display`}>{step.title}</h1>
        <p className={styles.muted}>{step.lead}</p>
      </div>
      {step.content}
    </FlowShell>
  );
}
