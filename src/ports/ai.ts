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
