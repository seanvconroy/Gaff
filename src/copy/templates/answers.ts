import { possessive } from './first-reply';

/**
 * R8: the email that answers a renter's questions. The frame is fixed wording; the answers
 * inside come from the letting's facts (checked by the guardrails) or are fixed, lawful
 * answers. It's signed as the AI assistant, so the renter always knows who wrote it.
 */
export const ANSWER_TEMPLATE = 'answer@1';
export const OPERATOR_ANSWER_TEMPLATE = 'operator_answer@1';

function greeting(renterName: string): string {
  const first = renterName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function answersEmail(input: {
  renterName: string;
  operatorName: string;
  address: string;
  answers: Array<{ question: string; answer: string }>;
  passedToPerson: boolean;
}) {
  const lines = [greeting(input.renterName), ''];
  for (const { question, answer } of input.answers) {
    lines.push(`You asked: ${question}`, answer, '');
  }
  if (input.passedToPerson) {
    lines.push(
      `I’ve passed your other ${input.answers.length > 0 ? 'question' : 'questions'} to a person at ${input.operatorName}. They’ll reply to you by email.`,
      '',
    );
  }
  lines.push('If you have any other questions, just reply to this email.', '');
  lines.push(`${possessive(input.operatorName)} AI assistant`);
  return { subject: `Re: ${input.address}`, body: lines.join('\n') };
}

/** R8: a person's own answer, from the operator's questions page. */
export function operatorAnswerEmail(input: {
  renterName: string;
  operatorName: string;
  personName: string;
  address: string;
  question: string;
  answer: string;
}) {
  return {
    subject: `Re: ${input.address}`,
    body: [
      greeting(input.renterName),
      '',
      `You asked: ${input.question}`,
      input.answer,
      '',
      'If you have any other questions, just reply to this email.',
      '',
      `${input.personName}, ${input.operatorName}`,
    ].join('\n'),
  };
}
