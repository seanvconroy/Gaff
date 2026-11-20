import type { Metadata } from 'next';
import { profileCopy } from '@/copy/profile';
import { earningLabels } from '@/domain/applications/apply';
import { stayLabel } from '@/domain/criteria/answers';
import { answersAsFormValues } from '@/domain/profile/forms';
import { incomeAsTyped } from '@/domain/profile/offer-back';
import { formatDate, formatDateTime, formatEuro } from '@/lib/format';
import { readRenterProfile } from '@/server/accounts/renter-profile';
import { profileCopy as pc } from '@/copy/profile';
import { providerProblemWords } from '@/copy/sign-in';
import { isAppleRelayAddress, signInProviderSchema, signInProviders } from '@/domain/auth/methods';
import { maskedMobile } from '@/domain/auth/mobile';
import { signInProviderModes } from '@/server/auth/auth';
import { currentSession } from '@/server/auth/member';
import { signInOverview } from '@/server/auth/security';
import { staffFrom } from '@/server/auth/staff';
import { keptIdentityOf } from '@/server/identity/kept';
import { personCheckOf } from '@/server/identity/person-checks';
import { settlePersonIdentity } from '@/server/identity/provider-results';
import { membersOf } from '@/server/auth/member';
import { requirePerson } from '@/server/context/current-person';
import { savedSearchesOf } from '@/server/saved/searches';
import { teamsToLeave } from '@/server/team/team';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { searchRows } from '../saved/rows';
import { ProfileRows, type ProfileView } from './ProfileRows';
import { YourTeams } from './YourTeams';

export const metadata: Metadata = { title: profileCopy.title };

/**
 * Profile (UX-PF-1 to UX-PF-6, Q25): what Gaff keeps so the person never types the same thing
 * twice, each row changed or removed on its own. Only the person themselves sees it: it is read
 * through `withPerson()` for the signed-in person, and no operator's path can reach it (UX-AC-5).
 *
 * It holds what sections 5 and 11 allow and nothing else: contact details, the fixed four
 * answers and how they earn, kept by choice. No photo, no free text, no document, nothing about
 * a protected ground, and never housing support as a fact of its own (rule 3).
 *
 * "What you're looking for" is the chips of each saved search (WP-23), each removable, with its
 * emails on or off.
 *
 * "ID check" is a verified identity they keep (UX-PF-9 to UX-PF-11), with "My name has
 * changed" to do it again. It shows only when one is kept: nobody is invited to verify here
 * (UX-PF-13).
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    identity_problem?: string;
    need?: string;
    connected?: string;
    not_connected?: string;
    error?: string;
  }>;
}) {
  const person = await requirePerson();
  const query = await searchParams;
  const { identity_problem } = query;
  const session = await currentSession();
  // P54: back from Stripe's pages, a check of their own is read from Stripe if it's due.
  await settlePersonIdentity(person.userId);
  const [kept, signIn, teams, saved, identity, redo] = await Promise.all([
    readRenterProfile(person.userId),
    // BA-8: how they sign in, and where they're signed in now.
    signInOverview(person.userId, session?.session.id ?? null),
    // UX-AG-17: the teams they work in, each to leave from here.
    membersOf(person.userId).then(teamsToLeave),
    // "What you're looking for" (WP-23): the chips of their saved searches.
    savedSearchesOf(person.userId),
    keptIdentityOf(person.userId),
    personCheckOf(person.userId),
  ]);
  const a = kept.answers;
  const view: ProfileView = {
    name: person.nameKnown ? person.name : null,
    email: person.email,
    mobile: kept.mobile,
    answers: {
      people:
        a.occupants === undefined
          ? null
          : a.occupants === 1
            ? profileCopy.answers.justMe
            : profileCopy.answers.peopleCount(a.occupants),
      pets:
        a.hasPets === undefined
          ? null
          : a.hasPets
            ? profileCopy.answers.yes
            : profileCopy.answers.no,
      moveIn: a.moveInDate ? profileCopy.answers.by(formatDate(a.moveInDate)) : null,
      stay: a.stayMonths === undefined ? null : stayLabel(a.stayMonths),
      values: answersAsFormValues(a),
    },
    income:
      kept.earning && kept.monthlyIncomeCents
        ? {
            earning: earningLabels[kept.earning],
            amount: profileCopy.income.aMonth(formatEuro(kept.monthlyIncomeCents)),
            saidOn: kept.incomeAt ? profileCopy.income.saidOn(formatDate(kept.incomeAt)) : null,
            values: {
              earning: kept.earning,
              monthlyIncome: incomeAsTyped(kept.monthlyIncomeCents),
            },
          }
        : null,
    keepsDetails: kept.keepsDetails,
    looking: { searches: await searchRows(saved.searches), alerts: saved.alerts },
    nothingYet: !kept.exists,
    signIn: signInView(signIn, query, Boolean(staffFrom(session?.user))),
    hasPasskey: signIn.passkeys.length > 0,
    letsHomes: person.contexts.some((context) => context.side === 'letting'),
    identity: identity
      ? {
          value: profileCopy.identity.value(identity.verifiedName, formatDate(identity.verifiedAt)),
          notPassed: redo?.status === 'not_passed',
          problem: identity_problem ?? null,
        }
      : null,
  };
  return (
    <Stack gap={8}>
      <PageHeader title={profileCopy.title} lead={profileCopy.lead} />
      <Narrow>
        <Stack gap={8}>
          <ProfileRows view={view} />
          <YourTeams teams={teams} />
        </Stack>
      </Narrow>
    </Stack>
  );
}

const providerNames = { google: 'Google', apple: 'Apple' } as const;

/** BA-8 (AU6 to AU8): "How you sign in" and "Signed-in devices", in words. */
function signInView(
  overview: Awaited<ReturnType<typeof signInOverview>>,
  query: { need?: string; connected?: string; not_connected?: string; error?: string },
  staff: boolean,
): ProfileView['signIn'] {
  const modes = signInProviderModes();
  const connected = signInProviderSchema.safeParse(query.connected);
  const notConnected = signInProviderSchema.safeParse(query.not_connected);
  return {
    email: overview.email,
    mobile: overview.mobile ? maskedMobile(overview.mobile) : null,
    hasPasskey: overview.passkeys.length > 0,
    providers: signInProviders
      // A provider that's off isn't offered, unless it's already one of their ways in.
      .filter((provider) => modes[provider] !== 'off' || overview.providers[provider])
      .map((provider) => {
        const on = overview.providers[provider];
        return {
          provider,
          name: providerNames[provider],
          connected: on ? pc.signIn.connectedOn(formatDate(on)) : null,
          stays:
            provider === 'apple' && isAppleRelayAddress(overview.email)
              ? pc.signIn.hideMyEmail
              : null,
        };
      }),
    passkeys: overview.passkeys.map((key) => ({
      id: key.id,
      name: key.name ?? pc.signIn.passkeyNamed,
      added: key.addedOn ? pc.signIn.passkeyAdded(formatDate(key.addedOn)) : null,
    })),
    devices: overview.devices.map((device) => ({
      id: device.id,
      words: device.words,
      when: pc.devices.lastUsed(formatDateTime(device.lastActive)),
      current: device.current,
    })),
    connected: connected.success && !query.error ? providerNames[connected.data] : null,
    problem: notConnected.success
      ? query.error === 'slow_down'
        ? providerProblemWords('slow_down', notConnected.data, 60)
        : pc.signIn.problems.connect(providerNames[notConnected.data])
      : null,
    staffNeedsPasskey: staff && query.need === 'passkey',
  };
}
