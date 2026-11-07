import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../../outbox/outbox.module.css';
import { standInIdentityAction } from './actions';

export const metadata: Metadata = { title: 'Stand-in identity check' };
export const dynamic = 'force-dynamic';

/**
 * Development and staging only: stands in for Stripe Identity (M24), as /dev/checks does for
 * renters. Stripe takes the landlord through a document-and-selfie check; here, you choose.
 */
export default async function StandInIdentityPage({
  params,
  searchParams,
}: {
  params: Promise<{ organisationId: string; checkId: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const config = env();
  if (!config.DEV_TOOLS || config.LETTER_IDENTITY_PROVIDER !== 'stand_in') notFound();
  const { organisationId, checkId } = await params;
  const { return: returnUrl = '/settings/checks' } = await searchParams;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(organisationId) || !uuid.test(checkId)) notFound();
  const action = standInIdentityAction.bind(null, organisationId, checkId, returnUrl);
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title="Stand-in identity check"
          lead="Stripe Identity checks a photo ID and a selfie. Here, you choose the result."
        />
        <form action={action}>
          <Stack gap={6}>
            <TextField name="verifiedName" label="Name on the ID" defaultValue="Mary Walsh" />
            <Row>
              <SubmitButton name="outcome" value="pass">
                The ID and selfie match
              </SubmitButton>
              <SubmitButton variant="secondary" name="outcome" value="face_mismatch">
                The selfie doesn’t match
              </SubmitButton>
              <SubmitButton variant="secondary" name="outcome" value="document">
                The document isn’t genuine
              </SubmitButton>
            </Row>
          </Stack>
        </form>
      </Stack>
    </main>
  );
}
