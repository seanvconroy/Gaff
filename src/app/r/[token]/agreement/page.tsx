import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { tenancyCopy } from '@/copy/renter';
import { homeFrom, listerFrom } from '@/domain/frame/frame';
import { formatDateTime } from '@/lib/format';
import { loadTenantAgreement } from '@/server/tenancy/tenancy';
import { ButtonLink, buttonProps } from '@/ui/Button';
import { DocumentView } from '@/ui/Document';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { SignForm } from '@/ui/SignForm';
import styles from '../../renter.module.css';
import { tenantSignAction } from './actions';

export const metadata: Metadata = { title: 'Your tenancy agreement' };
export const dynamic = 'force-dynamic';

const copy = tenancyCopy.agreement;

/**
 * R22, UX-RN-21: the tenant reads their agreement and signs it, on their phone, with no account.
 * The home is at the top, as on every page; links jump to each section; a copy can be
 * downloaded. To sign, they tick one box and type their name: that is the signature (Q23).
 */
export default async function TenantAgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await loadTenantAgreement(token);
  if (!view || view.tenancy.agreementStatus === 'draft') {
    return (
      <PrivateFrame audience="renter" lister={view ? listerFrom(view.organisation) : null}>
        <Outcome tone="waiting" title={copy.notReady} headingLevel={1}>
          <p>{copy.notReadyText}</p>
        </Outcome>
      </PrivateFrame>
    );
  }
  const { tenancy, organisation } = view;
  const status = tenancy.agreementStatus;
  const toSign = status === 'with_tenant' && view.unchanged;
  const both = status === 'signed' || status === 'signed_on_paper';
  return (
    <PrivateFrame
      audience="renter"
      lister={listerFrom(organisation)}
      home={homeFrom(view.letting, tenancy.startDate)}
      homeHeading="p"
      next={
        <p>
          {both
            ? copy.bothNext(organisation.name)
            : status === 'tenant_signed'
              ? copy.signedNext(organisation.name)
              : copy.signNext(organisation.name)}
        </p>
      }
    >
      <div className={styles.task}>
        <h1 className={styles.title}>{copy.title}</h1>
        {!view.unchanged ? (
          <Notice tone="warning" title={copy.changedTitle}>
            <p>{copy.changedText(organisation.name)}</p>
          </Notice>
        ) : null}
        {status === 'tenant_signed' ? (
          <Outcome tone="success" title={copy.signedTitle} role="status" />
        ) : null}
        {both ? <Outcome tone="success" title={copy.bothTitle} role="status" /> : null}
        <DocumentView
          title={view.document.title}
          sections={view.document.sections}
          contents={copy.contents}
          signatures={
            both || status === 'tenant_signed' ? (
              <>
                <p>
                  <strong>{copy.signatures.tenant}</strong>{' '}
                  {tenancy.tenantSignedAt
                    ? copy.signatures.tenantSigned(
                        tenancy.tenantSignedName ?? '',
                        formatDateTime(tenancy.tenantSignedAt),
                      )
                    : copy.signatures.onPaper}
                </p>
                <p>
                  <strong>{copy.signatures.landlord}</strong>{' '}
                  {tenancy.operatorSignedAt
                    ? copy.signatures.landlordSigned(
                        view.signerName ?? '',
                        organisation.name,
                        formatDateTime(tenancy.operatorSignedAt),
                      )
                    : copy.signatures.notYet}
                </p>
              </>
            ) : undefined
          }
        />
        <div className={styles.actions}>
          {/* A file to keep: a plain link, so the phone saves it or opens it. */}
          <a
            href={`/r/${token}/agreement/download`}
            {...buttonProps('secondary', 'phone')}
            download
          >
            <Download size={20} strokeWidth={1.75} aria-hidden="true" />
            {copy.download}
          </a>
          {toSign ? null : (
            <ButtonLink href={`/r/${token}`} variant="quiet" fullWidth="phone">
              {copy.back}
            </ButtonLink>
          )}
        </div>
        {toSign ? (
          <section className={styles.group} aria-labelledby="sign-title">
            <h2 id="sign-title" className="type-title">
              {copy.signTitle}
            </h2>
            <SignForm
              action={tenantSignAction.bind(null, token)}
              hash={view.hash}
              nameHint={copy.nameHint(view.tenant.fullName)}
              consentLabel={copy.consent}
              button={copy.button}
              fullWidth
            />
          </section>
        ) : null}
      </div>
    </PrivateFrame>
  );
}
