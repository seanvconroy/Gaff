import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { standInCheck } from '@/server/checks/checks';
import { requireStandInCheck } from '@/server/dev/gate';
import { standInPersonCheck } from '@/server/identity/person-checks';
import { TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../outbox/outbox.module.css';
import { standInResultAction } from './actions';

export const metadata: Metadata = { title: 'Stand-in check' };
export const dynamic = 'force-dynamic';

/**
 * Development and staging only (DEV_TOOLS=1): stands in for the ID check's provider where
 * Stripe Identity isn't set up (ADR-0020). A real provider takes the person through a
 * document-and-selfie check. On the test copy (BA-1, BA-6), Gaff's own team, and the person
 * whose check it is through the link the stand-in sent them to: it shows that person's name and
 * sets their check's result, and nothing else. Work and income are shown with documents now
 * (BA-16), so there is no income stand-in.
 */
export default async function StandInCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkId: string }>;
  searchParams: Promise<{ return?: string; key?: string }>;
}) {
  const { checkId } = await params;
  const { return: returnUrl = '/checks/done', key = null } = await searchParams;
  await requireStandInCheck(checkId, key);
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) notFound();
  const found = await standInCheck(checkId);
  // UX-TS-2, UX-PF-9: a person's own ID check, outside any letting's checks.
  const own = found ? null : await standInPersonCheck(checkId);
  if (!found && !own) notFound();
  if (found && found.check.kind !== 'identity') notFound();
  const name = found ? found.application.fullName : own!.name;
  const action = standInResultAction.bind(null, checkId, key, returnUrl);
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title="Stand-in ID check"
          lead="A real provider checks the document and a selfie. Here, you choose the result."
        />
        <form action={action}>
          <Stack gap={6}>
            <TextField name="verifiedName" label="Name on the ID" defaultValue={name} />
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
              <SubmitButton variant="secondary" name="outcome" value="gave_up">
                They gave up
              </SubmitButton>
            </Row>
          </Stack>
        </form>
      </Stack>
    </main>
  );
}
