import type { Metadata } from 'next';
import { earningLabels, formatRatio } from '@/domain/applications/apply';
import { formatDateTime, formatEuro } from '@/lib/format';
import { applicantsFor } from '@/server/applications/choose';
import { approvalFor } from '@/server/offers/approval';
import { offersFor } from '@/server/offers/offer';
import { whoCanBeOffered } from '@/domain/offers/offer';
import { formatDate, irishToday } from '@/lib/format';
import { OfferForm } from './OfferForm';
import { TextField } from '@/ui/Field';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import { askLandlordAction, chooseAction, saveLandlordAction } from './actions';
import { CheckList } from './CheckList';
import styles from './applications.module.css';

export const metadata: Metadata = { title: 'Applications' };
export const dynamic = 'force-dynamic';

const chosenLabels: Record<string, string> = {
  preferred: 'Preferred',
  backup: 'Backup',
  offered: 'Offered',
  accepted: 'Accepted',
  declined: 'Declined',
};

/** R17: everyone who applied, side by side. A person chooses; Gaff never does. */
export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{
    chosen?: string;
    problem?: string;
    asked?: string;
    landlord?: string;
    offered?: string;
  }>;
}) {
  const { member, letting } = await loadLetting(params);
  const [listing, approval, sent] = await Promise.all([
    applicantsFor(member, letting.id),
    approvalFor(member, letting.id),
    offersFor(member, letting.id),
  ]);
  const done = await searchParams;
  const rows = listing?.rows ?? [];
  const anyChosen = rows.some((r) => r.status === 'preferred' || r.status === 'backup');
  const editable = listing !== null && !listing.offerMade && letting.status === 'live';
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="applications" />
      {done.chosen ? (
        <Notice tone="success" title="Choice saved" role="status">
          <p>You can change it until you make an offer.</p>
        </Notice>
      ) : null}
      {done.problem ? (
        <Notice tone="warning" role="alert">
          <p>{done.problem}</p>
        </Notice>
      ) : null}
      <Notice tone="info" title="How to choose">
        <p>
          Everyone here came to a viewing and applied. They’re in the same order as your shortlist.
          Gaff never chooses: you do. Pick a preferred applicant and, if you like, a backup.
        </p>
      </Notice>
      {rows.length === 0 ? (
        <Card>
          <h2 className="type-title">Nobody has applied yet</h2>
          <p>People you mark as having come to a viewing are invited to apply when it ends.</p>
        </Card>
      ) : (
        <form action={chooseAction.bind(null, letting.id)}>
          <Stack gap={6}>
            <ul className={styles.cards}>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={`${styles.card} ${chosenLabels[row.status] ? styles.chosen : ''}`}
                >
                  <Stack gap={1}>
                    <h2 className="type-title">{row.name}</h2>
                    <p className={styles.muted}>Number {row.position} on the shortlist</p>
                  </Stack>
                  {chosenLabels[row.status] ? (
                    <div>
                      <StatusPill tone="success">{chosenLabels[row.status]}</StatusPill>
                    </div>
                  ) : null}
                  <dl className={styles.facts}>
                    <div className={styles.fact}>
                      <dt>Criteria</dt>
                      <dd>
                        {row.total === 0
                          ? 'No criteria set'
                          : row.answered
                            ? `Meets ${row.met} of ${row.total}`
                            : 'Didn’t answer the questions'}
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>Take-home income</dt>
                      <dd>
                        {formatEuro(row.monthlyIncomeCents)} a month, {formatRatio(row.ratioTenths)}{' '}
                        times the rent
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>Earns</dt>
                      <dd>{row.earning ? earningLabels[row.earning] : 'Not given'}</dd>
                    </div>
                    {row.appliedAt ? (
                      <div className={styles.fact}>
                        <dt>Applied</dt>
                        <dd>{formatDateTime(row.appliedAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div>
                    <StatusPill tone={row.meetsRule ? 'success' : 'warning'}>
                      {row.meetsRule ? 'Meets your income rule' : 'Below your income rule'}
                    </StatusPill>
                  </div>
                  {row.checks.length > 0 ? (
                    <CheckList
                      checks={row.checks}
                      rentCents={listing!.rentCents}
                      ruleTenths={listing!.incomeRuleTenths}
                    />
                  ) : null}
                  {editable ? (
                    <div className={styles.picks}>
                      <label className={styles.pick}>
                        <input
                          type="radio"
                          name="preferredId"
                          value={row.id}
                          defaultChecked={row.status === 'preferred'}
                        />
                        Preferred<span className="visually-hidden">: {row.name}</span>
                      </label>
                      <label className={styles.pick}>
                        <input
                          type="radio"
                          name="backupId"
                          value={row.id}
                          defaultChecked={row.status === 'backup'}
                        />
                        Backup<span className="visually-hidden">: {row.name}</span>
                      </label>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {editable ? (
              <Stack gap={4}>
                <div>
                  <label className={styles.pick}>
                    <input
                      type="radio"
                      name="backupId"
                      value=""
                      defaultChecked={!rows.some((r) => r.status === 'backup')}
                    />
                    No backup for now
                  </label>
                </div>
                <p className={styles.muted}>
                  Next, Gaff asks the people you choose for an ID check, an income check and
                  references, and tells them what each one is for.
                </p>
                <div>
                  <SubmitButton
                    variant={anyChosen ? 'secondary' : 'primary'}
                    pendingLabel="Saving…"
                  >
                    {anyChosen ? 'Save my choice' : 'Confirm my choice'}
                  </SubmitButton>
                </div>
              </Stack>
            ) : null}
          </Stack>
        </form>
      )}
      {approval?.preferredId ? (
        <LandlordApproval
          lettingId={letting.id}
          state={approval}
          names={new Map(rows.map((r) => [r.id, r.name]))}
          asked={Boolean(done.asked)}
        />
      ) : null}
      {approval?.preferredId || sent.length > 0 ? (
        <Card labelledBy="offer-heading">
          <Stack gap={4}>
            <h2 id="offer-heading" className="type-title">
              The offer
            </h2>
            {done.offered ? (
              <Notice tone="success" role="status">
                <p>Offer sent. We’ll email them, and show their answer here.</p>
              </Notice>
            ) : null}
            {sent.length > 0 ? (
              <ul className={styles.checkList}>
                {sent.map(({ offer, name }) => (
                  <li key={offer.id}>
                    <StatusPill tone={offerTone[offer.status]}>
                      {offerWords[offer.status]}
                    </StatusPill>{' '}
                    {offer.role === 'backup' ? 'To the backup, ' : ''}
                    {name}, {formatEuro(offer.rentCents)} a month from {formatDate(offer.startDate)}
                    {offer.status === 'open'
                      ? `. They have until ${formatDateTime(offer.expiresAt)} to answer.`
                      : '.'}
                  </li>
                ))}
              </ul>
            ) : null}
            {sent.some((s) => s.offer.status === 'accepted') ? (
              <p>
                The home is let, and everyone else has been told. Next come the tenancy agreement,
                the deposit and first month’s rent, and the RTB registration. Gaff will do these in
                a later update; for now, do them the way you do today.
              </p>
            ) : null}
            {sent.some((s) => s.offer.status === 'open' && s.offer.thenOfferToId) ? (
              <p>
                If it isn’t accepted in time, it goes to your backup automatically, as you approved.
              </p>
            ) : null}
            {approval?.preferredId &&
            !sent.some((s) => s.offer.status === 'open' || s.offer.status === 'accepted') &&
            rows.some((r) => r.id === approval.preferredId && r.status === 'preferred') ? (
              <OfferStep
                lettingId={letting.id}
                state={approval}
                names={new Map(rows.map((r) => [r.id, r.name]))}
                rentCents={letting.monthlyRentCents}
                availableFrom={letting.availableFrom}
              />
            ) : null}
          </Stack>
        </Card>
      ) : null}
      {listing && listing.waitingToApply.length > 0 ? (
        <p className={styles.muted}>
          Came to view but haven’t applied yet: {listing.waitingToApply.join(', ')}.
        </p>
      ) : null}
    </Stack>
  );
}

function LandlordApproval({
  lettingId,
  state,
  names,
  asked,
}: {
  lettingId: string;
  state: NonNullable<Awaited<ReturnType<typeof approvalFor>>>;
  names: Map<string, string>;
  asked: boolean;
}) {
  const answer = (id: string | null, value: string | null) =>
    id && value ? `${value === 'approved' ? 'Approved' : 'Declined'} ${names.get(id)}` : null;
  return (
    <Card labelledBy="landlord-heading">
      <Stack gap={4}>
        <h2 id="landlord-heading" className="type-title">
          The landlord’s approval
        </h2>
        {state.route === 'own_home' ? (
          <p>You’re letting your own home, so making the offer is your approval.</p>
        ) : null}
        {state.route === 'operator_confirms' ? (
          <>
            <p>
              There’s no email for the landlord on this letting. Add it, and Gaff sends them a
              one-page summary of who you chose to approve, with no account. Or, when you make the
              offer, confirm they’ve approved.
            </p>
            <form action={saveLandlordAction.bind(null, lettingId)}>
              <Stack gap={4}>
                <TextField name="landlordName" label="Landlord’s name" autoComplete="off" />
                <TextField
                  name="landlordEmail"
                  label="Landlord’s email"
                  type="email"
                  autoComplete="off"
                />
                <div>
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Save the landlord’s details
                  </SubmitButton>
                </div>
              </Stack>
            </form>
          </>
        ) : null}
        {state.route === 'link' && state.landlord ? (
          state.approval?.status === 'answered' ? (
            <Stack gap={2}>
              <p>{state.landlord.name} answered:</p>
              <div>
                <StatusPill
                  tone={state.approval.preferredAnswer === 'approved' ? 'success' : 'warning'}
                >
                  {answer(state.approval.preferredId, state.approval.preferredAnswer)}
                </StatusPill>
              </div>
              {state.approval.backupId ? (
                <div>
                  <StatusPill
                    tone={state.approval.backupAnswer === 'approved' ? 'success' : 'warning'}
                  >
                    {`${answer(state.approval.backupId, state.approval.backupAnswer)} as backup`}
                  </StatusPill>
                </div>
              ) : null}
            </Stack>
          ) : state.approval?.status === 'requested' ? (
            <p>
              {asked ? 'Sent. ' : ''}
              {state.landlord.name} has a private link to a one-page summary. Waiting for their
              answer.
            </p>
          ) : (
            <form action={askLandlordAction.bind(null, lettingId)}>
              <Stack gap={4}>
                <p>
                  {state.landlord.name} gets a private link to a one-page summary of who you chose,
                  with their check results, to approve or decline. No account needed.
                </p>
                <div>
                  <SubmitButton variant="secondary" pendingLabel="Sending…">
                    Ask the landlord to approve
                  </SubmitButton>
                </div>
              </Stack>
            </form>
          )
        ) : null}
      </Stack>
    </Card>
  );
}

const offerWords: Record<string, string> = {
  open: 'Waiting',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Not answered',
};
const offerTone: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  open: 'info',
  accepted: 'success',
  declined: 'neutral',
  expired: 'warning',
};

function OfferStep({
  lettingId,
  state,
  names,
  rentCents,
  availableFrom,
}: {
  lettingId: string;
  state: NonNullable<Awaited<ReturnType<typeof approvalFor>>>;
  names: Map<string, string>;
  rentCents: number;
  availableFrom: string;
}) {
  const who = whoCanBeOffered({
    route: state.route,
    approval: state.approval,
    landlordConfirmed: true,
    hasBackup: state.backupId !== null,
  });
  if (!who.preferred) {
    return <p>{who.problem}</p>;
  }
  const today = irishToday();
  return (
    <OfferForm
      lettingId={lettingId}
      preferredName={names.get(state.preferredId!) ?? ''}
      backupName={who.backup && state.backupId ? (names.get(state.backupId) ?? null) : null}
      rent={formatEuro(rentCents)}
      defaults={{
        deposit: String(rentCents / 100),
        startDate: availableFrom > today ? availableFrom : today,
      }}
      today={today}
      askLandlordConfirmation={state.route === 'operator_confirms'}
    />
  );
}
