import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';

/**
 * R8 guardrails around AI-written answers (PRD: AI behaviour and guardrails; CLAUDE.md rule 7).
 * The AI answers only from the letting's facts; anything else goes to the operator.
 */

export interface Fact {
  id: string;
  text: string;
}

export interface DraftItem {
  question: string;
  answer: string | null;
  factIds: string[];
}

/** Questions about protected grounds get fixed, lawful answers that nobody can change (Q7). */
const fixedAnswers: Array<{ test: RegExp; answer: string }> = [
  {
    test: /\b(hap|housing assistance|rent supplement|rental accommodation scheme|ras|social welfare|welfare|on benefits)\b/i,
    answer:
      'Yes. Housing Assistance Payment (HAP) is welcome here, the same as any other way of paying the rent.',
  },
  {
    test: /\b(assistance dog|guide dog|service dog|support dog)s?\b/i,
    answer: 'Yes. Assistance dogs are always welcome, and they never count as pets.',
  },
  {
    test: /\b(child|children|kids?|baby|babies|famil(y|ies)|pregnan\w*|single parent|married|couple|nationality|foreign\w*|visa|religio\w*|age|old|gay|disab\w*|traveller\w*)\b/i,
    answer:
      'Everyone is welcome to apply, and everyone is considered the same way, against the same criteria for this home.',
  },
];

export function fixedAnswerFor(question: string): string | null {
  return fixedAnswers.find((fixed) => fixed.test.test(question))?.answer ?? null;
}

/** "I'd like to speak to someone" goes straight to a person, never the AI. */
export function asksForAPerson(text: string): boolean {
  return /\b(speak|talk|chat)\s+(to|with)\s+(a\s+)?(person|human|someone|somebody|an? agent|the agent|the landlord)\b|\b(real|actual)\s+person\b|\bnot\s+a\s+(bot|robot|ai)\b/i.test(
    text,
  );
}

/** The questions in a message: sentences ending in a question mark. */
export function questionsIn(text: string): string[] {
  return (text.match(/[^.?!\n]*\?/g) ?? [])
    .map((q) =>
      q.trim().replace(/^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^,]*,\s*/i, ''),
    )
    .map((q) => q.charAt(0).toUpperCase() + q.slice(1))
    .filter((q) => q.length > 3)
    .slice(0, 10);
}

/**
 * Removes the renter's name, email addresses and phone numbers before any text goes to the
 * AI provider (data minimisation). The AI never needs to know who is asking.
 */
export function redact(text: string, renterName: string): string {
  let result = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(\+|00)?\d[\d\s()-]{7,}\d/g, '[phone]');
  for (const part of renterName.split(/\s+/).filter((p) => p.length > 1)) {
    result = result.replace(
      new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
      '[name]',
    );
  }
  return result;
}

export type CheckedItem =
  | { question: string; outcome: 'answered'; answer: string; factIds: string[] }
  | {
      question: string;
      outcome: 'to_operator';
      reason: 'no_facts' | 'unknown_facts' | 'protected_ground' | 'too_long' | 'contact_details';
    };

/**
 * Accepts an AI answer only if it cites facts that exist, stays clear of protected grounds,
 * doesn't invent contact details, and is short. Everything else goes to the operator.
 */
export function checkDraftItem(item: DraftItem, facts: Fact[]): CheckedItem {
  const known = new Set(facts.map((f) => f.id));
  if (!item.answer || item.factIds.length === 0) {
    return { question: item.question, outcome: 'to_operator', reason: 'no_facts' };
  }
  if (!item.factIds.every((id) => known.has(id))) {
    return { question: item.question, outcome: 'to_operator', reason: 'unknown_facts' };
  }
  if (findProtectedGrounds(item.answer).length > 0) {
    return { question: item.question, outcome: 'to_operator', reason: 'protected_ground' };
  }
  const cited = facts
    .filter((f) => item.factIds.includes(f.id))
    .map((f) => f.text)
    .join(' ');
  const contacts =
    item.answer.match(
      /https?:\/\/\S+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s-]{7,}\d/gi,
    ) ?? [];
  if (contacts.some((c) => !cited.includes(c))) {
    return { question: item.question, outcome: 'to_operator', reason: 'contact_details' };
  }
  if (item.answer.length > 600) {
    return { question: item.question, outcome: 'to_operator', reason: 'too_long' };
  }
  return {
    question: item.question,
    outcome: 'answered',
    answer: item.answer.trim(),
    factIds: item.factIds,
  };
}
