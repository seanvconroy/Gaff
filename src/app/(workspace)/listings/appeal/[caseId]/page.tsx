import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { removalReasonWords } from '@/copy/listings';
import { formatDate } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { appealableCase, appealDecision } from '@/server/moderation/review';
import { TextArea } from '@/ui/Field';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

export const metadata: Metadata = { title: 'Appeal a decision' };

const decisionWords = {
  remove_listing: 'removed your listing',
  pause_account: 'paused your account’s listings',
  suspend_account: 'suspended your account',
} as const;

async function appealAction(caseId: string, formData: FormData) {
  'use server';
  const member = await requireMember();
  try {
    await appealDecision(member, caseId, String(formData.get('appeal') ?? ''));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/listings/appeal/${caseId}?problem=1`);
  }
  redirect(`/listings/appeal/${caseId}`);
}

/** M98: the letter appeals; a different person at Gaff decides within a working day. */
export default async function AppealPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ problem?: string }>;
}) {
  const member = await requireMember();
  const { caseId } = await params;
  const { problem } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(caseId)) notFound();
  const decided = await appealableCase(member, caseId);
  if (!decided) notFound();
  const what = decisionWords[decided.decision as keyof typeof decisionWords] ?? 'decided';
  return (
    <Stack gap={8}>
      <PageHeader
        title="Appeal a decision"
        lead={`On ${formatDate(decided.closedAt ?? new Date())}, a person at Gaff ${what}, because ${
          decided.decisionReason ? removalReasonWords[decided.decisionReason] : 'of a report'
        }.`}
      />
      {decided.appeal ? (
        <Notice tone="info" title="Your appeal is with Gaff" role="status">
          <p>
            {decided.appeal.status === 'open'
              ? 'A different person at Gaff will decide it within a working day, and email you the outcome.'
              : 'Your appeal has been decided. We emailed you the outcome.'}
          </p>
        </Notice>
      ) : (
        <form action={appealAction.bind(null, caseId)}>
          <Stack gap={4}>
            {problem ? (
              <Notice tone="warning" role="alert">
                <p>Tell us in a sentence or two why the decision is wrong.</p>
              </Notice>
            ) : null}
            <TextArea
              name="appeal"
              label="Why is the decision wrong?"
              hint="A different person at Gaff reads it and decides within a working day."
              rows={6}
            />
            <SubmitButton pendingLabel="Sending…">Send my appeal</SubmitButton>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
