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
import { requirePerson } from '@/server/context/current-person';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { ProfileRows, type ProfileView } from './ProfileRows';

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
 * SEAMS: "What you're looking for" is the chips of a saved search (WP-23), and "Identity" is a
 * verified identity kept by choice (WP-24). Each adds its row here when it is built.
 */
export default async function ProfilePage() {
  const person = await requirePerson();
  const [kept, signIn, passkey] = await Promise.all([
    readRenterProfile(person.userId),
    signInMethodsOf(person.userId),
    hasPasskey(person.userId),
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
        <ProfileRows view={view} />
      </Narrow>
    </Stack>
  );
}
