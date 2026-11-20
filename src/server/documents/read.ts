import type { DocumentKind } from '@/domain/documents/kinds';
import { checkDocumentReading, type DocumentReading } from '@/domain/documents/reading';
import type { AiProvider } from '@/ports/ai';
import { runAi } from '@/server/ai/usage';
import type { PreparedDocument } from './files';

/**
 * P37, P5 (BA-16): one document read by the `document` task of the one AI adapter, through
 * `runAi`, so the call is logged (never its words), kept to the month's budget and honours the
 * switch. The file goes alone, with the kind the renter said and today's date: never their name
 * or anything else about them (rule 7, as ADR-0026 decides for a document, which can't be
 * stripped first). What comes back is held by `checkDocumentReading`; anything it refuses, and
 * any outcome but "ok", is no reading at all, and people take over (P5).
 */
export async function readDocument(input: {
  document: PreparedDocument;
  saidKind: DocumentKind;
  today: string;
  /** For the cost per organisation only (P3). */
  organisationId: string;
  ai?: AiProvider;
}): Promise<DocumentReading | null> {
  const run = await runAi({
    task: 'document',
    organisationId: input.organisationId,
    ai: input.ai,
    call: (ai) =>
      ai.readDocument({
        file: { mediaType: input.document.type, base64: input.document.bytes.toString('base64') },
        saidKind: input.saidKind,
        today: input.today,
      }),
  });
  if (run.outcome !== 'ok') return null;
  return checkDocumentReading(run.output, input.today);
}
