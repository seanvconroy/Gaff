import { FileSignature } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { checklistItems, conditions } from '@/domain/tenancy/movein';
import { paymentAmounts } from '@/domain/tenancy/payment';
import { canFinish } from '@/domain/tenancy/steps';
import { rtbDeadline } from '@/domain/tenancy/tenancy';
import { env } from '@/lib/env';
import { formatDate, formatDateTime, formatEuro, irishToday } from '@/lib/format';
import { inPersonIdentity } from '@/server/identity/in-person';
import { inventoryFor } from '@/server/tenancy/movein';
import { tenancyFor } from '@/server/tenancy/tenancy';
import { Disclosure } from '@/ui/Disclosure';
import { EmptyState } from '@/ui/EmptyState';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Columns } from '@/ui/Form';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SignForm } from '@/ui/SignForm';
import { StatusPill } from '@/ui/StatusPill';
import { StepCard, type StepState } from '@/ui/StepCard';
import { SubmitButton } from '@/ui/SubmitButton';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import {
  checklistAction,
  confirmPaymentAction,
  countersignAction,
  finishAction,
  landlordForAgreementAction,
  paperAction,
  removeItemAction,
  requestPaymentAction,
  rtbRegisteredAction,
  seenIdAction,
  sendAgreementAction,
  shareInventoryAction,
} from './actions';
import { InventoryItemForm } from './InventoryItemForm';
import styles from './tenancy.module.css';

export const metadata: Metadata = { title: 'Tenancy' };
export const dynamic = 'force-dynamic';

type View = NonNullable<Awaited<ReturnType<typeof tenancyFor>>>;

const firstNameOf = (view: View) => view.tenant.fullName.split(/\s+/)[0] ?? '';
const isSigned = (view: View) =>
  ['signed', 'signed_on_paper'].includes(view.tenancy.agreementStatus);

/**
 * Stage 8 (R22 to R25): the agreement, payment, RTB registration and move-in, then finishing.
 * Numbered steps with their status in words; the step to do now stands out, and steps that can't
 * start yet say why in one line rather than showing their forms.
 */
export default async function TenancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ problem?: string; sent?: string; signed?: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const view = await tenancyFor(member, letting.id);
  const done = await searchParams;
  if (!view) {
    return (
      <Stack gap={8}>
        <LettingHeader letting={letting} tab="tenancy" />
        <EmptyState icon={FileSignature} title="No tenancy yet">
          <p>
            When your offer is accepted, the tenancy is set up here: the agreement, payment, RTB
            registration and move-in.
          </p>
        </EmptyState>
      </Stack>
    );
  }
  const items = await inventoryFor(member, letting.id);
  const id = await inPersonIdentity(member, view.tenancy.applicationId);
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="tenancy" />
      {done.problem ? (
        <Notice tone="warning" role="alert">
          <p>{done.problem}</p>
        </Notice>
      ) : null}
      <Stack gap={4}>
        <AgreementStep
          lettingId={letting.id}
          view={view}
          signerName={member.name}
          justSigned={Boolean(done.signed)}
          id={id}
        />
        <PaymentStep lettingId={letting.id} view={view} />
        <RtbStep lettingId={letting.id} view={view} />
        <MoveInStep lettingId={letting.id} view={view} items={items} />
        <FinishStep lettingId={letting.id} view={view} />
      </Stack>
    </Stack>
  );
}

