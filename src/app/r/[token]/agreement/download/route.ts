import { tenancyCopy } from '@/copy/renter';
import { agreementFile, agreementFileName } from '@/domain/tenancy/agreement-file';
import { formatDateTime } from '@/lib/format';
import { loadTenantAgreement } from '@/server/tenancy/tenancy';

/**
 * UX-RN-21: "Download a copy" of the tenant's own agreement, as one file they can keep and
 * print. The same words the agreement page shows, with whoever has signed so far.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadTenantAgreement(token);
  if (!view || view.tenancy.agreementStatus === 'draft') {
    return new Response('Not found', { status: 404 });
  }
  const { tenancy, organisation } = view;
  const words = tenancyCopy.agreement.signatures;
  const signatures: string[] = [];
  if (tenancy.tenantSignedAt) {
    signatures.push(
      `${words.tenant} ${words.tenantSigned(tenancy.tenantSignedName ?? '', formatDateTime(tenancy.tenantSignedAt))}`,
    );
  } else if (tenancy.agreementStatus === 'signed_on_paper') {
    signatures.push(`${words.tenant} ${words.onPaper}`);
  }
  if (tenancy.operatorSignedAt) {
    signatures.push(
      `${words.landlord} ${words.landlordSigned(view.signerName ?? '', organisation.name, formatDateTime(tenancy.operatorSignedAt))}`,
    );
  }
  const name = agreementFileName(view.letting.addressLine1);
  return new Response(
    agreementFile({
      title: view.document.title,
      sections: view.document.sections,
      signatures,
    }),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
