import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { currentUser } from '@/server/auth/member';
import { standInIdentityCheck } from '@/server/identity/stand-in';
import { TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../outbox/outbox.module.css';
import { standInIdentityAction } from './actions';

export const metadata: Metadata = { title: 'Stand-in identity check' };
export const dynamic = 'force-dynamic';

/**
 * Development and the test copy only: stands in for Stripe Identity's own pages (P17), for
 * renters and letters alike. Stripe checks a photo ID, and a selfie if asked; here, you choose.
 */
export default async function StandInIdentityPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkId: string }>;
  searchParams: Promise<{ return?: string; selfie?: string }>;
}) {
  const config = env();
  if (!config.DEV_TOOLS || config.IDENTITY_PROVIDER !== 'stand_in') notFound();
  const { checkId } = await params;
  const { return: returnUrl = '/', selfie } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) notFound();
  const check = await standInIdentityCheck(checkId);
  if (!check || check.status !== 'pending') notFound();
  // Only the person whose check it is sees their own name suggested.
  const user = await currentUser();
  const suggested = user?.id === check.userId ? check.suggested : { first: 'Mary', last: 'Walsh' };
  const withSelfie = selfie !== '0';
  const action = standInIdentityAction.bind(null, checkId, returnUrl);
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title="Stand-in identity check"
          lead={
            withSelfie
              ? 'Stripe Identity checks a photo ID and a selfie. Here, you choose the result.'
              : 'Stripe Identity checks a photo ID, without a selfie. Here, you choose the result.'
          }
        />
        <form action={action}>
          <Stack gap={6}>
            <TextField
              name="firstName"
              label="First name on the ID"
              defaultValue={suggested.first}
            />
            <TextField name="lastName" label="Last name on the ID" defaultValue={suggested.last} />
            <Row>
              <SubmitButton name="outcome" value="pass">
                {withSelfie ? 'The ID and selfie match' : 'The ID is genuine'}
              </SubmitButton>
              {withSelfie ? (
                <SubmitButton variant="secondary" name="outcome" value="face_mismatch">
                  The selfie doesn’t match
                </SubmitButton>
              ) : null}
              <SubmitButton variant="secondary" name="outcome" value="document">
                The document isn’t genuine
              </SubmitButton>
              {withSelfie ? (
                <SubmitButton variant="secondary" name="outcome" value="declined">
                  Decline the selfie
                </SubmitButton>
              ) : null}
            </Row>
          </Stack>
        </form>
      </Stack>
    </main>
  );
}
