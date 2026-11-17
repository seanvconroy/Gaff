import type { Metadata } from 'next';
import Link from 'next/link';
import { tenancyCopy as copy } from '@/copy/tenancy-steps';
import { operatorStepHref } from '@/domain/tenancy/operator-steps';
import { formatDateTime } from '@/lib/format';
import { Disclosure } from '@/ui/Disclosure';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { paperAction, signAction } from '../actions';
import { loadStep, type StepProps } from '../step';
import { StepDone } from '../StepDone';
import { StepForm } from '../StepForm';

export const metadata: Metadata = { title: 'Sign the agreement' };
export const dynamic = 'force-dynamic';

/**
 * Step 2 (UX-TN-1, R22): once the tenant has signed, the operator signs for the landlord: the
 * agreement and one field to type a name. "We signed on paper" is behind a link. While the
 * agreement is with the tenant, the screen says so.
 */
export default async function SignAgreementPage({ params }: StepProps) {
  const { member, view, lettingId, state, tenancyHref, first, isAgency } = await loadStep(
    params,
    'sign_agreement',
  );
  const { tenancy } = view;
  const paper = {
    summary: copy.paper.summary,
    text: copy.paper.text(first),
    button: copy.paper.button,
    intent: 'paper',
  };

  if (state === 'done') {
    const onPaper = tenancy.agreementStatus === 'signed_on_paper';
    return (
      <StepDone
        leaveHref={tenancyHref}
        title={onPaper ? copy.sign.paperTitle : copy.sign.signedTitle}
        onwards={{
          href: operatorStepHref(lettingId, 'request_payment'),
          label: copy.request.button(first),
        }}
      >
        <p>{onPaper ? copy.sign.paperText : copy.sign.signedText(first)}</p>
      </StepDone>
    );
  }

  if (state === 'waiting') {
    return (
      <StepDone
        leaveHref={tenancyHref}
        tone="waiting"
        title={copy.sign.waitingTitle(first)}
        onwards={{ href: tenancyHref, label: copy.done }}
      >
        <p>
          {copy.sign.waitingText(
            first,
            tenancy.agreementSentAt ? formatDateTime(tenancy.agreementSentAt) : '',
          )}
        </p>
        <Disclosure summary={copy.paper.summary}>
          <form action={paperAction.bind(null, lettingId)}>
            <Stack gap={4}>
              <p>{copy.paper.text(first)}</p>
              <div>
                <SubmitButton variant="secondary" fullWidth="phone" pendingLabel="Saving…">
                  {copy.paper.button}
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </Disclosure>
      </StepDone>
    );
  }

  return (
    <StepForm
      action={signAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: tenancyHref }}
      title={copy.sign.title}
      lead={copy.sign.lead(
        first,
        tenancy.tenantSignedAt ? formatDateTime(tenancy.tenantSignedAt) : '',
        isAgency,
      )}
      fields={[
        {
          kind: 'text',
          name: 'typedName',
          label: copy.sign.nameLabel,
          hint: copy.sign.nameHint(member.name),
          autoComplete: 'name',
        },
        {
          kind: 'choice',
          name: 'consent',
          legend: copy.sign.consentLegend,
          type: 'checkbox',
          options: [{ value: 'yes', label: copy.sign.consent(isAgency) }],
        },
      ]}
      primary={copy.sign.button}
      pendingLabel={copy.sign.signing}
      alternative={paper}
    >
      <p>
        <Link href={`${tenancyHref}/agreement`}>{copy.overview.readAgreement}</Link>
      </p>
    </StepForm>
  );
}
