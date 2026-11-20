import type { Metadata } from 'next';
import { requireDevTools } from '@/server/dev/gate';
import { TextArea, TextField } from '@/ui/Field';
import { FormActions, FormSection, formClass } from '@/ui/Form';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../outbox/outbox.module.css';
import { simulateInboundEmail } from './actions';

export const metadata: Metadata = { title: 'Development inbox' };
export const dynamic = 'force-dynamic';

/**
 * Development and the test copy (DEV_TOOLS=1): send an email to a Gaff address (R5). On the test
 * copy, Gaff's own team only (BA-1): it can write to any letting.
 */
export default async function DevInboundPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  await requireDevTools();
  const { result } = await searchParams;
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title="Send a test enquiry"
          lead="As if Daft or MyHome had emailed a Gaff address. Use synthetic details only."
        />
        {result ? (
          <Notice tone={result === 'stored' ? 'success' : 'warning'} role="status">
            <p>Result: {result}</p>
          </Notice>
        ) : null}
        <form action={simulateInboundEmail} className={formClass}>
          <FormSection id="email" title="Email">
            <TextField name="to" label="To (a Gaff address)" defaultValue="" />
            <TextField name="from" label="From" defaultValue="Daft.ie <noreply@daft.ie>" />
            <TextField name="replyTo" label="Reply-To" optional defaultValue="" />
            <TextField name="subject" label="Subject" defaultValue="" />
            <TextArea name="text" label="Body" rows={12} defaultValue="" />
          </FormSection>
          <FormActions>
            <SubmitButton>Send to Gaff</SubmitButton>
          </FormActions>
        </form>
      </Stack>
    </main>
  );
}
