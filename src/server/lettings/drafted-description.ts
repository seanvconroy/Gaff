import { createHmac, timingSafeEqual } from 'node:crypto';
import { withOrg } from '@/db/client';
import { partialAnswers, withAnswers } from '@/domain/lettings/add-letting';
import {
  canDraftFrom,
  type DescriptionProblem,
  descriptionFacts,
  descriptionProblem,
  tidyDescription,
} from '@/domain/lettings/drafted-description';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';
import { aiTaskIsOffered, runAi } from '@/server/ai/usage';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { loadHome } from './drafts';

/**
 * P10, P11 (the live line's M45): "Draft a description". The AI drafts a home's description from
 * its facts and the lister's own statements, and the draft goes into the field for the lister
 * to read and change. Nothing is saved, and nothing is shown to renters, until the lister saves
 * it. A draft that fails Gaff's checks is never shown: the lister writes their own (P5).
 */

export type DraftedDescription =
  | {
      ok: true;
      description: string;
      /** Proof, for the save, that these words are the draft Gaff gave (`isGaffsDraft`). */
      mark: string;
    }
  /**
   * `needs_facts`: the type of home and the bedrooms aren't chosen yet. `unavailable`: no draft
   * just now (switched off, the budget is spent, no output, or one that failed the checks).
   */
  | { ok: false; reason: 'needs_facts' | 'unavailable' };

/** P4, P8: whether "Draft a description" is offered at all. */
export function descriptionDraftingIsOffered(now: Date = new Date()): Promise<boolean> {
  return aiTaskIsOffered('description', now);
}

function markFor(homeId: string, text: string): Buffer {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`gaff:description-draft:${homeId}:${tidyDescription(text)}`)
    .digest();
}

/**
 * P11: whether a description being saved is, word for word, the draft Gaff gave for this home.
 * The browser hands back the mark Gaff gave with the draft; it can't make one for other words.
 */
export function isGaffsDraft(homeId: string, text: string | undefined, mark: unknown): boolean {
  if (!text || typeof mark !== 'string' || !/^[0-9a-f]{64}$/.test(mark)) return false;
  const expected = markFor(homeId, text);
  const given = Buffer.from(mark, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Drafts a description for a home being added or already live (a draft or a letting: `homeId`).
 * `typed` is what is on the screen now: the home's facts there, chosen but not saved yet, are
 * used over the saved ones. The description on the screen is never sent.
 */
export async function draftDescription(
  member: Member,
  homeId: string,
  typed: Readonly<Record<string, string | undefined>> = {},
  now: Date = new Date(),
): Promise<DraftedDescription> {
  const home = await loadHome(member, homeId);
  if (!home) throw new UserFacingError('We couldn’t find that home.');
  if (!(await descriptionDraftingIsOffered(now))) return { ok: false, reason: 'unavailable' };

  const { description: _ignored, ...onScreen } = partialAnswers('home', typed);
  const answers = withAnswers(home.answers, onScreen);
  if (!canDraftFrom(answers)) return { ok: false, reason: 'needs_facts' };
  // Rule 7: the lister's own statements go without anyone's name or contact details.
  const names = [member.name, member.organisationName, home.detail?.landlord?.name ?? ''].filter(
    Boolean,
  );
  const facts = descriptionFacts(answers, names, now);

  const run = await runAi({
    task: 'description',
    organisationId: member.organisationId,
    now,
    call: (ai) => ai.draftDescription({ facts }),
  });
  const problem: DescriptionProblem | 'unavailable' | null =
    run.outcome === 'ok' ? descriptionProblem(run.output, facts) : 'unavailable';

  await withOrg(member.organisationId, (tx) =>
    recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: homeId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.description_drafted',
      data: { accepted: problem === null, ...(problem ? { problem } : {}) },
    }),
  );
  if (problem !== null || run.outcome !== 'ok') return { ok: false, reason: 'unavailable' };
  const description = tidyDescription(run.output.description);
  return { ok: true, description, mark: markFor(homeId, description).toString('hex') };
}
