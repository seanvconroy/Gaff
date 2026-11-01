import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate, formatDateTime } from '@/lib/format';
import { tenancyFor } from '@/server/tenancy/tenancy';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import {
  countersignAction,
  landlordForAgreementAction,
  paperAction,
  sendAgreementAction,
} from './actions';
import { TextField } from '@/ui/Field';
import { SignForm } from '@/ui/SignForm';

export const metadata: Metadata = { title: 'Tenancy' };
export const dynamic = 'force-dynamic';

/** Stage 8 (R22 to R25): the agreement, payment, RTB registration and move-in, in order. */
export default async function TenancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ problem?: string; sent?: string; signed?: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const view = await tenancyFor(member, letting.id);
  const done = await searchParams;
  if (!view) {
    return (
      <Stack gap={8}>
        <LettingHeader letting={letting} tab="tenancy" />
        <Card>
          <h2 className="type-title">No tenancy yet</h2>
          <p>
            When your offer is accepted, the tenancy is set up here: the agreement, payment, RTB
            registration and move-in.
          </p>
        </Card>
      </Stack>
    );
  }
  const { tenancy, tenant } = view;
  const first = tenant.fullName.split(/\s+/)[0];
  const status = tenancy.agreementStatus;
  const isAgency = view.organisation.kind === 'agency';
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="tenancy" />
      {done.problem ? (
        <Notice tone="warning" role="alert">
          <p>{done.problem}</p>
        </Notice>
      ) : null}
      <Card labelledBy="agreement-heading">
        <Stack gap={4}>
          <h2 id="agreement-heading" className="type-title">
            Tenancy agreement
          </h2>
          <p>
            {tenant.fullName}, from {formatDate(tenancy.startDate)}.{' '}
            <Link href={`/lettings/${letting.id}/tenancy/agreement`}>Read the agreement</Link>
          </p>
          {status === 'draft' && view.needsLandlord ? (
            <form action={landlordForAgreementAction.bind(null, letting.id)}>
              <Stack gap={4}>
                <p>The agreement names the landlord. Add their details first.</p>
                <TextField name="landlordName" label="Landlord’s name" autoComplete="off" />
                <TextField
                  name="landlordEmail"
                  label="Landlord’s email"
                  type="email"
                  autoComplete="off"
                />
                <div>
                  <SubmitButton pendingLabel="Saving…">Save the landlord’s details</SubmitButton>
                </div>
              </Stack>
            </form>
          ) : null}
          {status === 'draft' && !view.needsLandlord ? (
            <>
              <p>
                Gaff’s standard agreement, filled in from the offer. Send it to {first} to read and
                sign on their phone. You sign after them.
              </p>
              <form action={sendAgreementAction.bind(null, letting.id)}>
                <SubmitButton pendingLabel="Sending…">Send to {first} to sign</SubmitButton>
              </form>
            </>
          ) : null}
          {status === 'with_tenant' ? (
            <p>
              <StatusPill tone="info">With {first}</StatusPill> Sent{' '}
              {tenancy.agreementSentAt ? formatDateTime(tenancy.agreementSentAt) : ''}. Waiting for
              them to sign.
            </p>
          ) : null}
          {status === 'tenant_signed' ? (
            <>
              <Notice tone="success" title={`${first} has signed`}>
                <p>
                  On {tenancy.tenantSignedAt ? formatDateTime(tenancy.tenantSignedAt) : ''}. Now
                  sign for the landlord{isAgency ? ', as their agent' : ''}, and you’ll both have a
                  copy.
                </p>
              </Notice>
              <SignForm
                action={countersignAction.bind(null, letting.id)}
                nameHint={`Your own name: ${member.name}.`}
                consentLabel={`I agree to sign this agreement electronically${isAgency ? ', for the landlord' : ''}`}
                button="Sign the agreement"
              />
            </>
          ) : null}
          {status === 'signed' || status === 'signed_on_paper' ? (
            <Notice
              tone="success"
              title={status === 'signed' ? 'Signed by both sides' : 'Signed on paper'}
              role="status"
            >
              <p>
                {done.signed ? 'Done. ' : ''}
                {status === 'signed'
                  ? `${first} has a copy too. Next: the payment request.`
                  : 'Keep the signed paper copy safe. Next: the payment request.'}
              </p>
            </Notice>
          ) : null}
          {status === 'draft' || status === 'with_tenant' ? (
            <details>
              <summary>Signing on paper instead?</summary>
              <Stack gap={4}>
                <p>
                  <Link href={`/lettings/${letting.id}/tenancy/agreement`}>
                    Print the agreement
                  </Link>
                  , sign it with {first}, then record it here.
                </p>
                <form action={paperAction.bind(null, letting.id)}>
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Both sides have signed on paper
                  </SubmitButton>
                </form>
              </Stack>
            </details>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
