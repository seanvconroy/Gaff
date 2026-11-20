import type { Metadata } from 'next';
import { answersAsValues } from '@/domain/criteria/answers';
import { answersToOffer } from '@/domain/profile/offer-back';
import { identityStep } from '@/domain/identity/identity';
import { formatDate, formatShortDate, irishToday } from '@/lib/format';
import { documentsForRenter } from '@/server/documents/renter';
import { keptIdentityOf } from '@/server/identity/kept';
import { keepQuestionFor } from '@/server/identity/renter';
import type { RenterModel } from '@/server/renter/model';
import { personOnRenterPage } from '@/server/renter/person';
import { LinkEnded, loadRenter } from './load';
import type { IdentityView } from './KeptIdentity';
import { RenterHub } from './RenterHub';

export const metadata: Metadata = { title: 'Your enquiry' };

/**
 * Q35: what the checks show of a verified identity, for a page whose checks are open (only a
 * renter an operator has chosen has checks). What they keep is read only for the signed-in
 * person whose enquiry this is, from their own profile.
 * - `?q=keep_id`, where the ID service sends them back: "Keep this?", if the check passed and
 *   isn't the one kept already (UX-PF-8).
 * - At the ID check: the one they keep, unless they said no (`?q=new_id`) (UX-PF-12, UX-PF-14).
 */
async function identityView(
  token: string,
  applicationName: string,
  model: RenterModel,
  userId: string | null,
  query: { q?: string; kept?: string },
): Promise<IdentityView> {
  const now = new Date();
  const keep = query.q === 'keep_id' ? await keepQuestionFor(token, userId) : null;
  let step: IdentityView['step'] = null;
  if (!keep && userId && model.checks.next === 'identity') {
    const found = identityStep({
      kept: await keptIdentityOf(userId),
      applicationName,
      doAgain: query.q === 'new_id',
    });
    if (found.step !== 'provider') {
      const on = formatShortDate(found.kept.verifiedAt, now);
      step =
        found.step === 'use_kept'
          ? { step: 'use_kept', name: found.kept.verifiedName, on }
          : { step: 'check_name', name: found.kept.verifiedName, on, applied: applicationName };
    }
  }
  return {
    step,
    keep: keep
      ? {
          name: keep.verifiedName,
          on: formatDate(keep.verifiedAt, now),
          signedIn: userId !== null,
        }
      : null,
    kept: query.kept === 'yes' || query.kept === 'no' ? query.kept : null,
  };
}
export const dynamic = 'force-dynamic';

/**
 * R9, UX-PP-7, UX-PP-8: the renter's private page. No account; the link is the key. One link
 * from the first reply to move-in, and it always shows where they stand now. The address holds
 * only codes: which screen of a flow (`q`), and a problem to say once. Never anything personal.
 */
export default async function RenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    q?: string;
    change?: string;
    check_problem?: string;
    offer_problem?: string;
    kept?: string;
    kept_id?: string;
    id_problem?: string;
    document_problem?: string;
  }>;
}) {
  const { token } = await params;
  const { q, change, check_problem, offer_problem, kept, kept_id, id_problem, document_problem } =
    await searchParams;
  const loaded = await loadRenter(token, { hub: true });
  if (!loaded) return <LinkEnded />;
  const { model } = loaded;
  // UX-RH-4: a signed-in renter whose enquiry this is has it added to their Enquiries. UX-PF-3:
  // their kept answers are offered back on the questions this home asks, and only there.
  const person = await personOnRenterPage(token, loaded.page, { attach: true });
  const open = model.view === 'checks' ? await loaded.isOpen() : false;
  const identity = open
    ? await identityView(token, loaded.page.application.fullName, model, person?.userId ?? null, {
        q,
        kept: kept_id,
      })
    : null;
  // BA-16: the work and income documents, at that check, for an open page only.
  const documentsView =
    open && model.checks.next === 'income'
      ? await documentsForRenter(token, person?.userId ?? null)
      : null;
  const offered =
    person && model.view === 'questions'
      ? answersToOffer(person.kept.answers, model.questions.asked, irishToday())
      : {};
  return (
    <RenterHub
      token={token}
      model={model}
      options={{
        q,
        changing: change === 'answers',
        // UX-RN-14: only the checks ask who's looking; every other page needs the link alone.
        open,
        sentTo: loaded.sentTo,
        checkProblem: check_problem,
        offerProblem: offer_problem,
        idProblem: id_problem,
        identity,
        documents: documentsView
          ? {
              view: documentsView,
              identity: documentsView.identity
                ? {
                    name: documentsView.identity.name,
                    on: formatDate(documentsView.identity.verifiedAt),
                  }
                : null,
            }
          : null,
        documentProblem: document_problem,
        kept: kept === 'yes' || kept === 'no' ? kept : null,
        offeredAnswers:
          Object.keys(offered).length > 0
            ? answersAsValues(offered, model.questions.criteria)
            : null,
      }}
    />
  );
}
