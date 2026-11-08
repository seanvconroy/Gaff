import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/auth/staff';
import { listTesters, testersAllowed } from '@/server/staff/testers';
import { SelectField, TextField } from '@/ui/Field';
import { FormActions } from '@/ui/Form';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { Table } from '@/ui/Table';
import { addTesterAction, removeTesterAction } from './actions';

export const metadata: Metadata = { title: 'Testers' };

const results: Record<string, { tone: 'success' | 'warning'; text: string }> = {
  added: {
    tone: 'success',
    text: 'Done. They’re a tester now: they’ll see Staff when they sign in.',
  },
  removed: { tone: 'success', text: 'Done. They’re no longer a tester.' },
  no_account: {
    tone: 'warning',
    text: 'There’s no account with that email yet. Ask them to sign in to Gaff once, then add them here.',
  },
  invalid: { tone: 'warning', text: 'Enter their email address, like name@example.com.' },
  not_allowed: { tone: 'warning', text: 'Only an admin can change testers, and not their own.' },
};

/**
 * The test copy only: who the testers are. Testers are Gaff staff, so they can open the outbox,
 * the test inbox, and the check and review queues. Production adds staff with `pnpm staff:add`.
 */
export default async function TestersPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  if (!testersAllowed()) notFound();
  const staff = await requireStaff();
  const { result } = await searchParams;
  const testers = await listTesters(staff);
  const notice = result ? results[result] : undefined;

  return (
    <Stack gap={8}>
      <PageHeader
        title="Testers"
        lead="Testers can open the outbox and the test inbox, and work the check and report queues. This page is only on the test copy."
      />
      {notice ? (
        <Notice tone={notice.tone} role="status">
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      {staff.role === 'admin' ? (
        <>
          <Table caption="Testers" head={['Name', 'Email', 'Role', '']}>
            {testers.map((tester) => (
              <tr key={tester.userId}>
                <td>{tester.name || '—'}</td>
                <td>{tester.email}</td>
                <td>{tester.role === 'admin' ? 'Admin' : 'Reviewer'}</td>
                <td>
                  {tester.userId === staff.userId ? (
                    'You'
                  ) : (
                    <form action={removeTesterAction.bind(null, tester.userId)}>
                      <SubmitButton variant="quiet" pendingLabel="Removing…">
                        Remove
                      </SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Card>
            <form action={addTesterAction}>
              <Stack gap={4}>
                <h2 className="type-title">Add a tester</h2>
                <p>They sign in to Gaff once first, with the email they’ll test with.</p>
                <TextField name="email" label="Their email" type="email" autoComplete="off" />
                <SelectField
                  name="role"
                  label="Role"
                  defaultValue="admin"
                  options={[
                    { value: 'admin', label: 'Admin: can also add testers' },
                    { value: 'reviewer', label: 'Reviewer' },
                  ]}
                />
                <FormActions>
                  <SubmitButton pendingLabel="Adding…">Add tester</SubmitButton>
                </FormActions>
              </Stack>
            </form>
          </Card>
        </>
      ) : (
        <p>Ask an admin to add or remove testers.</p>
      )}
    </Stack>
  );
}
