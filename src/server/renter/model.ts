import { answersBesideDetails } from '@/copy/fit';
import { formatRatio } from '@/domain/applications/apply';
import {
  checkList,
  nextCheck,
  refereesToAsk,
  type RenterCheck,
} from '@/domain/checks/renter-checks';
import type { CheckKind, CheckStatus } from '@/domain/checks/checks';
import { mayAttempt } from '@/domain/identity/attempts';
import { answersAsValues, answersInWords } from '@/domain/criteria/answers';
import type { Criteria, CriterionQuestion } from '@/domain/criteria/criteria';
import { homeFrom, listerFrom, type FrameHome, type Lister } from '@/domain/frame/frame';
import { renterView, type RenterView } from '@/domain/renter/path';
import { paymentAmounts } from '@/domain/tenancy/payment';
import {
  tenantSteps,
  tenantTask,
  type TenantStep,
  type TenantTask,
} from '@/domain/tenancy/tenant-steps';
import {
  holdEndsInWords,
  reminderNumber,
  viewingDays,
  type ViewingDay,
} from '@/domain/viewings/choosing';
import { env } from '@/lib/env';
import { formatDate, formatDateTime, formatEuro } from '@/lib/format';
import type { loadRenterPage } from './answers';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadRenterPage>>>;

/**
 * What a renter's page shows, in the words and figures it shows them (UX-RN-1 to UX-RN-26). The
 * page components take this and nothing else, so each page can be drawn from made-up details
 * too (`/dev/ui/renter`). Dates and money are already written the way Gaff writes them.
 */
export interface RenterModel {
  /** Which page of the renter's path this is (UX-PP-7). */
  view: RenterView;
  operator: string;
  lister: Lister;
  home: FrameHome;
  /** "12 Ranelagh Road" */
  address: string;
  /** "12 Ranelagh Road, Ranelagh, Dublin 6", as a maps app would search for it. */
  place: string;
  firstName: string;
  fullName: string;
  email: string;
  /** When their details are deleted, once that's set: "Friday 18 December". */
  deleteBy: string | null;
  questions: {
    asked: CriterionQuestion[];
    criteria: Criteria;
    /** Answers already given, as the taps that made them. */
    values: Record<string, string>;
    answers: Array<{ label: string; value: string }>;
    /** UX-MT-11: each answer beside what the home is for, in plain words, without judgement. */
    beside: string[];
    canChange: boolean;
  };
  viewings: {
    first: string | null;
    last: string | null;
    days: ViewingDay[];
    booking: { id: string; slotId: string; when: string } | null;
    /** A place offered from the waiting list: when it is, and how long it's held. */
    place: { slotId: string; when: string; held: string | null } | null;
    reminderNumber: string | null;
  };
  application: {
    earning: string;
    monthlyIncome: string;
    /** The operator's income rule, as "2.5". */
    rule: string;
  };
  checks: {
    list: ReturnType<typeof checkList>;
    next: RenterCheck | null;
    items: Array<{
      kind: CheckKind;
      status: CheckStatus;
      reason: string | null;
      refereeName: string | null;
      requestedOn: string | null;
      /** P25: an ID check that didn't pass in three tries. */
      noTriesLeft?: boolean;
    }>;
    referees: Array<'landlord' | 'employer'>;
    retentionDays: number;
  };
  offer: {
    rent: string;
    from: string;
    total: string;
    deposit: string;
    firstRent: string;
    deadline: string;
  } | null;
  tenancy: {
    start: string;
    steps: TenantStep[];
    task: TenantTask;
    total: string;
    payBy: string | null;
    movedInOn: string | null;
    /** The agreement can be read: it has been sent, or signed. */
    agreementSent: boolean;
  } | null;
}

export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? first : '';
}

