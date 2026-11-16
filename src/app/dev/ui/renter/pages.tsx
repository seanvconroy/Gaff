import type { ReactNode } from 'react';
import { applyCopy } from '@/copy/renter';
import type { CheckStatus } from '@/domain/checks/checks';
import { checkList, nextCheck, refereesToAsk } from '@/domain/checks/renter-checks';
import { listerFrom } from '@/domain/frame/frame';
import type { RenterView } from '@/domain/renter/path';
import { tenantSteps, tenantTask, type TenantProgress } from '@/domain/tenancy/tenant-steps';
import { chosenTime, viewingDays } from '@/domain/viewings/choosing';
import type { RenterModel } from '@/server/renter/model';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { ApplyFlow } from '../../../r/[token]/ApplyFlow';
import { CancelViewing, ChooseTime, ConfirmTime } from '../../../r/[token]/Booking';
import { DeclineOffer } from '../../../r/[token]/Decline';
import { InventoryPage, type InventoryItem } from '../../../r/[token]/Inventory';
import { LinkEnded } from '../../../r/[token]/load';
import { PayPage, type PayDetails } from '../../../r/[token]/Pay';
import { RenterHub, type HubOptions } from '../../../r/[token]/RenterHub';
import { RenterFailed, RenterLoading } from '../../../r/[token]/States';

/**
 * Every page a renter or a tenant can see (UX-RN-1 to UX-RN-26), drawn from made-up details, for
 * `/dev/ui/renter`. The pages are the real ones; only what they're given is invented. Nothing
 * here touches the database, and the buttons lead nowhere: the link below is nobody's.
 */
export const TOKEN = 'made-up-link-made-up-link-made-up-link-0000';

// Monday 16 November 2026, 10am in Ireland: every date on these pages is written from here.
const now = new Date('2026-11-16T10:00:00Z');
const at = (iso: string) => new Date(iso);

const slot = (id: string, startsAt: string, capacity = 1, booked = 0) => ({
  id,
  startsAt: at(startsAt),
  endsAt: new Date(at(startsAt).getTime() + 15 * 60_000),
  capacity,
  booked,
});

const days = viewingDays(
  [
    slot('00000000-0000-4000-8000-000000000001', '2026-11-20T18:00:00Z'),
    slot('00000000-0000-4000-8000-000000000002', '2026-11-20T18:15:00Z'),
    slot('00000000-0000-4000-8000-000000000003', '2026-11-20T18:30:00Z'),
    slot('00000000-0000-4000-8000-000000000004', '2026-11-21T11:00:00Z', 8, 5),
    slot('00000000-0000-4000-8000-000000000005', '2026-11-21T11:30:00Z', 8, 2),
    slot('00000000-0000-4000-8000-000000000006', '2026-11-23T17:45:00Z'),
  ],
  now,
);

const operator = 'Halcyon Lettings';

function lister(phone: string | null) {
  return listerFrom({
    name: operator,
    kind: 'agency',
    psraLicenceNumber: '001234',
    confirmedAt: at('2026-11-01T10:00:00Z'),
    inboundSlug: 'halcyon-lettings',
    phone,
  });
}

const checks = (
  identity: CheckStatus,
  income: CheckStatus,
  landlord: CheckStatus,
  employer: CheckStatus,
  reason: string | null = null,
) => [
  { kind: 'identity' as const, status: identity, reason: null, refereeName: null },
  { kind: 'income' as const, status: income, reason, refereeName: null },
  {
    kind: 'landlord_reference' as const,
    status: landlord,
    reason: null,
    refereeName: landlord === 'to_do' || landlord === 'not_needed' ? null : 'Mary Kelly',
  },
  { kind: 'employer_reference' as const, status: employer, reason: null, refereeName: null },
];

const tenancyStart: TenantProgress = {
  agreementStatus: 'draft',
  paymentRequestedAt: null,
  paymentReceivedAt: null,
  moveInCompletedAt: null,
  inventorySharedAt: null,
  inventoryConfirmedAt: null,
  ppsnGivenAt: null,
  ppsnSkippedAt: null,
  rtbRegisteredAt: null,
};
const signed = { ...tenancyStart, agreementStatus: 'signed' };
const asked = { ...signed, paymentRequestedAt: now };
const paid = { ...asked, paymentReceivedAt: now };

