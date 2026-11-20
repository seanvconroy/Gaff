import { eq } from 'drizzle-orm';
import { aiProvider } from '@/adapters/ai';
import { withOrg } from '@/db/client';
import { lettingDrafts } from '@/db/schema';
import { draftAnswersSchema, withAnswers } from '@/domain/lettings/add-letting';
import { checkReading, stripPersonalDetails } from '@/domain/lettings/advert-reading';
import { isSwitchedOff } from '@/domain/ai/tasks';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import type { AiProvider } from '@/ports/ai';
import { runAi } from '@/server/ai/usage';
import type { Member } from '@/server/auth/member';
import { recordFunnelStep } from '@/server/funnels/steps';
import { recordEvent } from '@/server/record/events';
import { startDraftIn } from './drafts';

/**
 * Reading an advert into a letting (work package WP-10: UX-LT-1 to UX-LT-3, UX-LT-6, UX-LT-7).
 *
 * The first screen of adding a letting has one box for a pasted advert or a description. This
 * reads what was put in it, behind the AI port (src/ports/ai.ts), and starts a draft with what
 * was found, for the person to review. What is kept is decided by code, not by the reader
 * (src/domain/lettings/advert-reading.ts):
 *   - names, phone numbers, email addresses and links are taken out before the text is read;
 *   - the text is information, never instructions (rule 7);
 *   - a value is kept only with the words it came from, and nothing is guessed;
 *   - lines about who should apply are left out, with their reason (rule 3).
 * No link is ever fetched (Q31).
 *
 * NOT BUILT YET: reading a brochure or screenshots (UX-LT-1 also lists PDF, Word and images).
 * The port carries text only, and the rules above need the text a value came from. Until a
 * file can be turned into checked text, the first screen has no attach button
 * (`advertFilesAreRead`).
 */

/**
 * Whether reading is offered at all: the `ADVERT_READER` setting, and the AI's `advert` task not
 * switched off (AI_TASKS_OFF, P8). Off, the first screen offers only "Fill it in myself", which
 * never needs the reader (UX-AI-12).
 */
export function advertReaderIsOn(): boolean {
  const config = env();
  return config.ADVERT_READER === 'on' && !isSwitchedOff('advert', config.AI_TASKS_OFF);
}

/** UX-LT-1: files aren't read yet (see above), so the attach button isn't shown. */
export function advertFilesAreRead(): boolean {
  return false;
}

/** How long a person is kept waiting before the manual route is offered instead (UX-AI-13). */
const PATIENCE_MS = 25_000;

export type ReadOutcome =
  /** A draft, on its review screen. */
  | { kind: 'read'; id: string }
  /** The text says nothing Gaff could find about a home. */
  | { kind: 'nothing_found' }
  /** The reader is slow, down, or handed back something that isn't a reading (UX-AI-12). */
  | { kind: 'unavailable' };

function inTime<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The reader took too long')), PATIENCE_MS);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * UX-LT-2: reads what the person pasted and starts a draft from it, opened at its review.
 * `draftId` is a draft that so far holds only an advert link (UX-LT-8): it is carried on with.
 */
export async function readAdvertIntoDraft(
  member: Member,
  input: { text: string; draftId?: string | null },
  ai: AiProvider = aiProvider(),
): Promise<ReadOutcome> {
  if (!advertReaderIsOn()) return { kind: 'unavailable' };
  // UX-LT-7, UX-AI-8: the reader never sees who is letting the home, or how to reach them.
  const text = stripPersonalDetails(input.text, [member.name, member.organisationName]);
  const today = irishToday();

  let raw: unknown;
  try {
    // A refusal, a failure, a paused budget or no reading at all: the manual route (P5).
    const run = await inTime(
      runAi({
        task: 'advert',
        organisationId: member.organisationId,
        ai,
        call: (provider) => provider.readAdvert({ text, today }),
      }),
    );
    if (run.outcome !== 'ok') return { kind: 'unavailable' };
    raw = run.output;
  } catch (error) {
    // The kind of failure only: never the text, which is the lister's (rule 8).
    console.error('Reading an advert failed:', error instanceof Error ? error.name : 'unknown');
    return { kind: 'unavailable' };
  }
  const checked = checkReading(text, raw, today);
  if (!checked) {
    console.error('Reading an advert failed: the reading broke its schema');
    return { kind: 'unavailable' };
  }
  const { answers, reading, dropped } = checked;
  if (reading.found === 0 && Object.keys(reading.suggested).length === 0) {
    return { kind: 'nothing_found' };
  }

  return withOrg(member.organisationId, async (tx) => {
    const [linked] = input.draftId
      ? await tx
          .select()
          .from(lettingDrafts)
          .where(eq(lettingDrafts.id, input.draftId))
          .for('update')
      : [];
    let id: string;
    // A draft that holds only a link so far carries on as this home. Any other is left alone.
    if (linked && linked.origin === 'manual' && linked.step === null) {
      id = linked.id;
      await tx
        .update(lettingDrafts)
        .set({
          origin: 'advert',
          answers: withAnswers(draftAnswersSchema.parse(linked.answers), answers),
          step: 'review',
          reading,
        })
        .where(eq(lettingDrafts.id, id));
    } else {
      ({ id } = await startDraftIn(tx, member, {
        origin: 'advert',
        answers,
        review: true,
        reading,
      }));
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: id,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.advert_read',
      subject: { type: 'letting', id },
      data: {
        reader: ai.name,
        found: reading.found,
        dropped,
        leftOut: reading.leftOut.length,
        unsure: Object.values(reading.sources).filter((source) => source && !source.sure).length,
      },
    });
    await recordFunnelStep(tx, { step: 'import.source_given', subjectId: id });
    return { kind: 'read', id };
  });
}
