import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { standInCheck } from '@/server/checks/checks';
import { TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../outbox/outbox.module.css';
import { standInResultAction } from './actions';

export const metadata: Metadata = { title: 'Stand-in income check' };
export const dynamic = 'force-dynamic';

/**
 * Development and staging only (DEV_TOOLS=1): stands in for the income check until work and
 * income documents replace it (P30). Identity has its own stand-in, at /dev/identity.
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
  if (!found || found.check.kind !== 'income') notFound();
  const action = standInResultAction.bind(null, checkId, returnUrl);
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title="Stand-in income check"
          lead="A real provider connects the bank read-only and finds regular income. Here, you choose the result."
        />
        <form action={action}>
          <Stack gap={6}>
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
            <Row>
              <SubmitButton name="outcome" value="pass">
                Confirm this income
              </SubmitButton>
              <SubmitButton variant="secondary" name="outcome" value="no_regular_income">
                No regular income found
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