function AgreementStep({
  lettingId,
  view,
  signerName,
  justSigned,
  id,
}: {
  lettingId: string;
  view: View;
  signerName: string;
  justSigned: boolean;
  /** P27: whether to see the tenant's photo ID in person first, and whether it's been seen. */
  id: Awaited<ReturnType<typeof inPersonIdentity>>;
}) {
  const { tenancy, tenant } = view;
  const first = firstNameOf(view);
  const status = tenancy.agreementStatus;
  const isAgency = view.organisation.kind === 'agency';
  const signed = isSigned(view);
  const pill = signed ? (
    <StatusPill tone="success">Signed</StatusPill>
  ) : status === 'with_tenant' ? (
    <StatusPill tone="info">With {first}</StatusPill>
  ) : status === 'tenant_signed' ? (
    <StatusPill tone="warning">Your turn to sign</StatusPill>
  ) : (
    <StatusPill>Not sent yet</StatusPill>
  );
  return (
    <StepCard
      id="agreement-heading"
      number={1}
      title="Tenancy agreement"
      state={signed ? 'done' : 'current'}
      status={pill}
    >
      <p>
        {tenant.fullName}, from {formatDate(tenancy.startDate)}.{' '}
        <Link href={`/lettings/${lettingId}/tenancy/agreement`}>Read the agreement</Link>
      </p>
      {status === 'draft' && view.needsLandlord ? (
        <form action={landlordForAgreementAction.bind(null, lettingId)}>
          <Stack gap={4}>
            <p>The agreement names the landlord. Add their details first.</p>
            <Columns>
              <TextField name="landlordName" label="Landlord’s name" autoComplete="off" />
              <TextField
                name="landlordEmail"
                label="Landlord’s email"
                type="email"
                autoComplete="off"
              />
            </Columns>
            <div>
              <SubmitButton pendingLabel="Saving…">Save the landlord’s details</SubmitButton>
            </div>
          </Stack>
        </form>
      ) : null}
      {status === 'draft' && id?.needed && !id.seen ? (
        <Notice tone="info" title="See their photo ID first">
          <Stack gap={4}>
            <p>
              {id.why === 'no_selfie'
                ? `Gaff checked ${first}’s ID without a selfie.`
                : `${first}’s ID couldn’t be checked online.`}{' '}
              Before you send the agreement, ask to see their original passport, driving licence or
              ID card when you meet, and record the name on it. Don’t keep a copy.
            </p>
            <form action={seenIdAction.bind(null, lettingId, view.tenancy.applicationId)}>
              <Stack gap={4}>
                <TextField name="seenName" label="The name on their photo ID" width="medium" />
                <div>
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    I’ve seen their photo ID
                  </SubmitButton>
                </div>
              </Stack>
            </form>
          </Stack>
        </Notice>
      ) : null}
      {status === 'draft' && id?.seen ? (
        <p>
          You saw their photo ID on {formatDate(id.seen.at)}: {id.seen.name}.
        </p>
      ) : null}
      {status === 'draft' && !view.needsLandlord ? (
        <>
          <p>
            Gaff’s standard agreement, filled in from the offer. Send it to {first} to read and sign
            on their phone. You sign after them.
          </p>
          <form action={sendAgreementAction.bind(null, lettingId)}>
            <SubmitButton pendingLabel="Sending…">Send to {first} to sign</SubmitButton>
          </form>
        </>
      ) : null}
      {status === 'with_tenant' ? (
        <p>
          Sent {tenancy.agreementSentAt ? formatDateTime(tenancy.agreementSentAt) : ''}. Waiting for
          them to sign.
        </p>
      ) : null}
      {status === 'tenant_signed' ? (
        <>
          <Notice tone="success" title={`${first} has signed`}>
            <p>
              On {tenancy.tenantSignedAt ? formatDateTime(tenancy.tenantSignedAt) : ''}. Now sign
              for the landlord{isAgency ? ', as their agent' : ''}, and you’ll both have a copy.
            </p>
          </Notice>
          <SignForm
            action={countersignAction.bind(null, lettingId)}
            nameHint={`Your own name: ${signerName}.`}
            consentLabel={`I agree to sign this agreement electronically${isAgency ? ', for the landlord' : ''}`}
            button="Sign the agreement"
          />
        </>
      ) : null}
      {signed ? (
        <Notice
          tone="success"
          title={status === 'signed' ? 'Signed by both sides' : 'Signed on paper'}
          role="status"
        >
          <p>
            {justSigned ? 'Done. ' : ''}
            {status === 'signed'
              ? `${first} has a copy too. Next: the payment request.`
              : 'Keep the signed paper copy safe. Next: the payment request.'}
          </p>
        </Notice>
      ) : null}
      {status === 'draft' || status === 'with_tenant' ? (
        <Disclosure summary="Signing on paper instead?">
          <p>
            <Link href={`/lettings/${lettingId}/tenancy/agreement`}>Print the agreement</Link>, sign
            it with {first}, then record it here.
          </p>
          <form action={paperAction.bind(null, lettingId)}>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Both sides have signed on paper
            </SubmitButton>
          </form>
        </Disclosure>
      ) : null}
    </StepCard>
  );
}