function model(
  view: RenterView,
  over: Partial<RenterModel> & {
    checkItems?: ReturnType<typeof checks>;
    unavailable?: Array<'identity' | 'income'>;
    progress?: TenantProgress;
    phone?: string | null;
  } = {},
): RenterModel {
  const { checkItems = checks('to_do', 'to_do', 'to_do', 'to_do'), unavailable = [] } = over;
  const progress = over.progress ?? tenancyStart;
  const tenant = view === 'tenancy';
  return {
    view,
    operator,
    lister: lister(over.phone === undefined ? '01 496 0000' : over.phone),
    home: {
      addressLine1: '12 Ranelagh Road',
      area: 'Ranelagh, Dublin 6',
      monthlyRentCents: 185_000,
      bedrooms: 2,
      propertyType: 'apartment',
      availableFrom: '2026-12-13',
      status: tenant || view === 'let_to_someone_else' ? 'let' : 'live',
      tenancyStartDate: tenant ? '2026-12-13' : null,
    },
    address: '12 Ranelagh Road',
    place: '12 Ranelagh Road, Ranelagh, Dublin 6',
    firstName: 'Aoife',
    fullName: 'Aoife Byrne',
    email: 'aoife.byrne@example.ie',
    deleteBy: 'Wednesday 16 December',
    questions: {
      asked: ['moveInDate', 'stayMonths', 'occupants', 'hasPets'],
      criteria: { moveInBy: '2026-12-13', minStayMonths: 12, maxOccupants: 3, noPets: true },
      values: {},
      answers: [
        { label: 'People', value: '2 people' },
        { label: 'Pets', value: 'No' },
        { label: 'Move in', value: 'By Sunday 13 December' },
        { label: 'Stay', value: 'A year' },
      ],
      canChange: true,
    },
    viewings: {
      first: 'Friday 20 November',
      last: 'Monday 23 November',
      days,
      booking: null,
      place: null,
      reminderNumber: null,
    },
    application: { earning: '', monthlyIncome: '', rule: '2.5' },
    checks: {
      list: checkList(checkItems, unavailable),
      next: nextCheck(checkItems, unavailable),
      items: checkItems.map((check) => ({
        ...check,
        requestedOn: check.refereeName ? 'Tuesday 17 November' : null,
      })),
      referees: refereesToAsk(checkItems),
      retentionDays: 30,
    },
    offer: {
      rent: '€1,850 a month',
      from: 'Sunday 13 December',
      total: '€3,700',
      deposit: '€1,850',
      firstRent: '€1,850',
      deadline: 'Sunday 22 November, 6pm',
    },
    tenancy: tenant
      ? {
          start: 'Sunday 13 December',
          steps: tenantSteps(progress),
          task: tenantTask(progress),
          total: '€3,700',
          payBy: 'Friday 4 December',
          movedInOn: progress.moveInCompletedAt ? 'Sunday 13 December' : null,
          agreementSent: progress.agreementStatus !== 'draft',
        }
      : null,
    ...over,
  };
}

const closed: HubOptions = { open: false, sentTo: 'a…@example.ie' };
const open: HubOptions = { open: true, sentTo: 'a…@example.ie' };
const hub = (m: RenterModel, options: HubOptions = closed) => (
  <RenterHub token={TOKEN} model={m} options={options} />
);

const booking = {
  id: '00000000-0000-4000-8000-0000000000b1',
  slotId: '00000000-0000-4000-8000-000000000009',
  when: 'Friday 20 November, 6:15pm',
};
const firstTime = chosenTime(days, '00000000-0000-4000-8000-000000000002')!;
const groupTime = chosenTime(days, '00000000-0000-4000-8000-000000000004')!;

