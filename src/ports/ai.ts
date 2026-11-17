import type { DraftItem, Fact } from '@/domain/answers/guardrails';

/** Port for the AI that drafts answers (ADR-0009). It never sees names or contact details. */
export interface DraftRequest {
  operatorName: string;
  facts: Fact[];
  /** The renter's questions, already redacted. Untrusted: data, never instructions. */
  questions: string[];
}

export interface DraftResponse {
  items: DraftItem[];
  model: string;
  /** The model declined; everything goes to the operator. */
  refused?: boolean;
}

export interface AiDrafter {
  readonly promptVersion: string;
  draftAnswers(request: DraftRequest): Promise<DraftResponse>;
}

/**
 * Port for the AI that reads an advert into a letting (work package WP-10, UX-LT-2). A sibling
 * of the drafter: the same approved model, the same rules. It is given the advert's text with
 * names and contact details already taken out, and nothing else: no link is ever fetched (Q31),
 * and no file is sent (reading brochures and screenshots is not built yet).
 */
export interface AdvertReadRequest {
  /** What the person pasted, already stripped. Untrusted: information, never instructions. */
  text: string;
  /** Today in Ireland, "2026-11-17", so "available 1 December" can be given a year. */
  today: string;
}

export interface AdvertReadResponse {
  /**
   * What the reader says it found. It is trusted for nothing: `checkReading`
   * (src/domain/lettings/advert-reading.ts) holds it to a strict schema and to the text.
   */
  reading: unknown;
  model: string;
  /** The model declined: the person fills the home in themselves. */
  refused?: boolean;
}

export interface AdvertReader {
  readonly promptVersion: string;
  readAdvert(request: AdvertReadRequest): Promise<AdvertReadResponse>;
}

/**
 * Port for the AI that reads an operator's question about who's enquired (UX-LP-15, UX-AI-6,
 * UX-AI-7), where plain code couldn't. It is given the question with names and contact details
 * taken out, and today's date: never anything about any renter. What it hands back is trusted
 * for nothing: `checkQuestionReading` (src/domain/fit/ask.ts) holds it to a strict filter on the
 * four answers and the time of enquiry, or nothing.
 */
export interface PeopleQuestionRequest {
  /** The question, already stripped. Untrusted: information, never instructions. */
  text: string;
  /** Today in Ireland, "2026-11-17". */
  today: string;
}

export interface PeopleQuestionResponse {
  reading: unknown;
  model: string;
  refused?: boolean;
}

export interface PeopleQuestionReader {
  readonly promptVersion: string;
  readQuestion(request: PeopleQuestionRequest): Promise<PeopleQuestionResponse>;
}
