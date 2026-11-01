import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate, formatDateTime } from '@/lib/format';
import { tenancyFor } from '@/server/tenancy/tenancy';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import {
  countersignAction,
  landlordForAgreementAction,
  confirmPaymentAction,
  paperAction,
  requestPaymentAction,
  checklistAction,
  finishAction,
  removeItemAction,
  rtbRegisteredAction,
  sendAgreementAction,
  shareInventoryAction,
} from './actions';
import { InventoryItemForm } from './InventoryItemForm';
import { checklistItems, conditions } from '@/domain/tenancy/movein';
import { inventoryFor } from '@/server/tenancy/movein';
import { ChoiceGroup } from '@/ui/Field';
import styles from './tenancy.module.css';
import { rtbDeadline } from '@/domain/tenancy/tenancy';
import { canFinish } from '@/domain/tenancy/steps';
import { env } from '@/lib/env';
import { paymentAmounts } from '@/domain/tenancy/payment';
import { formatEuro, irishToday } from '@/lib/format';
import { TextField } from '@/ui/Field';
import { SignForm } from '@/ui/SignForm';

export const metadata: Metadata = { title: 'Tenancy' };
export const dynamic = 'force-dynamic';

/** Stage 8 (R22 to R25): the agreement, payment, RTB registration and move-in, in order. */
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
        <Card>
          <h2 className="type-title">No tenancy yet</h2>
          <p>
            When your offer is accepted, the tenancy is set up here: the agreement, payment, RTB
            registration and move-in.
          </p>
        </Card>
      </Stack>
    );
  }
  const { tenancy, tenant } = view;
  const first = tenant.fullName.split(/\s+/)[0];
  const status = tenancy.agreementStatus;
  const isAgency = view.organisation.kind === 'agency';
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="tenancy" />
      {done.problem ? (
        <Notice tone="warning" role="alert">
          <p>{done.problem}</p>
        </Notice>
      ) : null}
      <Card labelledBy="agreement-heading">
        <Stack gap={4}>
          <h2 id="agreement-heading" className="type-title">
            Tenancy agreement
          </h2>
          <p>
            {tenant.fullName}, from {formatDate(tenancy.startDate)}.{' '}
            <Link href={`/lettings/${letting.id}/tenancy/agreement`}>Read the agreement</Link>
          </p>
          {status === 'draft' && view.needsLandlord ? (
            <form action={landlordForAgreementAction.bind(null, letting.id)}>
              <Stack gap={4}>
                <p>The agreement names the landlord. Add their details first.</p>
                <TextField name="landlordName" label="Landlord’s name" autoComplete="off" />
                <TextField
                  name="landlordEmail"
                  label="Landlord’s email"
                  type="email"
                  autoComplete="off"
                />
                <div>
                  <SubmitButton pendingLabel="Saving…">Save the landlord’s details</SubmitButton>
                </div>
              </Stack>
            </form>
          ) : null}
          {status === 'draft' && !view.needsLandlord ? (
            <>
              <p>
                Gaff’s standard agreement, filled in from the offer. Send it to {first} to read and
                sign on their phone. You sign after them.
              </p>
              <form action={sendAgreementAction.bind(null, letting.id)}>
                <SubmitButton pendingLabel="Sending…">Send to {first} to sign</SubmitButton>
              </form>
            </>
          ) : null}
          {status === 'with_tenant' ? (
            <p>
              <StatusPill tone="info">With {first}</StatusPill> Sent{' '}
              {tenancy.agreementSentAt ? formatDateTime(tenancy.agreementSentAt) : ''}. Waiting for
              them to sign.
            </p>
          ) : null}
          {status === 'tenant_signed' ? (
            <>
              <Notice tone="success" title={`${first} has signed`}>
                <p>
                  On {tenancy.tenantSignedAt ? formatDateTime(tenancy.tenantSignedAt) : ''}. Now
                  sign for the landlord{isAgency ? ', as their agent' : ''}, and you’ll both have a
                  copy.
                </p>
              </Notice>
              <SignForm
                action={countersignAction.bind(null, letting.id)}
                nameHint={`Your own name: ${member.name}.`}
                consentLabel={`I agree to sign this agreement electronically${isAgency ? ', for the landlord' : ''}`}
                button="Sign the agreement"
              />
            </>
          ) : null}
          {status === 'signed' || status === 'signed_on_paper' ? (
            <Notice
              tone="success"
              title={status === 'signed' ? 'Signed by both sides' : 'Signed on paper'}
              role="status"
            >
              <p>
                {done.signed ? 'Done. ' : ''}
                {status === 'signed'
                  ? `${first} has a copy too. Next: the payment request.`
                  : 'Keep the signed paper copy safe. Next: the payment request.'}
              </p>
            </Notice>
          ) : null}
          {status === 'draft' || status === 'with_tenant' ? (
            <details>
              <summary>Signing on paper instead?</summary>
              <Stack gap={4}>
                <p>
                  <Link href={`/lettings/${letting.id}/tenancy/agreement`}>
                    Print the agreement
                  </Link>
                  , sign it with {first}, then record it here.
                </p>
                <form action={paperAction.bind(null, letting.id)}>
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Both sides have signed on paper
                  </SubmitButton>
                </form>
              </Stack>
            </details>
          ) : null}
        </Stack>
      </Card>
      <PaymentCard
        lettingId={letting.id}
        view={view}
        hasAccount={Boolean(view.organisation.paymentIban)}
      />
      <RtbCard lettingId={letting.id} view={view} />
      <MoveInCard
        lettingId={letting.id}
        view={view}
        items={await inventoryFor(member, letting.id)}
      />
      <FinishCard lettingId={letting.id} view={view} />
    </Stack>
  );
}