function PaymentStep({ lettingId, view }: { lettingId: string; view: View }) {
  const { tenancy } = view;
  const first = firstNameOf(view);
  const signed = isSigned(view);
  const hasAccount = Boolean(view.organisation.paymentIban);
  const amounts = paymentAmounts(tenancy);
  const today = irishToday();
  const received = Boolean(tenancy.paymentReceivedAt);
  const state: StepState = received ? 'done' : signed ? 'current' : 'todo';
  const pill = received ? (
    <StatusPill tone="success">Received</StatusPill>
  ) : tenancy.paymentRequestedAt ? (
    <StatusPill tone="info">Waiting for payment</StatusPill>
  ) : null;
  return (
    <StepCard
      id="payment-heading"
      number={2}
      title="Deposit and first month’s rent"
      state={state}
      status={pill}
    >
      <p>
        {formatEuro(amounts.depositCents)} deposit and {formatEuro(amounts.firstRentCents)} first
        month’s rent: {formatEuro(amounts.totalCents)}, paid straight into your account. Nothing
        else is ever asked of a tenant.
      </p>
      {!signed ? <p>Ask for the payment once the agreement is signed.</p> : null}
      {signed && !hasAccount ? (
        <p>
          Add the account tenants pay into, in <Link href="/settings">Settings</Link>, first.
        </p>
      ) : null}
      {signed && hasAccount && !tenancy.paymentRequestedAt ? (
        <form action={requestPaymentAction.bind(null, lettingId)}>
          <Stack gap={4}>
            <TextField
              name="dueDate"
              label="Pay by"
              type="date"
              width="short"
              min={today}
              defaultValue={tenancy.startDate > today ? tenancy.startDate : today}
            />
            <div>
              <SubmitButton pendingLabel="Sending…">Ask {first} to pay</SubmitButton>
            </div>
          </Stack>
        </form>
      ) : null}
      {tenancy.paymentRequestedAt && !received ? (
        <>
          <p>
            Asked on {formatDate(tenancy.paymentRequestedAt)}, to pay by{' '}
            {tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate) : ''}, with the reference{' '}
            {tenancy.paymentReference}.
          </p>
          <form action={confirmPaymentAction.bind(null, lettingId)}>
            <SubmitButton pendingLabel="Saving…">It’s in our account</SubmitButton>
          </form>
        </>
      ) : null}
      {tenancy.paymentReceivedAt ? (
        <p>
          On {formatDate(tenancy.paymentReceivedAt)}. {first} has a receipt.
        </p>
      ) : null}
    </StepCard>
  );
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function RtbStep({ lettingId, view }: { lettingId: string; view: View }) {
  const { tenancy } = view;
  const deadline = rtbDeadline(tenancy.startDate);
  const registered = Boolean(tenancy.rtbRegisteredAt);
  const close = !registered && deadline <= addDays(irishToday(), 7);
  const state: StepState = registered ? 'done' : isSigned(view) ? 'current' : 'todo';
  return (
    <StepCard
      id="rtb-heading"
      number={3}
      title="Rent-setting pack and RTB registration"
      state={state}
      status={
        registered ? (
          <StatusPill tone="success">Registered</StatusPill>
        ) : (
          <StatusPill tone={close ? 'warning' : 'info'}>
            Register by {formatDate(deadline)}
          </StatusPill>
        )
      }
    >
      <p className={styles.links}>
        <Link href={`/lettings/${lettingId}/tenancy/rent-pack`}>Rent-setting pack</Link>
        <Link href={`/lettings/${lettingId}/tenancy/rtb-pack`}>RTB registration pack</Link>
      </p>
      {registered ? (
        <p>
          On {formatDate(tenancy.rtbRegisteredAt!)}
          {tenancy.rtbReference ? `, number ${tenancy.rtbReference}` : ''}.
        </p>
      ) : (
        <>
          <p>
            One month from the tenancy’s start. Gaff reminds you a week before.{' '}
            {tenancy.ppsnGivenAt
              ? 'The tenant gave their PPS number; it’s in the pack.'
              : 'The tenant hasn’t given their PPS number. It’s optional.'}
          </p>
          <form action={rtbRegisteredAction.bind(null, lettingId)}>
            <Stack gap={4}>
              <TextField
                name="reference"
                label="RTB registration number"
                hint="If you have it."
                optional
                width="medium"
                autoComplete="off"
              />
              <div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  It’s registered with the RTB
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </>
      )}
    </StepCard>
  );
}

