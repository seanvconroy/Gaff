import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { askCopy as copy, searchedFor } from '@/copy/ask-to-view';
import { signInCopy } from '@/copy/sign-in';
import { answersAsValues } from '@/domain/criteria/answers';
import { questionsFor } from '@/domain/criteria/criteria';
import { signInProviders } from '@/domain/auth/methods';
import { answersFromSearch, askPlan, carriedFilters } from '@/domain/enquiries/ask-to-view';
import { homeHref, isPublicRef } from '@/domain/homes/home-page';
import { answersToOffer } from '@/domain/profile/offer-back';
import { filtersFromParams, filtersToParams } from '@/domain/search/filters';
import { formatDate, formatDateTime, irishToday } from '@/lib/format';
import { readRenterProfile } from '@/server/accounts/renter-profile';
import { signInProviderModes } from '@/server/auth/auth';
import { currentUser } from '@/server/auth/member';
import { newSignInAttempt } from '@/server/auth/sign-in-steps';
import { type AskingPerson, askableHome, ownEnquiryAbout } from '@/server/enquiries/ask-to-view';
import { publicHomes } from '@/server/homes/public-homes';
import { ButtonLink } from '@/ui/Button';
import { FlowShell } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { askAction, askWithProvider } from './actions';
import { AskFlow } from './AskFlow';

export const metadata: Metadata = { title: copy.pageTitle };

type Query = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Asking to view (section 5, "Asking to view"; UX-AV-1 to UX-AV-9), from the action card on a
 * home's page. No account is needed (UX-AV-1); someone signed in skips "Who should we reply to?",
 * and with their answers kept it is two taps (UX-AV-2). What they told search is carried in to be
 * confirmed (UX-AV-3). The address holds only codes: which screen (`q`), the search's four
 * answers as search put them in its own address, and `sent` or `gone`. Never anything typed.
 *
 * Someone signed in who has asked about this home already goes to their enquiry (UX-AV-9). A
 * home that can't be asked about goes back to its address, which says why.
 */
export default async function AskToViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const back = isPublicRef(ref) ? homeHref(ref) : '/';
  const sent = one(query.sent);
  if (sent === 'email' || sent === 'in')
    return <Sent homeRef={ref} back={back} typed={sent === 'email'} />;
  if (one(query.gone)) return <Gone back={back} />;
  if (one(query.limited)) return <Gone back={back} limited />;

  const [[shown], home, user] = await Promise.all([
    publicHomes({ ref }),
    askableHome(ref),
    currentUser(),
  ]);
  if (!shown || !home) redirect(back);

  const person: AskingPerson | null = user
    ? {
        userId: user.id,
        name: user.name ?? '',
        email: user.email,
        emailVerified: user.emailVerified,
      }
    : null;
  if (person) {
    const existing = await ownEnquiryAbout(person, home);
    if (existing) redirect(`/enquiries/${existing}`);
  }

  const asked = questionsFor(home.criteria);
  const today = irishToday();
  // UX-PF-3: what their profile keeps, offered back for the questions this home asks.
  const kept = person
    ? answersToOffer((await readRenterProfile(person.userId)).answers, asked, today)
    : {};
  // UX-AV-3: what they told search, for them to confirm. It's the newer word.
  const carried = carriedFilters(filtersFromParams(query));
  const searched = answersFromSearch(carried, asked);
  const filled = { ...kept, ...searched };
  const plan = askPlan({
    signedIn: person ? { hasName: person.name.trim().length > 0 } : null,
    asked,
    filled,
  });
  const carriedQuery = new URLSearchParams(filtersToParams(carried)).toString();
  const modes = signInProviderModes();
  return (
    <AskFlow
      action={askAction.bind(null, ref, carriedQuery)}
      providerAction={askWithProvider.bind(null, ref, carriedQuery)}
      providers={signInProviders
        .filter((provider) => modes[provider] !== 'off')
        .map((provider) => ({ id: provider, label: signInCopy.continueWith(provider) }))}
      attempt={newSignInAttempt()}
      homeHref={shown.href}
      address={shown.home.addressLine1}
      operatorName={home.operatorName}
      criteria={home.criteria}
      today={today}
      plan={plan}
      defaults={answersAsValues(filled, home.criteria)}
      contact={person ? { fullName: person.name, email: person.email } : null}
      searched={searchedFor(searched, (date) => formatDate(date))}
      fromProfile={Object.keys(kept).some(
        (key) => !(key in searched) && plan.known.includes(key as (typeof asked)[number]),
      )}
      startAt={one(query.q) ?? null}
    />
  );
}

/** "Sent": who replies, that a person decides, and when they'll hear (section 5, screen 5). */
async function Sent({ homeRef, back, typed }: { homeRef: string; back: string; typed: boolean }) {
  const home = await askableHome(homeRef);
  const [shown] = home ? await publicHomes({ ref: homeRef }) : [];
  const firstViewing = home?.firstViewing ?? null;
  return (
    <FlowShell
      leave={{ kind: 'close', href: back, label: copy.close }}
      primary={
        <ButtonLink href={typed ? back : '/enquiries'} variant="primary" fullWidth="phone">
          {copy.sent.done}
        </ButtonLink>
      }
    >
      <Outcome tone="success" title={copy.sent.title} headingLevel={1}>
        {shown ? <p>{shown.home.addressLine1}</p> : null}
        {typed ? <p>{copy.sent.checkEmail}</p> : null}
        {home ? <p>{copy.sent.text(home.operatorName)}</p> : null}
        <p>
          {firstViewing ? copy.sent.viewings(formatDateTime(firstViewing)) : copy.sent.noViewings}
        </p>
        {typed ? null : <p>{copy.sent.inEnquiries}</p>}
      </Outcome>
    </FlowShell>
  );
}

/** The home stopped taking enquiries before Send: nothing was sent. */
function Gone({ back, limited = false }: { back: string; limited?: boolean }) {
  // M82: past the day's limit, it says so plainly, and when they can ask again.
  const words = limited ? copy.limited : copy.gone;
  return (
    <FlowShell
      leave={{ kind: 'close', href: back, label: copy.close }}
      primary={
        <ButtonLink href="/" variant="primary" fullWidth="phone">
          {words.action}
        </ButtonLink>
      }
    >
      <Outcome tone="info" title={words.title} headingLevel={1}>
        <p>{words.text}</p>
      </Outcome>
    </FlowShell>
  );
}
