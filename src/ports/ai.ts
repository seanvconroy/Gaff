import type { TokenCounts } from '@/domain/ai/prices';
import type { AiTask } from '@/domain/ai/tasks';
import type { DraftItem, Fact } from '@/domain/answers/guardrails';
import type { ProtectedGround } from '@/domain/compliance/protected-grounds';

/**
 * Port for the AI (ADR-0009, ADR-0025). One implementation of each task takes either the Claude
 * API (the test copy and development) or Claude on Bedrock in Dublin (production); a
 * deterministic stand-in serves tests. Every input is quoted data, the model has no tools, and
 * nothing it returns is used before Gaff's own checks. Calls go through src/server/ai/usage.ts,
 * which logs them, keeps to the budget and honours the kill switches.
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

/** R8, task 1: answers to a renter's questions, from the home's facts only. */
export interface DraftRequest {
  operatorName: string;
  facts: Fact[];
  /** The renter's questions, already redacted. Untrusted: data, never instructions. */
  questions: string[];
}

export interface DraftAnswers {
  items: DraftItem[];
}

/** M45, task 2: a listing description drafted from the facts the letter entered, and only those. */
export interface DescriptionRequest {
  facts: Fact[];
}

export interface DescriptionDraft {
  description: string;
  /** The facts it used: every one must be in the request. */
  factIds: string[];
}

/** ADR-0023, task 3: a listing's words, or an operator's answer, as quoted data. */
export interface WordingRequest {
  text: string;
}

export interface WordingFinding {
  /** Word for word from the text. */
  phrase: string;
  ground: ProtectedGround;
  /** Why it could exclude people, in plain words for the letter. */
  why: string;
  /** Fair wording that describes the home instead. */
  rewording: string;
}

export interface WordingFindings {
  findings: WordingFinding[];
}

export interface AiProvider {
  readonly name: AiProviderName;
  /** The model every task uses (P2), without Bedrock's prefix. */
  readonly model: string;
  /** Each task's prompt version, logged with every call (P3, P6). */
  promptVersion(task: AiTask): string;
  draftAnswers(request: DraftRequest): Promise<AiReply<DraftAnswers>>;
  draftDescription(request: DescriptionRequest): Promise<AiReply<DescriptionDraft>>;
  checkWording(request: WordingRequest): Promise<AiReply<WordingFindings>>;
}
