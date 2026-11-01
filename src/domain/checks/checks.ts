import { z } from 'zod';
import type { Earning } from '@/domain/applications/apply';

/**
 * R18, stage 6: checks run only for the preferred applicant and the backup, each started by
 * the renter after it's explained (PRD: checks on the chosen applicant). A check that doesn't
 * pass is never a refusal: it's shown to a person with a plain reason (Principle 1).
 */
export const checkKinds = [
  'identity',
  'income',
  'landlord_reference',
  'employer_reference',
] as const;
export type CheckKind = (typeof checkKinds)[number];

export const checkStatuses = [
  'to_do',
  'in_progress',
  'passed',
  'not_passed',
  'answered',
  'no_answer',
  'not_needed',
] as const;
export type CheckStatus = (typeof checkStatuses)[number];

/** The checks someone chosen is asked for. An employer reference only makes sense from a job. */
export function checksFor(
  earning: Earning | null,
): Array<{ kind: CheckKind; status: CheckStatus }> {
  return [
    { kind: 'identity', status: 'to_do' },
    { kind: 'income', status: 'to_do' },
    { kind: 'landlord_reference', status: 'to_do' },
    { kind: 'employer_reference', status: earning === 'employed' ? 'to_do' : 'not_needed' },
  ];
}

export const REMINDER_DAYS = [2, 4] as const;
export const NO_ANSWER_DAYS = 6;

/** PRD: Gaff emails the referee, chases twice, and flags if there's no answer. */
export function referenceSchedule(requestedAt: Date): { reminders: Date[]; noAnswerAt: Date } {
  const day = 86_400_000;
  return {
    reminders: REMINDER_DAYS.map((d) => new Date(requestedAt.getTime() + d * day)),
    noAnswerAt: new Date(requestedAt.getTime() + NO_ANSWER_DAYS * day),
  };
}

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter an email address, like name@example.ie.' }));

function referee(prefix: 'landlord' | 'employer', missing: string) {
  return (values: Record<string, unknown>, ctx: z.RefinementCtx) => {
    if (values[`${prefix}None`] === 'yes') return null;
    const name = String(values[`${prefix}Name`] ?? '').trim();
    const address = String(values[`${prefix}Email`] ?? '').trim();
    if (!name || !address) {
      ctx.addIssue({ code: 'custom', path: [`${prefix}Name`], message: missing });
      return null;
    }
    const parsed = email.safeParse(address);
    if (!parsed.success) {
      ctx.addIssue({
        code: 'custom',
        path: [`${prefix}Email`],
        message: 'Enter an email address, like name@example.ie.',
      });
      return null;
    }
    return { name: name.slice(0, 120), email: parsed.data };
  };
}

/** The renter gives each referee's name and email, or says they don't have one. */
export const refereesSchema = z.record(z.string(), z.unknown()).transform((values, ctx) => ({
  landlord: referee(
    'landlord',
    'Enter your last landlord’s name and email, or tick that you haven’t rented before.',
  )(values, ctx),
  employer: referee(
    'employer',
    'Enter your employer’s name and email, or tick that you don’t have one.',
  )(values, ctx),
}));

type Question = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Asked only when the first answer is yes. */
  ifYes?: boolean;
};

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Fixed questions; no free text, so nothing touching a protected ground can be stored. */
export const landlordQuestions: Question[] = [
  { name: 'rentedFromYou', label: 'Did they rent a home from you?', options: yesNo },
  {
    name: 'paidOnTime',
    label: 'Was the rent paid on time?',
    ifYes: true,
    options: [
      { value: 'always', label: 'Always' },
      { value: 'mostly', label: 'Mostly' },
      { value: 'often_late', label: 'It was often late' },
    ],
  },
  {
    name: 'lookedAfter',
    label: 'Did they look after the home?',
    ifYes: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'mostly', label: 'Mostly' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    name: 'rentAgain',
    label: 'Would you rent to them again?',
    ifYes: true,
    options: [...yesNo, { value: 'rather_not_say', label: 'I’d rather not say' }],
  },
];

export const employerQuestions: Question[] = [
  { name: 'worksForYou', label: 'Do they work for you?', options: yesNo },
  {
    name: 'contract',
    label: 'What kind of job is it?',
    ifYes: true,
    options: [
      { value: 'permanent', label: 'Permanent' },
      { value: 'fixed_term', label: 'Fixed-term contract' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    name: 'howLong',
    label: 'How long have they worked for you?',
    ifYes: true,
    options: [
      { value: 'under_1', label: 'Less than a year' },
      { value: '1_to_3', label: '1 to 3 years' },
      { value: 'over_3', label: 'More than 3 years' },
    ],
  },
];

export function questionsFor(kind: 'landlord_reference' | 'employer_reference'): Question[] {
  return kind === 'landlord_reference' ? landlordQuestions : employerQuestions;
}

/** Validates a referee's answers: the questions shown, from the fixed choices, nothing else. */
export function referenceAnswersSchema(kind: 'landlord_reference' | 'employer_reference') {
  const questions = questionsFor(kind);
  return z.record(z.string(), z.unknown()).transform((values, ctx) => {
    const answers: Record<string, string> = {};
    const first = questions[0]!;
    for (const question of questions) {
      if (question.ifYes && answers[first.name] !== 'yes') continue;
      const value = String(values[question.name] ?? '');
      if (!question.options.some((o) => o.value === value)) {
        ctx.addIssue({ code: 'custom', path: [question.name], message: 'Choose an answer.' });
        continue;
      }
      answers[question.name] = value;
    }
    return answers;
  });
}

const words: Record<string, Record<string, string>> = {
  paidOnTime: {
    always: 'Rent always on time.',
    mostly: 'Rent mostly on time.',
    often_late: 'Rent often late.',
  },
  lookedAfter: {
    yes: 'Looked after the home.',
    mostly: 'Looked after the home mostly.',
    no: 'Didn’t look after the home.',
  },
  rentAgain: {
    yes: 'Would rent to them again.',
    no: 'Wouldn’t rent to them again.',
    rather_not_say: 'Would rather not say whether they’d rent to them again.',
  },
  contract: {
    permanent: 'Permanent job.',
    fixed_term: 'Fixed-term contract.',
    other: 'Another kind of job.',
  },
  howLong: {
    under_1: 'There less than a year.',
    '1_to_3': 'There 1 to 3 years.',
    over_3: 'There more than 3 years.',
  },
};

/** A referee's answers in plain words, for the operator. */
export function describeReference(
  kind: 'landlord_reference' | 'employer_reference',
  answers: Record<string, string>,
): string {
  if (kind === 'landlord_reference') {
    if (answers.rentedFromYou !== 'yes') return 'Says they didn’t rent from them.';
    return [
      'Rented from them.',
      words.paidOnTime![answers.paidOnTime!],
      words.lookedAfter![answers.lookedAfter!],
      words.rentAgain![answers.rentAgain!],
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (answers.worksForYou !== 'yes') return 'Says they don’t work for them.';
  return ['Works for them.', words.contract![answers.contract!], words.howLong![answers.howLong!]]
    .filter(Boolean)
    .join(' ');
}
