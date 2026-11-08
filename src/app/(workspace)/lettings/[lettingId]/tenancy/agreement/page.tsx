import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { tenancyFor } from '@/server/tenancy/tenancy';
import { DocumentView } from '@/ui/Document';
import { Notice } from '@/ui/Notice';
import { Stack } from '@/ui/Layout';
import { loadLetting } from '../../letting';

export const metadata: Metadata = { title: 'Tenancy agreement' };
export const dynamic = 'force-dynamic';

/** R22: the agreement to read or print, with the signatures once there are any. */
export default async function AgreementPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const view = await tenancyFor(member, letting.id);
  if (!view) return <p>There’s no tenancy for this home yet.</p>;
  const { tenancy } = view;
  return (
    <Stack gap={6}>
      {tenancy.agreementHash && tenancy.agreementHash !== view.hash ? (
        <Notice tone="warning" title="The details have changed since it was sent">
          <p>Send it again from the Tenancy tab, so everyone signs the same text.</p>
        </Notice>
      ) : null}
      <DocumentView
        title={view.document.title}
        sections={view.document.sections}
        signatures={
          <>
            <p>
              <strong>Tenant:</strong>{' '}
              {tenancy.tenantSignedAt
                ? `signed electronically by ${tenancy.tenantSignedName} on ${formatDateTime(tenancy.tenantSignedAt)}`
                : tenancy.agreementStatus === 'signed_on_paper'
                  ? 'signed on paper'
                  : 'not signed yet'}
            </p>
            <p>
              <strong>For the landlord:</strong>{' '}
              {tenancy.operatorSignedAt
                ? `${tenancy.agreementStatus === 'signed_on_paper' ? 'signed on paper, recorded' : 'signed electronically'} by ${view.signerName} for ${view.organisation.name} on ${formatDateTime(tenancy.operatorSignedAt)}`
                : 'not signed yet'}
            </p>
            {tenancy.agreementHash ? (
              <p className="type-caption">
                Agreement fingerprint: {tenancy.agreementHash.slice(0, 16)}
              </p>
            ) : null}
          </>
        }
      />
    </Stack>
  );
}
