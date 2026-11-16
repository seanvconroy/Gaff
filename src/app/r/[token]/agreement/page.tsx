import type { Metadata } from 'next';
import { homeFrom, listerFrom } from '@/domain/frame/frame';
import { formatDateTime } from '@/lib/format';
import { loadTenantAgreement } from '@/server/tenancy/tenancy';
import { DocumentView } from '@/ui/Document';
import { Card, Stack } from '@/ui/Layout';
import { Outcome } from '@/ui/Outcome';
import { Notice } from '@/ui/Notice';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { SignForm } from '@/ui/SignForm';
import { tenantSignAction } from './actions';

export const metadata: Metadata = { title: 'Your tenancy agreement' };
export const dynamic = 'force-dynamic';

/** R22: the tenant reads their agreement and signs it, on their phone, with no account. */
export default async function TenantAgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ signed?: string }>;
}) {
  const { token } = await params;
  const { signed } = await searchParams;
  const view = await loadTenantAgreement(token);
  if (!view || view.tenancy.agreementStatus === 'draft') {
    return (
      <PrivateFrame audience="renter" lister={view ? listerFrom(view.organisation) : null}>
        <Outcome tone="waiting" title="Your agreement isn’t ready yet" headingLevel={1}>
          <p>We’ll email you a link as soon as it is.</p>
        </Outcome>
      </PrivateFrame>
    );
  }
  const { tenancy, organisation } = view;
  const status = tenancy.agreementStatus;
  return (
    // UX-RN-21: the home is at the top, as on every page. The page's own title stays its title.
    <PrivateFrame
      audience="renter"
      lister={listerFrom(organisation)}
      home={homeFrom(view.letting, tenancy.startDate)}
      homeHeading="p"
    >
      <Stack gap={6}>
        <h1 className="type-display-mobile">Your tenancy agreement</h1>
        {!view.unchanged ? (
          <Notice tone="warning" title="This agreement has changed">
            <p>{organisation.name} will send you the new version to sign.</p>
          </Notice>
        ) : null}
        {status === 'tenant_signed' ? (
          <Notice
            tone="success"
            title={signed ? 'Thanks, you’ve signed' : 'You’ve signed'}
            role="status"
          >
            <p>
              {organisation.name} will sign too, and we’ll email you your copy. Then they’ll send
              you how to pay the deposit and first month’s rent.
            </p>
          </Notice>
        ) : null}
        {status === 'signed' || status === 'signed_on_paper' ? (
          <Notice tone="success" title="Signed by both sides" role="status">
            <p>
              To keep a copy, use your browser’s Print or Share and choose Save as PDF. Next,{' '}
              {organisation.name} will send you how to pay the deposit and first month’s rent.
            </p>
          </Notice>
        ) : null}
        <Card>
          <DocumentView
            title={view.document.title}
            sections={view.document.sections}
            signatures={
              status === 'signed' || status === 'signed_on_paper' || status === 'tenant_signed' ? (
                <>
                  <p>
                    <strong>Tenant:</strong>{' '}
                    {tenancy.tenantSignedAt
                      ? `signed electronically by ${tenancy.tenantSignedName} on ${formatDateTime(tenancy.tenantSignedAt)}`
                      : 'signed on paper'}
                  </p>
                  <p>
                    <strong>For the landlord:</strong>{' '}
                    {tenancy.operatorSignedAt
                      ? `signed by ${view.signerName} for ${organisation.name} on ${formatDateTime(tenancy.operatorSignedAt)}`
                      : 'not signed yet'}
                  </p>
                </>
              ) : undefined
            }
          />
        </Card>
        {status === 'with_tenant' && view.unchanged ? (
          <Card>
            <h2 className="type-title">Sign your agreement</h2>
            <SignForm
              action={tenantSignAction.bind(null, token)}
              hash={view.hash}
              nameHint={`As it’s written on the agreement: ${view.tenant.fullName}.`}
              consentLabel="I’ve read the agreement, and I agree to sign it electronically"
              button="Sign my tenancy agreement"
              fullWidth
            />
            <p>Once you’ve signed, {organisation.name} signs too, and you’ll both have a copy.</p>
          </Card>
        ) : null}
      </Stack>
    </PrivateFrame>
  );
}
