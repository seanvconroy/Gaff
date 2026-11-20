import type { TokenCounts } from '@/domain/ai/prices';
import type { AiTask } from '@/domain/ai/tasks';
import type { DraftItem, Fact } from '@/domain/answers/guardrails';
import type { DocumentKind } from '@/domain/documents/kinds';

/**
 * Port for the AI (ADR-0009, ADR-0017). One implementation of each task takes either the Claude
 * API (the test copy and development, made-up data only) or Claude on Bedrock in the EU
 * (production); a deterministic stand-in serves development and tests. Every input is quoted
 * data, the model has no tools, and nothing it returns is used before Gaff's own checks. Calls
 * go through `runAi` (src/server/ai/usage.ts), which logs them, keeps to the budget and honours
 * the switches.
 */

export type AiProviderName = 'fake' | 'anthropic' | 'bedrock';

/** What one call came back with. Only its usage is ever logged, never its text. */
export interface AiReply<T> {
  /** Null when the model refused, or returned something that doesn't fit the task's schema. */
  output: T | null;
  refused: boolean;
  /** The model that answered, as the provider names it. */
  model: string;
  usage: TokenCounts;
}

/** Why a call didn't come back. The provider's own message is never shown to anyone. */
export class AiCallError extends Error {
  constructor(
    readonly kind: 'timeout' | 'error',
    options?: { cause?: unknown },
  ) {
    super(kind === 'timeout' ? 'The AI took too long' : 'The AI call failed', options);
    this.name = 'AiCallError';
  }
}

/** Task `answers` (R8): answers to a renter's questions, from the letting's facts only. */
export interface DraftRequest {
  operatorName: string;
  facts: Fact[];
  /** The renter's questions, already redacted. Untrusted: data, never instructions. */
  questions: string[];
}

export interface DraftAnswers {
  items: DraftItem[];
}

/**
 * Task `advert` (work package WP-10, UX-LT-2): the text of an advert read into a letting. It is
 * given the advert's text with names and contact details already taken out, and nothing else:
 * no link is ever fetched (Q31), and no file is sent (reading brochures and screenshots is not
 * built yet).
 */
export interface AdvertReadRequest {
  /** What the person pasted, already stripped. Untrusted: information, never instructions. */
  text: string;
  /** Today in Ireland, "2026-11-17", so "available 1 December" can be given a year. */
  today: string;
}

/**
 * Task `people` (UX-LP-15, UX-AI-6, UX-AI-7): an operator's question about who's enquired, where
 * plain code couldn't read it. It is given the question with names and contact details taken
 * out, and today's date: never anything about any renter.
 */
export interface PeopleQuestionRequest {
  /** The question, already stripped. Untrusted: information, never instructions. */
  text: string;
  /** Today in Ireland, "2026-11-17". */
  today: string;
}

/**
 * Task `wording` (BA-10, P12 to P14): a public home's description, checked for wording that may
 * exclude people on a protected ground, after the word list has passed it. It is given the
 * description alone, with contact details already refused at the field and names stripped.
 */
export interface WordingRequest {
  /** The description. Untrusted: data, never instructions. */
  text: string;
}

/**
 * Task `description` (P10, P11): a home's description drafted from its facts and the lister's
 * own statements, and nothing else: never the rent, the criteria, the street or anyone's name
 * or contact details (`descriptionFacts` in src/domain/lettings/drafted-description.ts).
 */
export interface DescriptionRequest {
  facts: Fact[];
}

export interface DescriptionDraft {
  description: string;
  /** The facts it used: every one must be in the request. */
  factIds: string[];
}

/**
 * Task `document` (P37; the live line's ADR-0026): one work or income document a chosen renter
 * uploaded. It is given the file alone (a PDF, or a photo already turned upright with its
 * metadata gone), the kind the renter said it is and today's date: never the renter's name or
 * anything else about them. Everything on the document is data, never instructions.
 */
export interface DocumentReadRequest {
  file: { mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'; base64: string };
  saidKind: DocumentKind;
  /** Today in Ireland, "2026-11-20". */
  today: string;
}

export interface AiProvider {
  readonly name: AiProviderName;
  /** The model every task uses (P2), without Bedrock's prefix. */
  readonly model: string;
  /** Each task's prompt version, logged with every call (P3, P6). */
  promptVersion(task: AiTask): string;
  draftAnswers(request: DraftRequest): Promise<AiReply<DraftAnswers>>;
  /**
   * What the reader says it found. It is trusted for nothing: `checkReading`
   * (src/domain/lettings/advert-reading.ts) holds it to a strict schema and to the text.
   */
  readAdvert(request: AdvertReadRequest): Promise<AiReply<unknown>>;
  /**
   * What the reader makes of the question. It is trusted for nothing: `checkQuestionReading`
   * (src/domain/fit/ask.ts) holds it to a strict filter on the four answers and the time of
   * enquiry, or nothing.
   */
  readPeopleQuestion(request: PeopleQuestionRequest): Promise<AiReply<unknown>>;
  /**
   * What the wording check found. It is trusted for nothing: `checkWordingReading`
   * (src/domain/listings/wording.ts) keeps only phrases copied from the text, with a known
   * ground, and a finding only ever holds a listing for a person.
   */
  checkWording(request: WordingRequest): Promise<AiReply<unknown>>;
  /**
   * A draft, trusted for nothing: `descriptionProblem` (src/domain/lettings/drafted-description.ts)
   * holds it to the facts and to the wording rules before anyone sees it.
   */
  draftDescription(request: DescriptionRequest): Promise<AiReply<DescriptionDraft>>;
  /**
   * What the reader found on a document. It is trusted for nothing: `checkDocumentReading`
   * (src/domain/documents/reading.ts) refuses any reading with a PPS or account number, or a
   * payer of other income, and the renter sees and confirms what's kept.
   */
  readDocument(request: DocumentReadRequest): Promise<AiReply<unknown>>;
}