const payDetails: PayDetails = {
  total: '€3,700',
  deposit: '€1,850',
  firstRent: '€1,850',
  payBy: 'Friday 4 December',
  accountName: 'Halcyon Lettings client account',
  iban: 'IE29 AIBK 9311 5212 3456 78',
  reference: 'GAFF-7K2M9Q',
  receivedOn: null,
};

const inventory: InventoryItem[] = [
  {
    id: 'i1',
    room: 'Kitchen',
    item: 'Fridge',
    condition: 'good',
    note: null,
    tenantNote: null,
    hasPhoto: false,
  },
  {
    id: 'i2',
    room: 'Kitchen',
    item: 'Oven',
    condition: 'worn',
    note: 'Door seal is perished on the left.',
    tenantNote: null,
    hasPhoto: false,
  },
  {
    id: 'i3',
    room: 'Living room',
    item: 'Sofa',
    condition: 'damaged',
    note: 'Small tear on the left arm.',
    tenantNote: 'There’s a second tear at the back that isn’t listed.',
    hasPhoto: false,
  },
  {
    id: 'i4',
    room: 'Bedroom',
    item: 'Wardrobe',
    condition: 'new',
    note: null,
    tenantNote: null,
    hasPhoto: false,
  },
];

const tenancy = (progress: TenantProgress) => model('tenancy', { progress });

/** Each page, by the name its address takes: `/dev/ui/renter?page=booked`. */
/**
 * `q` is the screen of a one-per-screen flow that the address asks for (`&q=pets`), passed on to
 * the pages that have one, as a renter's own address would.
 */
