import type { Metadata } from 'next';
import { stayChoices } from '@/domain/criteria/answers';
import { formatDate, formatEuro, formatRent, irishToday } from '@/lib/format';
import { formatRatio, minimumIncomeCents } from '@/domain/applications/apply';
import { loadRenterPage } from '@/server/renter/answers';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { RenterShell } from '../RenterShell';
import styles from '../renter.module.css';
import { AnswersForm } from './AnswersForm';
import { ChecksSection } from './ChecksSection';
import { OfferSection } from './OfferSection';
import { PaymentDetails } from './PaymentDetails';
import { TenancySteps } from './TenancySteps';
import { PpsnForm } from './PpsnForm';
import { InventoryReview } from './InventoryReview';
import { env } from '@/lib/env';
import { ApplyForm } from './ApplyForm';
import { BookingSection } from './BookingSection';

export const metadata: Metadata = { title: 'A few quick questions' };
export const dynamic = 'force-dynamic';

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? first : '';
}

/** R9: the renter's private page. No account; the link is the key. */
export default async function RenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    saved?: string;
    booked?: string;
    cancelled?: string;
    problem?: string;
    applied?: string;
    change?: string;
    check_problem?: string;
    referees?: string;
    decline?: string;
    offer_problem?: string;
    accepted?: string;
    declined?: string;
  }>;
}) {
  const { token } = await params;
  const {
    saved,
    booked,
    cancelled,
    problem,
    applied,
    change,
    check_problem,
    referees,
    decline,
    offer_problem,
  } = await searchParams;
  const page = await loadRenterPage(token);
  if (!page) {
    return (
      <RenterShell operatorName="Gaff">
        <Stack gap={4}>
          <h1 className="type-heading">This link isn’t working</h1>
          <p>It may have expired. Reply to any email from us and we’ll help you.</p>
        </Stack>
      </RenterShell>
    );
  }
  const { application, letting, organisation, questions, firstViewing, canChange, offer } = page;
  const status = application.status;
  const closed = letting.status === 'let' || letting.status === 'withdrawn';
  const canBook =
    status === 'invited' || status === 'booked' || (status === 'waitlisted' && offer !== null);
  if (closed && !['accepted', 'declined', 'not_chosen'].includes(application.status)) {
    return (
      <RenterShell operatorName={organisation.name}>
        <Stack gap={6}>
          <Stack gap={2}>
            <h1 className="type-heading">{letting.addressLine1}</h1>
            <p className={styles.muted}>{letting.area}</p>
          </Stack>
          <Notice
            tone="info"
            title={
              letting.status === 'let' ? 'This home has been let' : 'This home isn’t available now'
            }
          >
            <p>
              Enquiries are closed. Thank you for your interest.
              {application.deleteAfter
                ? ` We’ll delete your details from Gaff by ${formatDate(application.deleteAfter)}.`
                : ''}
            </p>
          </Notice>
        </Stack>
      </RenterShell>
    );
  }
  const name = firstName(application.fullName);
  const answers = application.answers ?? {};
  const answered = application.answersAt !== null;
  const nextSteps = `${firstViewing ? `Viewings start on ${formatDate(firstViewing)}. ` : ''}If you’re invited to view, we’ll email you a link to book a time that suits you. Either way, you’ll hear back from us.`;
  const current: Record<string, string> = {
    moveInDate: answers.moveInDate ?? '',
    stayMonths: answers.stayMonths ? String(answers.stayMonths) : '',
    occupants: answers.occupants ? String(answers.occupants) : '',
    hasPets: answers.hasPets === undefined ? '' : answers.hasPets ? 'yes' : 'no',
  };
  const summary = [
    answers.moveInDate ? ['Move in', formatDate(answers.moveInDate)] : null,
    answers.stayMonths
      ? ['Stay', stayChoices.find((c) => c.months === answers.stayMonths)?.label ?? '']
      : null,
    answers.occupants
      ? ['People', answers.occupants === 1 ? 'Just me' : `${answers.occupants} people`]
      : null,
    answers.hasPets !== undefined ? ['Pets', answers.hasPets ? 'Yes' : 'No'] : null,
  ].filter((row): row is [string, string] => row !== null);

  return (
    <RenterShell operatorName={organisation.name}>
      <Stack gap={6}>
        <Stack gap={2}>
          <h1 className="type-heading">{letting.addressLine1}</h1>
          <p className={styles.muted}>
            {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
            {formatDate(letting.availableFrom)}
          </p>
        </Stack>

        {booked ? (
          <Notice
            tone="success"
            title={booked === 'moved' ? 'Your viewing has moved' : 'You’re booked'}
            role="status"
          >
            <p>We’ve emailed you the details, and we’ll remind you the day before.</p>
          </Notice>
        ) : null}
        {cancelled ? (
          <Notice tone="info" title="Your viewing is cancelled" role="status">
            <p>Thanks for letting us know. Someone else can have the place now.</p>
          </Notice>
        ) : null}
        {canBook ? <BookingSection page={page} token={token} problem={problem} /> : null}
        {status === 'waitlisted' && !offer ? (
          <Notice tone="info" title="You’re on the waiting list">
            <p>
              If a place opens up, we’ll email you straight away with a link to book it. Either way,
              you’ll hear back from us.
            </p>
          </Notice>
        ) : null}
        {status === 'attended' || (status === 'applied' && change && !applied) ? (
          <Stack gap={4}>
            <h2 className="type-title">
              {status === 'applied'
                ? 'Change your application'
                : `Apply for ${letting.addressLine1}`}
            </h2>
            <p>
              {status === 'applied'
                ? 'Change anything that’s not right, then send it again.'
                : `Thanks for coming to view. To apply, answer two questions. It takes a minute, and you don’t need any documents now.`}
            </p>
            <Card>
              <h3 className="type-title">From your enquiry</h3>
              <dl className={styles.answers}>
                {[['Name', application.fullName], ['Email', application.email], ...summary].map(
                  ([label, value]) => (
                    <div key={label} className={styles.answer}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ),
                )}
              </dl>
            </Card>
            <ApplyForm
              token={token}
              rule={`${organisation.name} looks for at least ${formatRatio(organisation.incomeRuleTenths)} times the rent: ${formatEuro(minimumIncomeCents(letting.monthlyRentCents, organisation.incomeRuleTenths))} a month. Everyone is asked the same.`}
              current={{
                earning: application.earning ?? '',
                monthlyIncome:
                  application.monthlyIncomeCents === null
                    ? ''
                    : String(application.monthlyIncomeCents / 100),
              }}
            />
            <p className={styles.muted}>
              Only {organisation.name} sees this. If they choose you, they’ll ask to check your ID,
              income and references, and explain each check first.
            </p>
          </Stack>
        ) : null}
        {status === 'preferred' || status === 'backup' ? (
          <>
            {referees ? (
              <Notice tone="success" title="Thanks" role="status">
                <p>We’ve asked for your references. We’ll remind them if they don’t answer.</p>
              </Notice>
            ) : null}
            <ChecksSection
              token={token}
              operatorName={organisation.name}
              checks={page.checks}
              providers={{
                identity: env().IDENTITY_PROVIDER !== 'none',
                income: env().INCOME_PROVIDER !== 'none',
              }}
              problem={check_problem}
            />
          </>
        ) : null}
        {status === 'offered' && page.homeOffer ? (
          <OfferSection
            token={token}
            operatorName={organisation.name}
            address={letting.addressLine1}
            offer={page.homeOffer}
            confirmDecline={Boolean(decline)}
            problem={offer_problem}
          />
        ) : null}
        {status === 'accepted' ? (
          <Stack gap={6}>
            <TenancySteps token={token} operatorName={organisation.name} tenancy={page.tenancy} />
            {page.tenancy?.paymentRequestedAt && page.payTo ? (
              <PaymentDetails
                operatorName={organisation.name}
                tenancy={page.tenancy}
                payTo={page.payTo}
              />
            ) : null}
            {page.tenancy?.inventorySharedAt && page.inventory.length > 0 ? (
              <InventoryReview
                token={token}
                operatorName={organisation.name}
                items={page.inventory}
                confirmedAt={page.tenancy.inventoryConfirmedAt}
              />
            ) : null}
            {page.tenancy && !page.tenancy.rtbRegisteredAt ? (
              <PpsnForm
                token={token}
                operatorName={organisation.name}
                given={page.tenancy.ppsnGivenAt !== null}
              />
            ) : null}
          </Stack>
        ) : null}
        {status === 'declined' ? (
          <Notice
            tone="info"
            title={
              page.homeOffer?.status === 'expired'
                ? 'The offer has closed'
                : 'You’ve declined the offer'
            }
            role="status"
          >
            <p>
              Thank you for letting us know, and for your interest in the home.
              {application.deleteAfter
                ? ` We’ll delete your details from Gaff by ${formatDate(application.deleteAfter)}.`
                : ''}
            </p>
          </Notice>
        ) : null}
        {status === 'not_chosen' ? (
          <Notice tone="info" title="The home has been let" role="status">
            <p>
              Thank you for applying. {organisation.name} has let the home to another applicant. We
              wish you well with your search.
              {application.deleteAfter
                ? ` We’ll delete your details from Gaff by ${formatDate(application.deleteAfter)}.`
                : ''}
            </p>
          </Notice>
        ) : null}
        {status === 'applied' && !change ? (
          <Notice
            tone="success"
            title={applied ? (name ? `Thanks, ${name}` : 'Thanks') : 'Your application is in'}
            role="status"
          >
            <p>
              Your application is with {organisation.name}. They’ll choose who to offer the home to
              after the viewings, and we’ll email you either way.{' '}
              <a href={`/r/${token}?change=1`}>Change my application</a>
            </p>
          </Notice>
        ) : null}
        {status === 'no_show' ? (
          <Notice tone="info" title="Your viewing time has passed">
            <p>
              If you’d still like to see the home, reply to any of our emails and we’ll see what we
              can do. Either way, you’ll hear back from us.
            </p>
          </Notice>
        ) : null}
        {status === 'not_invited' ? (
          <Notice tone="info" title="Thanks for your interest">
            <p>
              We’ve had a lot of interest, so we can’t invite everyone to view this time. You’ll
              hear from us either way once a tenant has been chosen.
            </p>
          </Notice>
        ) : null}
        {status === 'enquired' && (saved || (answered && !canChange)) ? (
          <Notice tone="success" title={name ? `Thanks, ${name}` : 'Thanks'} role="status">
            <p>
              Your answers are with {organisation.name}. {nextSteps}
            </p>
          </Notice>
        ) : null}

        {status === 'enquired' && answered && summary.length > 0 && (saved || !canChange) ? (
          <Card>
            <h2 className="type-title">Your answers</h2>
            <dl className={styles.answers}>
              {summary.map(([label, value]) => (
                <div key={label} className={styles.answer}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {canChange ? (
              <p>
                <a href={`/r/${token}`}>Change my answers</a>
              </p>
            ) : null}
          </Card>
        ) : null}

        {!saved && canChange && questions.length > 0 ? (
          <Stack gap={4}>
            <h2 className="type-title">{name ? `Hi ${name}, a` : 'A'} few quick questions</h2>
            <p>
              So {organisation.name} can arrange viewings fairly, everyone is asked the same few
              questions. It takes about a minute.
            </p>
            <AnswersForm
              token={token}
              questions={questions}
              availableFrom={formatDate(letting.availableFrom)}
              today={irishToday()}
              current={current}
            />
          </Stack>
        ) : null}

        {!canChange && !answered && status === 'enquired' ? (
          <Notice tone="info" title="Viewings are arranged">
            <p>
              {organisation.name} has chosen who to invite to view. You’ll hear from us by email
              either way.
            </p>
          </Notice>
        ) : null}

        {canChange && questions.length === 0 ? (
          <p>There’s nothing to answer right now. {nextSteps}</p>
        ) : null}
      </Stack>
    </RenterShell>
  );
}
