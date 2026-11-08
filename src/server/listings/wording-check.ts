import { confirmedFindings } from '@/domain/ai/validators';
import type { WordingFinding } from '@/ports/ai';
import { runAi } from '@/server/ai/usage';

/**
 * ADR-0023, P12, P13: after the word list, the AI looks for wording that excludes people on a
 * protected ground, directly or indirectly. Only phrases copied word for word from the text
 * count. Null means the check couldn't run (switched off, over budget, failed): the word list
 * alone has checked the words, and the listing carries on (P5).
 */
export async function unfairWording(
  organisationId: string,
  text: string,
): Promise<WordingFinding[] | null> {
  if (text.trim().length === 0) return [];
  const run = await runAi({
    task: 'wording',
    organisationId,
    call: (ai) => ai.checkWording({ text }),
  });
  if (run.outcome !== 'ok') return null;
  return confirmedFindings(run.output.findings, text);
}
