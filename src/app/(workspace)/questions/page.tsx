import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { listOpenQuestions } from '@/server/answers/queries';
import { ChoiceGroup, TextArea } from '@/ui/Field';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../attention/attention.module.css';
import { answerAction } from './actions';

export const metadata: Metadata = { title: 'Questions' };

const reasons: Record<string, string> = {
  asked_for_person: 'They asked to talk to a person.',
  letting_closed: 'They wrote after you closed this letting, so the AI didn’t answer.',
  no_facts: 'Gaff doesn’t have this in the home’s facts.',
  unknown_facts: 'The AI’s answer didn’t match the facts, so Gaff held it back.',
  protected_ground:
    'The AI’s answer touched on something equality law protects, so Gaff held it back.',
  contact_details:
    'The AI’s answer had contact details that aren’t in the facts, so Gaff held it back.',
  too_long: 'The AI’s answer was too long, so Gaff held it back.',
  draft_not_sent: 'You chose not to send the AI’s draft.',
};

/** R8: the operator answers once; Gaff reuses the answer for everyone who asks. */
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const member = await requireMember();
  const [questions, { done, problem }] = await Promise.all([
    listOpenQuestions(member),
    searchParams,
  ]);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Questions for you"
        lead="Things Gaff couldn’t answer from the facts. Answer once and Gaff remembers it for everyone who asks about that home."
      />
      {done === 'sent' ? (
        <Notice tone="success" role="status">
          <p>Sent. Gaff will use your answer next time someone asks.</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="danger" role="alert">
          <p>{problem}</p>
        </Notice>
      ) : null}
      {questions.length === 0 ? (
        <Card>
          <h2 className="type-title">No questions waiting</h2>
          <p>Gaff answered everything it could from the facts.</p>
        </Card>
      ) : null}
      {questions.map((q) => (
        <Card key={q.id} as="article" labelledBy={`q-${q.id}`}>
          <h2 id={`q-${q.id}`} className="type-title">
            {q.renterName} asked about {q.address}
          </h2>
          <p className={styles.meta}>
            {formatDateTime(q.createdAt)} · {reasons[q.reason] ?? 'Gaff couldn’t answer this.'}
          </p>
          <blockquote className={styles.body}>{q.question}</blockquote>
          <form action={answerAction}>
            <Stack gap={4}>
              <input type="hidden" name="questionId" value={q.id} />
              <TextArea name="answer" label="Your answer" rows={4} />
              <ChoiceGroup
                name="remember"
                legend="Remember this answer?"
                defaultValue="yes"
                options={[
                  { value: 'yes', label: 'Yes, use it for everyone who asks about this home' },
                  { value: 'no', label: 'No, just this once' },
                ]}
              />
              <div>
                <SubmitButton variant="secondary" pendingLabel="Sending…">
                  Send answer
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </Card>
      ))}
    </Stack>
  );
}