export const pages: Record<string, { label: string; render: (q?: string) => ReactNode }> = {
  questions: {
    label: 'Questions',
    render: (q) => hub(model('questions'), { ...closed, q }),
  },
  'questions-change': {
    label: 'Questions, changing an answer',
    render: (q) =>
      hub(
        model('answers_sent', {
          questions: {
            ...model('answers_sent').questions,
            values: { occupants: '2', hasPets: 'no', canMoveIn: 'yes', stayMonths: '12' },
          },
        }),
        { ...closed, changing: true, q: q ?? 'moving-in' },
      ),
  },
  'answers-sent': { label: 'Answers sent', render: () => hub(model('answers_sent')) },
  invited: { label: 'Invited', render: () => hub(model('invited')) },
  'choose-time': {
    label: 'Choosing a time',
    render: () => <ChooseTime token={TOKEN} model={model('invited')} />,
  },
  'choose-time-day': {
    label: 'Choosing a time, a group day',
    render: () => <ChooseTime token={TOKEN} model={model('invited')} day="2026-11-21" />,
  },
  'choose-time-gone': {
    label: 'Choosing a time, one just taken',
    render: () => <ChooseTime token={TOKEN} model={model('invited')} gone />,
  },
  'confirm-time': {
    label: 'Confirming a time',
    render: () => <ConfirmTime token={TOKEN} model={model('invited')} chosen={firstTime} />,
  },
  'confirm-time-problem': {
    label: 'Confirming a time, a mobile number to fix',
    render: () => (
      <ConfirmTime token={TOKEN} model={model('invited')} chosen={groupTime} problem="phone" />
    ),
  },
  booked: {
    label: 'Booked',
    render: () =>
      hub(
        model('booked', {
          viewings: { ...model('booked').viewings, booking, reminderNumber: '087 123 4567' },
        }),
      ),
  },
  'change-time': {
    label: 'Changing the time',
    render: () => (
      <ChooseTime
        token={TOKEN}
        model={model('booked', { viewings: { ...model('booked').viewings, booking } })}
      />
    ),
  },
  'confirm-move': {
    label: 'Moving to a new time',
    render: () => (
      <ConfirmTime
        token={TOKEN}
        model={model('booked', {
          viewings: { ...model('booked').viewings, booking, reminderNumber: '087 123 4567' },
        })}
        chosen={firstTime}
      />
    ),
  },
  cancel: {
    label: 'Cancelling',
    render: () => (
      <CancelViewing
        token={TOKEN}
        model={model('booked', { viewings: { ...model('booked').viewings, booking } })}
      />
    ),
  },
  cancelled: { label: 'Cancelled', render: () => hub(model('cancelled')) },
  'no-times': { label: 'No times left', render: () => hub(model('no_times')) },
  'waiting-list': { label: 'On the waiting list', render: () => hub(model('waiting_list')) },
  'place-offered': {
    label: 'A place has opened up',
    render: () =>
      hub(
        model('place_offered', {
          viewings: {
            ...model('place_offered').viewings,
            place: {
              slotId: '00000000-0000-4000-8000-000000000002',
              when: 'Friday 20 November, 6:15pm',
              held: 'until 8:40pm today',
            },
          },
        }),
      ),
  },
  'place-open-to-all': {
    label: 'A place, open to the whole list',
    render: () =>
      hub(
        model('place_offered', {
          viewings: {
            ...model('place_offered').viewings,
            place: {
              slotId: '00000000-0000-4000-8000-000000000002',
              when: 'Friday 20 November, 6:15pm',
              held: null,
            },
          },
        }),
      ),
  },
  'hold-ran-out': { label: 'A hold ran out', render: () => hub(model('hold_ran_out')) },
  'not-invited-yet': { label: 'Not invited yet', render: () => hub(model('not_invited_yet')) },
  'missed-viewing': { label: 'Viewing missed', render: () => hub(model('missed_viewing')) },
  'after-viewing': { label: 'After viewing', render: () => hub(model('after_viewing')) },
  apply: {
    label: 'Applying',
    render: (q) => (
      <PrivateFrame
        audience="renter"
        lister={lister('01 496 0000')}
        home={model('after_viewing').home}
        next={<p>{applyCopy.next(operator)}</p>}
      >
        <ApplyFlow
          token={TOKEN}
          operator={operator}
          rule="2.5"
          sentTo="a…@example.ie"
          current={{
            earning: '',
            monthlyIncome: '',
            fullName: 'Aoife Byrne',
            email: 'aoife.byrne@example.ie',
          }}
          startAt={q}
        />
      </PrivateFrame>
    ),
  },
  'apply-check': {
    label: 'Applying, the check screen',
    render: (q) => (
      <PrivateFrame
        audience="renter"
        lister={lister('01 496 0000')}
        home={model('applied').home}
        next={<p>{applyCopy.next(operator)}</p>}
      >
        <ApplyFlow
          token={TOKEN}
          operator={operator}
          rule="2.5"
          sentTo="a…@example.ie"
          current={{
            earning: 'employed',
            monthlyIncome: '5,200',
            fullName: 'Aoife Byrne',
            email: 'aoife.byrne@example.ie',
          }}
          startAt={q}
        />
      </PrivateFrame>
    ),
  },
  applied: { label: 'Applied', render: () => hub(model('applied')) },
  'checks-start': { label: 'Chosen for checks', render: () => hub(model('checks')) },
  'checks-id': { label: 'Checks: your ID', render: () => hub(model('checks'), open) },
  'checks-income': {
    label: 'Checks: your income',
    render: () =>
      hub(model('checks', { checkItems: checks('passed', 'to_do', 'to_do', 'to_do') }), open),
  },
  'checks-income-failed': {
    label: 'Checks: a check that didn’t work',
    render: () =>
      hub(
        model('checks', {
          checkItems: checks('passed', 'not_passed', 'to_do', 'to_do', 'no_regular_income'),
        }),
        open,
      ),
  },
  'checks-references': {
    label: 'Checks: your references',
    render: (q) =>
      hub(model('checks', { checkItems: checks('passed', 'passed', 'to_do', 'to_do') }), {
        ...open,
        q,
      }),
  },
  'checks-arranged': {
    label: 'Checks: arranged by the lister',
    render: () => hub(model('checks', { unavailable: ['identity', 'income'] }), open),
  },
  'checks-done': {
    label: 'Checks: all done',
    render: () =>
      hub(
        model('checks', { checkItems: checks('passed', 'passed', 'in_progress', 'not_needed') }),
        open,
      ),
  },
  offer: { label: 'The offer', render: () => hub(model('offer')) },
  decline: {
    label: 'Declining the offer',
    render: () => <DeclineOffer token={TOKEN} model={model('offer')} />,
  },
  'offer-closed': { label: 'The offer has closed', render: () => hub(model('offer_closed')) },
  'offer-declined': { label: 'Offer declined', render: () => hub(model('offer_declined')) },
  'tenancy-agreement-coming': {
    label: 'Tenancy: agreement being prepared',
    render: () => hub(tenancy(tenancyStart)),
  },
  'tenancy-sign': {
    label: 'Tenancy: sign',
    render: () => hub(tenancy({ ...tenancyStart, agreementStatus: 'with_tenant' })),
  },
  'tenancy-countersign': {
    label: 'Tenancy: waiting for the lister to sign',
    render: () => hub(tenancy({ ...tenancyStart, agreementStatus: 'tenant_signed' })),
  },
  'tenancy-payment-coming': {
    label: 'Tenancy: payment details to come',
    render: () => hub(tenancy(signed)),
  },
  'tenancy-pay': { label: 'Tenancy: pay', render: () => hub(tenancy(asked)) },
  pay: {
    label: 'Paying',
    render: () => <PayPage token={TOKEN} model={tenancy(asked)} details={payDetails} sentTo="" />,
  },
  'pay-no-number': {
    label: 'Paying, no number on file',
    render: () => (
      <PayPage
        token={TOKEN}
        model={model('tenancy', { progress: asked, phone: null })}
        details={payDetails}
        sentTo=""
      />
    ),
  },
  'pay-code': {
    label: 'Paying, the code first',
    render: () => (
      <PayPage token={TOKEN} model={tenancy(asked)} details={null} sentTo="a…@example.ie" />
    ),
  },
  'pay-received': {
    label: 'Payment received',
    render: () => (
      <PayPage
        token={TOKEN}
        model={tenancy(paid)}
        details={{ ...payDetails, receivedOn: 'Tuesday 1 December' }}
        sentTo=""
      />
    ),
  },
  'tenancy-pps': { label: 'Tenancy: the PPS number', render: () => hub(tenancy(paid)) },
  'tenancy-inventory': {
    label: 'Tenancy: inventory to check',
    render: () => hub(tenancy({ ...paid, ppsnSkippedAt: now, inventorySharedAt: now })),
  },
  inventory: {
    label: 'The inventory',
    render: () => (
      <InventoryPage
        token={TOKEN}
        model={tenancy({ ...paid, ppsnSkippedAt: now, inventorySharedAt: now })}
        items={inventory}
        confirmedOn={null}
      />
    ),
  },
  'inventory-confirmed': {
    label: 'The inventory, confirmed',
    render: () => (
      <InventoryPage
        token={TOKEN}
        model={tenancy({
          ...paid,
          ppsnSkippedAt: now,
          inventorySharedAt: now,
          inventoryConfirmedAt: now,
        })}
        items={inventory}
        confirmedOn="Tuesday 15 December"
      />
    ),
  },
  'tenancy-moving-in': {
    label: 'Tenancy: nothing to do',
    render: () => hub(tenancy({ ...paid, ppsnSkippedAt: now })),
  },
  'tenancy-moved-in': {
    label: 'Tenancy: moved in',
    render: () =>
      hub(
        tenancy({
          ...paid,
          ppsnSkippedAt: now,
          inventorySharedAt: now,
          inventoryConfirmedAt: now,
          moveInCompletedAt: now,
        }),
      ),
  },
  'home-let': {
    label: 'Home let to someone else',
    render: () => hub(model('let_to_someone_else')),
  },
  'home-closed': { label: 'Home no longer available', render: () => hub(model('home_closed')) },
  'link-ended': { label: 'The link has ended', render: () => <LinkEnded /> },
  loading: { label: 'Loading', render: () => <RenterLoading /> },
  failed: { label: 'A page that couldn’t load', render: () => <RenterFailed /> },
};
