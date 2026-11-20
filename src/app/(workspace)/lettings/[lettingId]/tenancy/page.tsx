import { FileSignature } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { stateWords, stepNames, tenancyCopy as copy } from '@/copy/tenancy-steps';
import { firstNameOf } from '@/domain/accounts/first-run';
import {
  finishHref,
  operatorStepHref,
  operatorSteps,
  type OperatorStepState,
} from '@/domain/tenancy/operator-steps';
import { canFinish } from '@/domain/tenancy/steps';
import { formatDate } from '@/lib/format';
import { tenancyFor } from '@/server/tenancy/tenancy';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill, type PillTone } from '@/ui/StatusPill';
import { loadLetting } from '../letting';
import { TaskHeader } from '../LettingHeader';
import styles from './tenancy.module.css';

export const metadata: Metadata = { title: 'Tenancy' };
export const dynamic = 'force-dynamic';

const tones: Record<OperatorStepState, PillTone> = {
  done: 'success',
  next: 'info',
  open: 'neutral',
  waiting: 'info',
  to_come: 'neutral',
};

/**
 * Stage 8 (UX-TN-1, R22 to R25): the tenancy's six steps, with what's done. Each opens its own
 * focused screen with one primary action; the one to do now is the page's one button. Finishing
 * the letting comes after (UX-TN-5).
 */
export default async function TenancyPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { member, letting } = await loadLetting(params);
  const view = await tenancyFor(member, letting.id);
  if (!view) {
    return (
      <Stack gap={8}>
        <TaskHeader letting={letting} title="Tenancy" />
        <EmptyState icon={FileSignature} title="No tenancy yet">
          <p>
            When your offer is accepted, the tenancy is set up here: the agreement, payment, RTB
            registration and move-in.
          </p>
        </EmptyState>
      </Stack>
    );
  }
  const { tenancy } = view;
  const first = firstNameOf(view.tenant.fullName) || 'the tenant';
  const steps = operatorSteps(tenancy);
  const next = steps.find((step) => step.state === 'next');
  const waiting = steps.some((step) => step.state === 'waiting');
  const finishing = !next && canFinish(tenancy);

  return (
    <Stack gap={8}>
      <TaskHeader letting={letting} title="Tenancy" />
      {tenancy.closedAt ? (
        <Notice tone="success" title="Finished" role="status">
          <p>
            Closed on {formatDate(tenancy.closedAt)}. The record of this letting stays, with no
            personal details in it.{' '}
            <Link href={`/lettings/${letting.id}/let`}>See how it went</Link>
          </p>
        </Notice>
      ) : null}
      <section className={styles.steps} aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="type-title">
          {copy.overview.heading}
        </h2>
        <ActionList bare labelledBy="steps-heading">
          {steps.map((step) => (
            <ActionRow
              key={step.key}
              id={`step-${step.key}`}
              href={step.state === 'to_come' ? undefined : operatorStepHref(letting.id, step.key)}
              title={stepNames[step.key]}
              current={step.state === 'next'}
              trailing={
                <StatusPill tone={tones[step.state]}>{stateWords(step.state, first)}</StatusPill>
              }
            />
          ))}
        </ActionList>
        {!tenancy.closedAt ? (
          <p className={styles.lead}>
            {next
              ? null
              : waiting
                ? copy.overview.waiting(first)
                : finishing
                  ? copy.overview.allDone
                  : copy.overview.nothing}
          </p>
        ) : null}
        {next ? (
          <div>
            <ButtonLink
              href={operatorStepHref(letting.id, next.key)}
              variant="primary"
              fullWidth="phone"
            >
              {stepNames[next.key]}
            </ButtonLink>
          </div>
        ) : finishing ? (
          <div>
            <ButtonLink href={finishHref(letting.id)} variant="primary" fullWidth="phone">
              {copy.overview.finish}
            </ButtonLink>
          </div>
        ) : null}
        {next && canFinish(tenancy) && !tenancy.closedAt ? (
          <p>
            <Link href={finishHref(letting.id)}>{copy.overview.finish}</Link>
          </p>
        ) : null}
      </section>
      <p className={styles.links}>
        <Link href={`/lettings/${letting.id}/tenancy/agreement`}>
          {copy.overview.readAgreement}
        </Link>
        <Link href={`/lettings/${letting.id}/tenancy/rent-pack`}>{copy.overview.rentPack}</Link>
      </p>
    </Stack>
  );
}
