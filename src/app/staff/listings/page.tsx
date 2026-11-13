import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { holdReasonWords, removalReasonWords } from '@/copy/listings';
import { groundLabels, type ProtectedGround } from '@/domain/compliance/protected-grounds';
import { formatDateTime, formatRent } from '@/lib/format';
import { requireStaff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { heldListings, resolveHold } from '@/server/listings/holds';
import { SelectField } from '@/ui/Field';
import { Card, PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

export const metadata: Metadata = { title: 'Listings to check' };

async function decideAction(holdId: string, formData: FormData) {
  'use server';
  const staff = await requireStaff();
  const decision = String(formData.get('decision') ?? '');
  const reason = String(formData.get('reason') ?? 'other') as keyof typeof removalReasonWords;
  try {
    await resolveHold(
      staff,
      holdId,
      decision === 'release'
        ? { outcome: 'released' }
        : { outcome: 'removed', reason: reason in removalReasonWords ? reason : 'other' },
    );
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
  }
  revalidatePath('/staff/listings');
  redirect('/staff/listings?saved=1');
}

/** M29, M97, M98: listings held before going live. A person decides; removal sends reasons. */
export default async function StaffListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const staff = await requireStaff();
  const held = await heldListings(staff);
  return (
    <Stack gap={8}>
      <PageHeader
        title="Listings to check"
        lead="Targets: suspected scams within 4 working hours, everything else within 1 working day."
      />
      {saved ? (
        <Notice tone="success" role="status">
          <p>Decided. If you removed a listing, the letter has been sent the reasons.</p>
        </Notice>
      ) : null}
      {held.length === 0 ? <p>Nothing waiting.</p> : null}
      {held.map((item) => (
        <Card key={item.holdId} labelledBy={`hold-${item.holdId}`}>
          <Stack gap={4}>
            <h2 id={`hold-${item.holdId}`} className="type-title">
              {item.title}
            </h2>
            <p>
              {item.organisationName} · {formatRent(item.rentCents)} · held{' '}
              {formatDateTime(item.openedAt)}
            </p>
            <ul>
              {item.reasons.map((r) => (
                <li key={r}>{holdReasonWords[r] ?? r}</li>
              ))}
            </ul>
            {item.wordingFindings.length > 0 ? (
              <div>
                <p>The AI’s wording check flagged:</p>
                <ul>
                  {item.wordingFindings.map((f) => (
                    <li key={f.phrase}>
                      “{f.phrase}” ({groundLabels[f.ground as ProtectedGround] ?? f.ground}):{' '}
                      {f.why} Suggested: “{f.rewording}”
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <blockquote>{item.description}</blockquote>
            <form action={decideAction.bind(null, item.holdId)}>
              <Row>
                <SubmitButton
                  variant="secondary"
                  name="decision"
                  value="release"
                  pendingLabel="Saving…"
                >
                  Let it go live
                </SubmitButton>
                <SelectField
                  name="reason"
                  label="Reason for removing"
                  options={Object.entries(removalReasonWords).map(([value, label]) => ({
                    value,
                    label: `Because ${label}`,
                  }))}
                />
                <SubmitButton
                  variant="quiet"
                  name="decision"
                  value="remove"
                  pendingLabel="Removing…"
                >
                  Remove it
                </SubmitButton>
              </Row>
            </form>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