function PaymentCard({
  lettingId,
  view,
  hasAccount,
}: {
  lettingId: string;
  view: NonNullable<Awaited<ReturnType<typeof tenancyFor>>>;
  hasAccount: boolean;
}) {
  const { tenancy, tenant } = view;
  const first = tenant.fullName.split(/\s+/)[0];
  const signed = ['signed', 'signed_on_paper'].includes(tenancy.agreementStatus);
  const amounts = paymentAmounts(tenancy);
  const today = irishToday();
  return (
    <Card labelledBy="payment-heading">
      <Stack gap={4}>
        <h2 id="payment-heading" className="type-title">
          Deposit and first month’s rent
        </h2>
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
                min={today}
                defaultValue={tenancy.startDate > today ? tenancy.startDate : today}
              />
              <div>
                <SubmitButton pendingLabel="Sending…">Ask {first} to pay</SubmitButton>
              </div>
            </Stack>
          </form>
        ) : null}
        {tenancy.paymentRequestedAt && !tenancy.paymentReceivedAt ? (
          <>
            <p>
              <StatusPill tone="info">Waiting</StatusPill> Asked on{' '}
              {formatDate(tenancy.paymentRequestedAt)}, to pay by{' '}
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
            <StatusPill tone="success">Received</StatusPill> On{' '}
            {formatDate(tenancy.paymentReceivedAt)}. {first} has a receipt.
          </p>
        ) : null}
      </Stack>
    </Card>
  );
}

