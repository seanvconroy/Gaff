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

/** The line that tells a renter a person will answer the rest. */
function passedToAPerson(operatorName: string, someAnswered: boolean): string {
  return `I’ve passed your other ${someAnswered ? 'question' : 'questions'} to a person at ${operatorName}. They’ll reply to you by email.`;
}

const CLOSING = 'If you have any other questions, just reply to this email.';

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
    lines.push(passedToAPerson(input.operatorName, input.answers.length > 0), '');
  }
  lines.push(CLOSING, '');
  lines.push(`${possessive(input.operatorName)} AI assistant`);
  return { subject: `Re: ${input.address}`, body: lines.join('\n') };
}

/**
 * UX-NV-15: a draft, split where it tells the renter that a person will answer the rest. That
 * is where the part Gaff couldn't answer is marked for the person approving it. Null when the
 * draft has no such line: everything was answered, or the person edited it away.
 */
export function draftParts(
  body: string,
  operatorName: string,
): { before: string; line: string; after: string } | null {
  for (const line of [passedToAPerson(operatorName, true), passedToAPerson(operatorName, false)]) {
    const at = body.indexOf(line);
    if (at === -1) continue;
    return {
      before: body.slice(0, at).trimEnd(),
      line,
      after: body.slice(at + line.length).trimStart(),
    };
  }
  return null;
}

/**
 * UX-NV-15: one draft answers both. The person's answers to what Gaff couldn't answer go into
 * the draft in the same words as every other answer ("You asked: …"), in place of the line that
 * said a person would reply. That line stays only if something is still left for a person.
 *
 * No wording is added: each part is the answer email's own. Where the line isn't in the draft
 * any more, the answers go before the closing line, or at the end.
 */
export function draftWithAnswers(input: {
  body: string;
  operatorName: string;
  answers: ReadonlyArray<{ question: string; answer: string }>;
  stillWithAPerson: boolean;
}): string {
  if (input.answers.length === 0) return input.body;
  const answered = input.answers
    .map(({ question, answer }) => `You asked: ${question}\n${answer}`)
    .join('\n\n');
  const parts = draftParts(input.body, input.operatorName);
  if (parts) {
    return [parts.before, answered, input.stillWithAPerson ? parts.line : '', parts.after]
      .filter(Boolean)
      .join('\n\n');
  }
  const closing = input.body.lastIndexOf(CLOSING);
  if (closing === -1) return `${input.body.trimEnd()}\n\n${answered}`;
  return [input.body.slice(0, closing).trimEnd(), answered, input.body.slice(closing)]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * R8: a person's own answers, from the conversation in Inbox. One email however many questions
 * they answer at once, each in the same words ("You asked: …"), signed by the person.
 */
export function operatorAnswersEmail(input: {
  renterName: string;
  operatorName: string;
  personName: string;
  address: string;
  answers: ReadonlyArray<{ question: string; answer: string }>;
}) {
  return {
    subject: `Re: ${input.address}`,
    body: [
      greeting(input.renterName),
      '',
      ...input.answers.flatMap(({ question, answer }) => [`You asked: ${question}`, answer, '']),
      CLOSING,
      '',
      `${input.personName}, ${input.operatorName}`,
    ].join('\n'),
  };
}

/** R8: a person's own answer to one question. */
export function operatorAnswerEmail(input: {
  renterName: string;
  operatorName: string;
  personName: string;
  address: string;
  question: string;
  answer: string;
}) {
  const { question, answer, ...rest } = input;
  return operatorAnswersEmail({ ...rest, answers: [{ question, answer }] });
}
