import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { standInCheck } from '@/server/checks/checks';
import { TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../outbox/outbox.module.css';
import { standInResultAction } from './actions';

export const metadata: Metadata = { title: 'Stand-in check' };
export const dynamic = 'force-dynamic';

/**
 * Development and staging only (DEV_TOOLS=1): stands in for the ID and open-banking providers
 * until the founders approve real ones (rule 10). A real provider would take the renter
 * through a document-and-selfie check, or connect their bank read-only.
 */
export default async function StandInCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkId: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  if (!env().DEV_TOOLS) notFound();
  const { checkId } = await params;
  const { return: returnUrl = '/checks/done' } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) notFound();
  const found = await standInCheck(checkId);
  if (!found || (found.check.kind !== 'identity' && found.check.kind !== 'income')) notFound();
  const kind = found.check.kind;
  const action = standInResultAction.bind(null, checkId, kind, returnUrl);
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title={kind === 'identity' ? 'Stand-in ID check' : 'Stand-in income check'}
          lead={
            kind === 'identity'
              ? 'A real provider checks the document and a selfie. Here, you choose the result.'
              : 'A real provider connects the bank read-only and finds regular income. Here, you choose the result.'
          }
        />
        <form action={action}>
          <Stack gap={6}>
            {kind === 'identity' ? (
              <TextField
                name="verifiedName"
                label="Name on the ID"
                defaultValue={found.application.fullName}
              />
            ) : (
              <TextField
                name="monthlyIncome"
                label="Take-home income the bank shows each month"
                prefix="€"
                defaultValue={
                  found.application.monthlyIncomeCents === null
                    ? ''
                    : String(found.application.monthlyIncomeCents / 100)
                }
              />
            )}
            <Row>
              <SubmitButton name="outcome" value="pass">
                {kind === 'identity' ? 'The ID and selfie match' : 'Confirm this income'}
              </SubmitButton>
              {kind === 'identity' ? (
                <>
                  <SubmitButton variant="secondary" name="outcome" value="face_mismatch">
                    The selfie doesn’t match
                  </SubmitButton>
                  <SubmitButton variant="secondary" name="outcome" value="document">
                    The document isn’t genuine
                  </SubmitButton>
                </>
              ) : (
                <SubmitButton variant="secondary" name="outcome" value="no_regular_income">
                  No regular income found
                </SubmitButton>
              )}
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