function MoveInStep({
  lettingId,
  view,
  items,
}: {
  lettingId: string;
  view: View;
  items: Awaited<ReturnType<typeof inventoryFor>>;
}) {
  const { tenancy } = view;
  const first = firstNameOf(view);
  const checklist = tenancy.moveInChecklist ?? {};
  const confirmed = tenancy.inventoryConfirmedAt !== null;
  const movedIn = tenancy.moveInCompletedAt !== null;
  const signed = isSigned(view);
  const state: StepState = movedIn && confirmed ? 'done' : signed ? 'current' : 'todo';
  return (
    <StepCard
      id="movein-heading"
      number={4}
      title="Moving in"
      state={state}
      status={movedIn ? <StatusPill tone="success">Moved in</StatusPill> : null}
    >
      {!signed ? (
        <p>The move-in checklist and the inventory open once the agreement is signed.</p>
      ) : (
        <>
          <form action={checklistAction.bind(null, lettingId)}>
            <Stack gap={4}>
              <ChoiceGroup
                name="checklist"
                legend="On the day"
                type="checkbox"
                defaultValue={checklistItems
                  .filter((c) => checklist[c.name] === 'yes')
                  .map((c) => c.name)}
                options={checklistItems.map((c) => ({ value: c.name, label: c.label }))}
              />
              <Columns>
                <TextField
                  name="electricity"
                  label="Electricity meter reading"
                  optional
                  autoComplete="off"
                  defaultValue={checklist.electricity ?? ''}
                />
                <TextField
                  name="gas"
                  label="Gas meter reading"
                  optional
                  autoComplete="off"
                  defaultValue={checklist.gas ?? ''}
                />
              </Columns>
              <div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save the checklist
                </SubmitButton>
              </div>
              {tenancy.moveInCompletedAt ? (
                <p>Keys handed over on {formatDate(tenancy.moveInCompletedAt)}.</p>
              ) : null}
            </Stack>
          </form>
          <div className={styles.inventoryBlock}>
            <h3 className="type-title">Inventory</h3>
            {items.length === 0 ? (
              <p className={styles.note}>
                Nothing recorded yet. Add each room’s main items: its condition, a short note and a
                photo if it helps.
              </p>
            ) : (
              <ul className={styles.inventory}>
                {items.map((item) => (
                  <li key={item.id} className={styles.item}>
                    {item.hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/lettings/${lettingId}/tenancy/photos/${item.id}`}
                        alt={`${item.item}, ${item.room}`}
                        className={styles.photo}
                      />
                    ) : (
                      <span className={styles.noPhoto} aria-hidden="true" />
                    )}
                    <span className={styles.itemText}>
                      <strong>
                        {item.room}: {item.item}
                      </strong>
                      <span>
                        <StatusPill tone={item.condition === 'damaged' ? 'warning' : 'neutral'}>
                          {conditions[item.condition]}
                        </StatusPill>
                        {item.note ? <span className={styles.note}> {item.note}</span> : null}
                      </span>
                    </span>
                    {!confirmed ? (
                      <form action={removeItemAction.bind(null, lettingId, item.id)}>
                        <SubmitButton variant="quiet" pendingLabel="Removing…">
                          Remove<span className="visually-hidden">: {item.item}</span>
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!confirmed ? (
              <Disclosure summary="Add an item" open={items.length === 0}>
                <InventoryItemForm lettingId={lettingId} />
              </Disclosure>
            ) : null}
            {confirmed ? (
              <p>
                <StatusPill tone="success">Confirmed</StatusPill> {first} confirmed it’s a fair
                record on {formatDate(tenancy.inventoryConfirmedAt!)}.
              </p>
            ) : tenancy.inventorySharedAt ? (
              <p>
                <StatusPill tone="info">With {first}</StatusPill> Shared on{' '}
                {formatDate(tenancy.inventorySharedAt)}. Waiting for them to confirm it.
              </p>
            ) : items.length > 0 ? (
              <form action={shareInventoryAction.bind(null, lettingId)}>
                <SubmitButton variant="secondary" pendingLabel="Sharing…">
                  Share the inventory with {first}
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </>
      )}
    </StepCard>
  );
}

function FinishStep({ lettingId, view }: { lettingId: string; view: View }) {
  const { tenancy } = view;
  if (tenancy.closedAt) {
    return (
      <StepCard
        id="finish-heading"
        number={5}
        title="Finish"
        state="done"
        status={<StatusPill tone="success">Done</StatusPill>}
      >
        <Notice tone="success" title="Finished" role="status">
          <p>
            Closed on {formatDate(tenancy.closedAt)}. The record of this letting stays, with no
            personal details in it. The tenant’s details in Gaff are deleted{' '}
            {env().RETENTION_PERSONAL_DAYS} days after closing.
          </p>
        </Notice>
      </StepCard>
    );
  }
  const ready = canFinish(tenancy);
  return (
    <StepCard id="finish-heading" number={5} title="Finish" state={ready ? 'current' : 'todo'}>
      <p>
        When the agreement is signed and the money is in, close the letting. Save the signed
        agreement, the packs and the inventory first: Gaff deletes the tenant’s details{' '}
        {env().RETENTION_PERSONAL_DAYS} days after you close.
      </p>
      {ready && !tenancy.rtbRegisteredAt ? (
        <Notice tone="warning" title="Not registered with the RTB yet">
          <p>Register first if you can: the RTB pack goes when the tenant’s details do.</p>
        </Notice>
      ) : null}
      {ready ? (
        <form action={finishAction.bind(null, lettingId)}>
          <SubmitButton variant="secondary" pendingLabel="Closing…">
            Finish and close the letting
          </SubmitButton>
        </form>
      ) : (
        <p>You can finish once the agreement is signed and the payment is in.</p>
      )}
    </StepCard>
  );
}