function RtbCard({
  lettingId,
  view,
}: {
  lettingId: string;
  view: NonNullable<Awaited<ReturnType<typeof tenancyFor>>>;
}) {
  const { tenancy } = view;
  const deadline = rtbDeadline(tenancy.startDate);
  const close = !tenancy.rtbRegisteredAt && deadline <= addDays(irishToday(), 7);
  return (
    <Card labelledBy="rtb-heading">
      <Stack gap={4}>
        <h2 id="rtb-heading" className="type-title">
          Rent-setting pack and RTB registration
        </h2>
        <p>
          <Link href={`/lettings/${lettingId}/tenancy/rent-pack`}>Rent-setting pack</Link>
          {' · '}
          <Link href={`/lettings/${lettingId}/tenancy/rtb-pack`}>RTB registration pack</Link>
        </p>
        {tenancy.rtbRegisteredAt ? (
          <p>
            <StatusPill tone="success">Registered</StatusPill> On{' '}
            {formatDate(tenancy.rtbRegisteredAt)}
            {tenancy.rtbReference ? `, number ${tenancy.rtbReference}` : ''}.
          </p>
        ) : (
          <>
            <p>
              <StatusPill tone={close ? 'warning' : 'info'}>
                Register by {formatDate(deadline)}
              </StatusPill>{' '}
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
                  hint="If you have it. Optional."
                  optional
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
      </Stack>
    </Card>
  );
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function MoveInCard({
  lettingId,
  view,
  items,
}: {
  lettingId: string;
  view: NonNullable<Awaited<ReturnType<typeof tenancyFor>>>;
  items: Awaited<ReturnType<typeof inventoryFor>>;
}) {
  const { tenancy, tenant } = view;
  const first = tenant.fullName.split(/\s+/)[0];
  const checklist = tenancy.moveInChecklist ?? {};
  const confirmed = tenancy.inventoryConfirmedAt !== null;
  return (
    <Card labelledBy="movein-heading">
      <Stack gap={6}>
        <h2 id="movein-heading" className="type-title">
          Moving in
        </h2>
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
            <div>
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                Save the checklist
              </SubmitButton>
            </div>
            {tenancy.moveInCompletedAt ? (
              <p>
                <StatusPill tone="success">Moved in</StatusPill> Keys handed over on{' '}
                {formatDate(tenancy.moveInCompletedAt)}.
              </p>
            ) : null}
          </Stack>
        </form>
        <Stack gap={4}>
          <h3 className="type-title">Inventory</h3>
          {items.length === 0 ? (
            <p>Nothing recorded yet. Add each room’s main items below.</p>
          ) : null}
          {items.length > 0 ? (
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
                  ) : null}
                  <span>
                    <strong>
                      {item.room}: {item.item}
                    </strong>{' '}
                    <StatusPill tone={item.condition === 'damaged' ? 'warning' : 'neutral'}>
                      {conditions[item.condition]}
                    </StatusPill>
                    {item.note ? <span className={styles.note}> {item.note}</span> : null}
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
          ) : null}
          {!confirmed ? <InventoryItemForm lettingId={lettingId} /> : null}
          {confirmed ? (
            <p>
              <StatusPill tone="success">Confirmed</StatusPill> {first} confirmed it’s a fair record
              on {formatDate(tenancy.inventoryConfirmedAt!)}.
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
        </Stack>
      </Stack>
    </Card>
  );
}

function FinishCard({
  lettingId,
  view,
}: {
  lettingId: string;
  view: NonNullable<Awaited<ReturnType<typeof tenancyFor>>>;
}) {
  const { tenancy } = view;
  if (tenancy.closedAt) {
    return (
      <Notice tone="success" title="Finished" role="status">
        <p>
          Closed on {formatDate(tenancy.closedAt)}. The record of this letting stays, with no
          personal details in it. The tenant’s details in Gaff are deleted{' '}
          {env().RETENTION_PERSONAL_DAYS} days after closing.
        </p>
      </Notice>
    );
  }
  return (
    <Card labelledBy="finish-heading">
      <Stack gap={4}>
        <h2 id="finish-heading" className="type-title">
          Finish
        </h2>
        <p>
          When the agreement is signed and the money is in, close the letting. Save the signed
          agreement, the packs and the inventory first: Gaff deletes the tenant’s details{' '}
          {env().RETENTION_PERSONAL_DAYS} days after you close.
        </p>
        {!tenancy.rtbRegisteredAt ? (
          <Notice tone="warning" title="Not registered with the RTB yet">
            <p>Register first if you can: the RTB pack goes when the tenant’s details do.</p>
          </Notice>
        ) : null}
        {canFinish(tenancy) ? (
          <form action={finishAction.bind(null, lettingId)}>
            <SubmitButton variant="secondary" pendingLabel="Closing…">
              Finish and close the letting
            </SubmitButton>
          </form>
        ) : (
          <p>You can finish once the agreement is signed and the payment is in.</p>
        )}
      </Stack>
    </Card>
  );
}