export function renterModel(
  page: Loaded,
  options: {
    /** Which checks have a provider to start them with. */
    providers: { identity: boolean; income: boolean };
    retentionDays: number;
    now?: Date;
  },
): RenterModel {
  const now = options.now ?? new Date();
  const { application, letting, organisation, tenancy, homeOffer } = page;
  const days = viewingDays(page.slots, now);
  const placeSlot = page.offer ? page.slots.find((slot) => slot.id === page.offer!.slotId) : null;
  const status = application.status;
  const view = renterView({
    status,
    lettingStatus: letting.status,
    questions: page.questions.length,
    answered: application.answersAt !== null,
    hasBooking: page.booking !== null,
    bookingCancelled: page.bookingCancelled,
    timesToBook: days.reduce((total, day) => total + day.times.length, 0),
    placeOffered: page.offer !== null && Boolean(placeSlot),
    holdRanOut: page.holdRanOut,
    offer: homeOffer?.status ?? null,
  });
  const unavailable: RenterCheck[] = [
    ...(options.providers.identity ? [] : (['identity'] as const)),
    ...(options.providers.income ? [] : (['income'] as const)),
  ];
  const amounts = tenancy ? paymentAmounts(tenancy) : null;
  return {
    view,
    operator: organisation.name,
    lister: listerFrom(organisation),
    // UX-PP-5: for the tenant, the home's "From" is the day their tenancy starts.
    home: homeFrom(
      letting,
      status === 'accepted' ? (tenancy?.startDate ?? homeOffer?.startDate ?? null) : null,
    ),
    address: letting.addressLine1,
    place: `${letting.addressLine1}, ${letting.area}`,
    firstName: firstNameOf(application.fullName),
    fullName: application.fullName,
    email: application.email,
    deleteBy: application.deleteAfter ? formatDate(application.deleteAfter, now) : null,
    questions: {
      asked: page.questions,
      criteria: page.criteria,
      values: answersAsValues(application.answers, page.criteria),
      answers: application.answersAt
        ? answersInWords(application.answers, (date) => formatDate(date, now))
        : [],
      beside: application.answersAt
        ? answersBesideDetails(page.criteria, application.answers, now)
        : [],
      canChange: page.canChange,
    },
    viewings: {
      first: page.firstViewing ? formatDate(page.firstViewing, now) : null,
      last: page.lastViewing ? formatDate(page.lastViewing, now) : null,
      days,
      booking: page.booking
        ? {
            id: page.booking.booking.id,
            slotId: page.booking.slot.id,
            when: formatDateTime(page.booking.slot.startsAt, now),
          }
        : null,
      place:
        page.offer && placeSlot
          ? {
              slotId: placeSlot.id,
              when: formatDateTime(placeSlot.startsAt, now),
              held:
                page.offer.mode === 'one_at_a_time' && page.offer.expiresAt
                  ? holdEndsInWords(page.offer.expiresAt, now)
                  : null,
            }
          : null,
      reminderNumber: reminderNumber(application),
    },
    application: {
      earning: application.earning ?? '',
      monthlyIncome:
        application.monthlyIncomeCents === null
          ? ''
          : (application.monthlyIncomeCents / 100).toLocaleString('en-IE'),
      rule: formatRatio(organisation.incomeRuleTenths),
    },
    checks: {
      list: checkList(page.checks, unavailable),
      next: nextCheck(page.checks, unavailable),
      items: page.checks.map((check) => ({
        kind: check.kind,
        status: check.status,
        reason: check.reason,
        refereeName: check.refereeName,
        requestedOn: check.requestedAt ? formatDate(check.requestedAt, now) : null,
        noTriesLeft:
          check.kind === 'identity' &&
          check.status === 'not_passed' &&
          !mayAttempt({ attempts: check.attempts ?? 0, passed: false }),
      })),
      referees: refereesToAsk(page.checks),
      retentionDays: options.retentionDays,
    },
    offer: homeOffer
      ? {
          rent: `${formatEuro(homeOffer.rentCents)} a month`,
          from: formatDate(homeOffer.startDate, now),
          total: formatEuro(homeOffer.rentCents + homeOffer.depositCents),
          deposit: formatEuro(homeOffer.depositCents),
          firstRent: formatEuro(homeOffer.rentCents),
          deadline: formatDateTime(homeOffer.expiresAt, now),
        }
      : null,
    tenancy:
      tenancy && amounts
        ? {
            start: formatDate(tenancy.startDate, now),
            steps: tenantSteps(tenancy),
            task: tenantTask(tenancy),
            total: formatEuro(amounts.totalCents),
            payBy: tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate, now) : null,
            movedInOn: tenancy.moveInCompletedAt
              ? formatDate(tenancy.moveInCompletedAt, now)
              : null,
            agreementSent: tenancy.agreementStatus !== 'draft',
          }
        : null,
  };
}

/** The model as this deployment shows it: which checks have a provider, and how long is kept. */
export function renterModelFor(page: Loaded, now?: Date): RenterModel {
  return renterModel(page, {
    providers: {
      identity: env().IDENTITY_PROVIDER !== 'none',
      income: env().INCOME_PROVIDER !== 'none',
    },
    retentionDays: env().RETENTION_PERSONAL_DAYS,
    now,
  });
}
