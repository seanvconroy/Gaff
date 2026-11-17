import { forwardingHref } from '@/domain/enquiries/forwarding';
import type { Portal } from '@/domain/lettings/setup';
import { withReturn } from '@/domain/navigation/return-to';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import { hasTeam } from '@/domain/team/permissions';

/**
 * The setup checklist (UX-GR-1 to UX-GR-4; section 9, "The setup checklist"): the first of
 * Today's four blocks. A ring ("2 of 3"), the next unfinished step with one line of why, and one
 * button: the only primary button Today ever has (UX-HM-6). It can't be dismissed. It shows
 * until every step is done, then never again.
 *
 * Every step ticks itself from what has actually happened, never from a box someone ticked:
 *
 * | Step | Agency admin | Agency agent | Private landlord | Done when |
 * | Add your first letting | 1 | 1 | 1 ("Add your home") | A letting went live and its test enquiry was seen answered, or it is ready and held only by the agency being confirmed |
 * | Send your Daft and MyHome enquiries to Gaff | 2, if they advertise there | | 2, if they advertise there | Mail came through the forwarding rule |
 * | Invite your team | 3 | | | One invite is sent, or "It's just me" is chosen |
 *
 * UX-GR-3: a first letting ends with a test enquiry the person watches being answered, so the
 * first step isn't done at go-live: it moves on to "See Gaff answer an enquiry" until a test
 * has been seen (the letting's own, or the forwarding flow's, which shows the same reply), or a
 * real enquiry has arrived and there is nothing left to prove.
 *
 * UX-GR-2: nothing that isn't needed yet is on it (bank details, an agreement template,
 * calendar sync, a photo, a private landlord's identity check: that one is a step inside going
 * live). UX-GR-4: someone who joined by invite joined a team that is already set up, and has no
 * checklist: their Today opens on what needs them, or on "Add a letting".
 */

export type SetupStepCode = 'add_letting' | 'see_test' | 'forwarding' | 'invite_team';

/** Who is signed in, for the checklist's columns. */
export type ChecklistKind = 'agency_admin' | 'agency_agent' | 'private_landlord';

export interface SetupFacts {
  organisationKind: OrganisationKind;
  role: 'admin' | 'negotiator';
  /** They joined the organisation by accepting an invite (UX-GR-4). */
  joinedByInvite: boolean;
  /** Set up already finished once for this person here: it never comes back. */
  finishedBefore: boolean;
  /** A letting has gone live, or a person decided to and it waits for the agency's confirming. */
  lettingLiveOrHeld: boolean;
  /** A letting that went live and has no enquiry yet: where its test enquiry is sent from. */
  testableLettingId: string | null;
  /** A test enquiry was seen answered: a letting's own, or one back through forwarding. */
  testSeen: boolean;
  /** A real enquiry has arrived for any home. */
  realEnquiry: boolean;
  /** A draft in set-up, where "Add your first letting" carries on from. */
  draftLettingId: string | null;
  /** Every portal any letting says it is advertised on (UX-LT-20). */
  advertisedOn: readonly Portal[];
  /** Mail has come through the organisation's forwarding rule. */
  forwardingInPlace: boolean;
  /** One invite was sent, or "It's just me" was chosen. */
  teamAnswered: boolean;
}

export interface SetupStep {
  code: SetupStepCode;
  done: boolean;
}

export interface SetupChecklist {
  kind: ChecklistKind;
  /** The steps, in order, each done or not. At most three (UX-GR-1). */
  steps: SetupStep[];
  done: number;
  total: number;
  /** The one step to do now, and where its one button leads. */
  next: { code: SetupStepCode; href: string; lettingId: string | null };
  /** The portals the forwarding step names. */
  portals: readonly Portal[];
}

export const MAX_SETUP_STEPS = 3;

export function checklistKind(facts: Pick<SetupFacts, 'organisationKind' | 'role'>): ChecklistKind {
  if (facts.organisationKind === 'private_landlord') return 'private_landlord';
  return facts.role === 'admin' ? 'agency_admin' : 'agency_agent';
}

/** Where adding a letting opens: the draft in set-up, or a new one. Closing it comes to Today. */
function addLettingHref(draftId: string | null): string {
  return draftId ? `/lettings/${draftId}` : withReturn('/lettings/new', '/today');
}

/** The checklist for this person, or null when they have none or it is complete. */
export function setupChecklistFor(facts: SetupFacts): SetupChecklist | null {
  if (facts.joinedByInvite || facts.finishedBefore) return null;
  const kind = checklistKind(facts);
  const firstLetting =
    facts.lettingLiveOrHeld &&
    (facts.testSeen || facts.realEnquiry || facts.testableLettingId === null);
  const portals = facts.advertisedOn.filter((portal, index, all) => all.indexOf(portal) === index);
  const steps: SetupStep[] = [{ code: 'add_letting', done: firstLetting }];
  if (kind !== 'agency_agent' && portals.length > 0) {
    steps.push({ code: 'forwarding', done: facts.forwardingInPlace });
  }
  if (kind === 'agency_admin' && hasTeam(facts.organisationKind)) {
    steps.push({ code: 'invite_team', done: facts.teamAnswered });
  }
  const left = steps.find((step) => !step.done);
  if (!left) return null;
  const done = steps.filter((step) => step.done).length;
  return {
    kind,
    steps,
    done,
    total: steps.length,
    next: nextStep(left.code, facts),
    portals,
  };
}

function nextStep(code: SetupStepCode, facts: SetupFacts): SetupChecklist['next'] {
  switch (code) {
    case 'add_letting':
      // Live, with its test still to see: the step moves on to watching Gaff answer one.
      if (facts.lettingLiveOrHeld && facts.testableLettingId) {
        return {
          code: 'see_test',
          href: withReturn(`/lettings/${facts.testableLettingId}/test-enquiry`, '/today'),
          lettingId: facts.testableLettingId,
        };
      }
      return { code, href: addLettingHref(facts.draftLettingId), lettingId: facts.draftLettingId };
    case 'forwarding':
      return {
        code,
        href: forwardingHref({ lettingId: facts.testableLettingId }),
        lettingId: null,
      };
    case 'invite_team':
      return { code, href: withReturn('/settings/team/invite', '/today'), lettingId: null };
    case 'see_test':
      return { code, href: '/today', lettingId: null };
  }
}

/** Whether the checklist is complete: nothing left on it, for someone who had one. */
export function setupComplete(facts: SetupFacts): boolean {
  return !facts.joinedByInvite && setupChecklistFor({ ...facts, finishedBefore: false }) === null;
}
