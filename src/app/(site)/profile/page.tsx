import type { Metadata } from 'next';
import { profileCopy } from '@/copy/profile';
import { earningLabels } from '@/domain/applications/apply';
import { stayLabel } from '@/domain/criteria/answers';
import { answersAsFormValues } from '@/domain/profile/forms';
import { incomeAsTyped } from '@/domain/profile/offer-back';
import { formatDate, formatEuro } from '@/lib/format';
import { readRenterProfile } from '@/server/accounts/renter-profile';
import { signInMethodsOf } from '@/server/accounts/sign-in-methods';
import { hasPasskey } from '@/server/auth/confirm-request';
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
 * SEAM: "Identity" is a verified identity kept by choice (WP-24), which adds its row here.
 */
export default async function ProfilePage() {
  const person = await requirePerson();
  const [kept, signIn, passkey, teams, saved] = await Promise.all([
    readRenterProfile(person.userId),
    signInMethodsOf(person.userId),
    hasPasskey(person.userId),
    // UX-AG-17: the teams they work in, each to leave from here.
    membersOf(person.userId).then(teamsToLeave),
    // "What you're looking for" (WP-23): the chips of their saved searches.
    savedSearchesOf(person.userId),
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
    looking: { searches: searchRows(saved.searches), alerts: saved.alerts },
    nothingYet: !kept.exists,
    signIn: {
      methods: signIn.methods.map((method) => profileCopy.signIn.method(method)),
      passkeys: signIn.passkeys,
    },
    hasPasskey: passkey,
    letsHomes: person.contexts.some((context) => context.side === 'letting'),
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
