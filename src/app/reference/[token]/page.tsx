import type { Metadata } from 'next';
import { questionsFor } from '@/domain/checks/checks';
import { loadReferenceRequest } from '@/server/checks/checks';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { RenterShell } from '../../r/RenterShell';
import { ReferenceForm } from './ReferenceForm';

export const metadata: Metadata = { title: 'A reference' };
export const dynamic = 'force-dynamic';

/** R18: a referee answers a few fixed questions, with no account, in about two minutes. */
export default async function ReferencePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { token } = await params;
  const { sent } = await searchParams;
  const request = await loadReferenceRequest(token);
  if (!request) {
    return (
      <RenterShell operatorName="Gaff">
        <Stack gap={4}>
          <h1 className="type-display-mobile">This link isn’t working</h1>
          <p>It may have expired. There’s nothing else you need to do.</p>
        </Stack>
      </RenterShell>
    );
  }
  const done = sent || request.status === 'answered';
  return (
    <RenterShell operatorName={request.operatorName}>
      <Stack gap={6}>
        <Stack gap={2}>
          <h1 className="type-display-mobile">A reference for {request.renterName}</h1>
          <p>
            {request.renterName} has applied to rent a home through {request.operatorName}, and gave
            your name as{' '}
            {request.kind === 'landlord_reference' ? 'a previous landlord' : 'their employer'}.
          </p>
        </Stack>
        {done ? (
          <Notice tone="success" title="Thank you" role="status">
            <p>
              Your reference is with {request.operatorName}. There’s nothing else you need to do.
            </p>
          </Notice>
        ) : (
          <>
            <p>
              It takes about two minutes. Your answers go only to {request.operatorName}, and are
              deleted once the tenancy starts or the letting closes.
            </p>
            <ReferenceForm token={token} questions={questionsFor(request.kind)} />
          </>
        )}
      </Stack>
    </RenterShell>
  );
}
