import Link from 'next/link';
import type { Metadata } from 'next';
import { maskMobile } from '@/domain/verification/mobile';
import { badgeWords, missingCheckWords, type CheckRecord } from '@/domain/verification/readiness';
import { requireMember } from '@/server/auth/member';
import { letterReadiness } from '@/server/verification/readiness';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { startIdentityAction } from './actions';
import { MobileForm } from './MobileForm';

export const metadata: Metadata = { title: 'Checks' };

const failureWords: Record<string, string> = {
  name_differs: 'The name doesn’t match the PSRA register. Check it matches your licence exactly.',
  not_current: 'The PSRA register shows this licence isn’t current.',
  not_found: 'We couldn’t find this number on the PSRA register. Check it against your licence.',
  document: 'The check couldn’t confirm your ID document. Try again with another one.',
  face_mismatch: 'The selfie didn’t match the photo on your ID. Try again in good light.',
  gave_up: 'The check wasn’t finished. You can start it again.',
};

function CheckStatus({ check }: { check: (CheckRecord & { reason?: string | null }) | undefined }) {
  if (!check) return <StatusPill tone="neutral">Not started</StatusPill>;
  const badge = badgeWords(check);
  switch (check.status) {
    case 'passed':
      return <StatusPill tone="success">{badge ?? 'Checked'}</StatusPill>;
    case 'failed':
      return <StatusPill tone="warning">Not passed</StatusPill>;
    default:
      return <StatusPill tone="info">Waiting for the check</StatusPill>;
  }
}

/** M22 to M27: what Gaff has checked, what's left, and the badges renters will see. */
export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; identity?: string }>;
}) {
  const { saved, identity } = await searchParams;
  const member = await requireMember();
  const readiness = await letterReadiness(member);
  const idCheck = readiness.member.find((c) => c.method === 'id_document');
  const agencyLicence = readiness.organisation.find((c) => c.method === 'psra_register');
  const ownLicence = readiness.member.find((c) => c.method === 'psra_register');

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Checks"
        lead="Renters see what Gaff has checked about you, on every home you list. Your homes can go live once these are done."
      />
      {saved === 'mobile' ? (
        <Notice tone="success" role="status">
          <p>Your mobile number is confirmed.</p>
        </Notice>
      ) : null}
      {identity === 'returned' && idCheck?.status === 'pending' ? (
        <Notice tone="info" role="status">
          <p>
            Thanks. We’ll show the result here as soon as the check finishes, usually within
            minutes.
          </p>
        </Notice>
      ) : null}
      {readiness.missing.length === 0 ? (
        <Notice tone="success" title="You’re checked" role="status">
          <p>Your homes can go live as soon as you publish them.</p>
        </Notice>
      ) : (
        <Notice tone="info" title="Before your homes can go live">
          <ul>
            {readiness.missing.map((m) => (
              <li key={m}>{missingCheckWords[m]}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Card labelledBy="mobile-heading">
        <h2 id="mobile-heading" className="type-title">
          Your mobile
        </h2>
        {readiness.mobile ? (
          <p>
            <StatusPill tone="success">Confirmed: {maskMobile(readiness.mobile)}</StatusPill>
          </p>
        ) : (
          <Stack gap={4}>
            <p>We text you a code to confirm it’s yours. Renters never see this number.</p>
            <MobileForm />
          </Stack>
        )}
      </Card>

      {member.organisationKind === 'landlord' ? (
        <Card labelledBy="identity-heading">
          <h2 id="identity-heading" className="type-title">
            Your identity
          </h2>
          <Stack gap={4}>
            <p>
              <CheckStatus check={idCheck} />
            </p>
            {idCheck?.status === 'failed' && idCheck.reason ? (
              <p>{failureWords[idCheck.reason]}</p>
            ) : null}
            {idCheck?.status !== 'passed' ? (
              <>
                <p>
                  You take a photo of your passport, driving licence or ID card, then a selfie. Our
                  checking partner, Stripe, confirms they match. Gaff keeps only the result and your
                  name, never the photos, and Stripe deletes them after 30 days.
                </p>
                <form action={startIdentityAction}>
                  <SubmitButton pendingLabel="Opening the check…">
                    {idCheck ? 'Start the check again' : 'Check my identity'}
                  </SubmitButton>
                </form>
              </>
            ) : null}
          </Stack>
        </Card>
      ) : (
        <Card labelledBy="licence-heading">
          <h2 id="licence-heading" className="type-title">
            PSRA licences
          </h2>
          <Stack gap={4}>
            <p>
              Gaff checks your agency’s licence, and your own, on the PSRA public register, usually
              within one working day.
            </p>
            <dl>
              <dt className="type-label">
                Your agency’s licence
                {agencyLicence?.licenceNumber ? `, ${agencyLicence.licenceNumber}` : ''}
              </dt>
              <dd>
                <CheckStatus check={agencyLicence} />
                {agencyLicence?.status === 'failed' && agencyLicence.reason ? (
                  <p>{failureWords[agencyLicence.reason]}</p>
                ) : null}
              </dd>
              <dt className="type-label">
                Your own licence{ownLicence?.licenceNumber ? `, ${ownLicence.licenceNumber}` : ''}
              </dt>
              <dd>
                <CheckStatus check={ownLicence} />
                {!ownLicence ? (
                  <p>
                    <Link href="/settings/profile">Add your licence number to your profile</Link>
                  </p>
                ) : null}
              </dd>
            </dl>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
