import type { Metadata } from 'next';
import { stayChoices } from '@/domain/criteria/answers';
import { formatDate, formatEuro, irishToday } from '@/lib/format';
import { formatRatio, minimumIncomeCents } from '@/domain/applications/apply';
import { loadRenterPage } from '@/server/renter/answers';
import { env } from '@/lib/env';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { HomeSummary, RenterShell } from '../RenterShell';
import styles from '../renter.module.css';
import { AnswersForm } from './AnswersForm';
import { ApplyForm } from './ApplyForm';
import { BookingSection } from './BookingSection';
import { ChecksSection } from './ChecksSection';
import { InventoryReview } from './InventoryReview';
import { OfferSection } from './OfferSection';
import { PaymentDetails } from './PaymentDetails';
import { PpsnForm } from './PpsnForm';
import { TenancySteps } from './TenancySteps';

export const metadata: Metadata = { title: 'A few quick questions' };
export const dynamic = 'force-dynamic';

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? first : '';
}

/**
 * R9: the renter's private page. No account; the link is the key. One thing at a time: the home
 * it's about, then the single task or message for where they are now.
 */
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
        <Outcome tone="info" title="This link isn’t working" headingLevel={1}>
          <p>It may have expired. Reply to any email from us and we’ll help you.</p>
        </Outcome>
      </RenterShell>
    );
  }
  const { application, letting, organisation, questions, firstViewing, canChange, offer, address } =
    page;
  const status = application.status;
  const closed = letting.status === 'let' || letting.status === 'withdrawn';
  const canBook =
    status === 'invited' || status === 'booked' || (status === 'waitlisted' && offer !== null);
  const deletion = application.deleteAfter
    ? ` We’ll delete your details from Gaff by ${formatDate(application.deleteAfter)}.`
    : '';
  if (closed && !['accepted', 'declined', 'not_chosen'].includes(application.status)) {
    return (
      <RenterShell operatorName={organisation.name}>
        <Stack gap={6}>
          <HomeSummary letting={letting} address={address} />
          <Outcome
            tone="info"
            title={
              letting.status === 'let' ? 'This home has been let' : 'This home isn’t available now'
            }
          >
            <p>
              Enquiries are closed. Thank you for your interest.
              {deletion}
            </p>
          </Outcome>
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
      <Stack gap={8}>
        <HomeSummary letting={letting} address={address} />

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
          <Outcome tone="waiting" title="You’re on the waiting list">
            <p>
              If a place opens up, we’ll email you straight away with a link to book it. Either way,
              you’ll hear back from us.
            </p>
          </Outcome>
        ) : null}

        {status === 'attended' || (status === 'applied' && change && !applied) ? (
          <section className={styles.section} aria-labelledby="apply-heading">
            <div className={styles.sectionHead}>
              <h2 id="apply-heading" className="type-title">
                {status === 'applied' ? 'Change your application' : `Apply for ${address}`}
              </h2>
              <p>
                {status === 'applied'
                  ? 'Change anything that’s not right, then send it again.'
                  : 'Thanks for coming to view. To apply, answer two questions. It takes a minute, and you don’t need any documents now.'}
              </p>
            </div>
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
            <div className={styles.next}>
              <p className={styles.nextTitle}>What happens next</p>
              <p>
                Only {organisation.name} sees this. If they choose you, they’ll ask to check your
                ID, income and references, and explain each check first.
              </p>
            </div>
          </section>
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
            address={address}
            offer={page.homeOffer}
            confirmDecline={Boolean(decline)}
            problem={offer_problem}
          />
        ) : null}

        {status === 'accepted' ? (
          <Stack gap={8}>
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
          <Outcome
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
              {deletion}
            </p>
          </Outcome>
        ) : null}

        {status === 'not_chosen' ? (
          <Outcome tone="info" title="The home has been let" role="status">
            <p>
              Thank you for applying. {organisation.name} has let the home to another applicant. We
              wish you well with your search.
              {deletion}
            </p>
          </Outcome>
        ) : null}

        {status === 'applied' && !change ? (
          <Outcome
            tone="success"
            title={applied ? (name ? `Thanks, ${name}` : 'Thanks') : 'Your application is in'}
            role="status"
          >
            <p>
              Your application is with {organisation.name}. They’ll choose who to offer the home to
              after the viewings, and we’ll email you either way.
            </p>
            <p>
              <a href={`/r/${token}?change=1`}>Change my application</a>
            </p>
          </Outcome>
        ) : null}

        {status === 'no_show' ? (
          <Outcome tone="info" title="Your viewing time has passed">
            <p>
              If you’d still like to see the home, reply to any of our emails and we’ll see what we
              can do. Either way, you’ll hear back from us.
            </p>
          </Outcome>
        ) : null}

        {status === 'not_invited' ? (
          <Outcome tone="info" title="Thanks for your interest">
            <p>
              We’ve had a lot of interest, so we can’t invite everyone to view this time. You’ll
              hear from us either way once a tenant has been chosen.
            </p>
          </Outcome>
        ) : null}

        {status === 'enquired' && (saved || (answered && !canChange)) ? (
          <Outcome tone="success" title={name ? `Thanks, ${name}` : 'Thanks'} role="status">
            <p>
              Your answers are with {organisation.name}. {nextSteps}
            </p>
          </Outcome>
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
          <section className={styles.section} aria-labelledby="questions-heading">
            <div className={styles.sectionHead}>
              <h2 id="questions-heading" className="type-title">
                {name ? `Hi ${name}, a` : 'A'} few quick questions
              </h2>
              <p>
                So {organisation.name} can arrange viewings fairly, everyone is asked the same few
                questions. It takes about a minute.
              </p>
            </div>
            <AnswersForm
              token={token}
              questions={questions}
              availableFrom={formatDate(letting.availableFrom)}
              today={irishToday()}
              current={current}
            />
            <div className={styles.next}>
              <p className={styles.nextTitle}>What happens next</p>
              <p>{nextSteps}</p>
            </div>
          </section>
        ) : null}

        {!canChange && !answered && status === 'enquired' ? (
          <Outcome tone="info" title="Viewings are arranged">
            <p>
              {organisation.name} has chosen who to invite to view. You’ll hear from us by email
              either way.
            </p>
          </Outcome>
        ) : null}

        {canChange && questions.length === 0 ? (
          <Outcome tone="info" title="There’s nothing to answer right now">
            <p>{nextSteps}</p>
          </Outcome>
        ) : null}
      </Stack>
    </RenterShell>
  );
}
