import type { Metadata } from 'next';
import { refereeCopy } from '@/copy/referee';
import { firstNameOf } from '@/domain/accounts/first-run';
import { referenceQuestions } from '@/domain/checks/checks';
import { openReferenceRequest } from '@/server/checks/checks';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import styles from '../../l/landlord.module.css';
import { ReferenceForm } from './ReferenceForm';

export const metadata: Metadata = { title: refereeCopy.metaTitle };
export const dynamic = 'force-dynamic';

/**
 * R18, UX-RF-1 to UX-RF-6: a referee's page, by private link. Two lines on who's asking and who
 * sees the answers, then the questions on one screen, then "Thanks". It asks nothing about the
 * referee and never offers an account (UX-RF-5). The frame is the agency's (UX-PP-9): its name
 * in the header, and no home, which a referee is never shown.
 */
export default async function ReferencePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await openReferenceRequest(token);
  if (!request) {
    return (
      <PrivateFrame audience="referee" lister={null}>
        <Outcome tone="info" title={refereeCopy.ended.title} headingLevel={1}>
          <p>{refereeCopy.ended.text}</p>
        </Outcome>
      </PrivateFrame>
    );
  }
  const operator = request.operatorName;
  if (request.status === 'answered' || request.cantGive) {
    const copy = request.cantGive ? refereeCopy.told : refereeCopy.thanks;
    return (
      <PrivateFrame audience="referee" lister={request.lister}>
        <Outcome
          tone={request.cantGive ? 'info' : 'success'}
          title={copy.title}
          headingLevel={1}
          role="status"
        >
          <p>{copy.text(operator)}</p>
        </Outcome>
      </PrivateFrame>
    );
  }
  const firstName = firstNameOf(request.renterName) || request.renterName;
  return (
    <PrivateFrame audience="referee" lister={request.lister} next={<p>{refereeCopy.next}</p>}>
      <div className={styles.task}>
        <div className={styles.titles}>
          <h1 className={styles.title}>{refereeCopy.title(request.renterName)}</h1>
          <p>{refereeCopy.asking(request.renterName, operator, request.kind)}</p>
          <p>{refereeCopy.kept(operator)}</p>
        </div>
        <ReferenceForm token={token} questions={referenceQuestions(request.kind, firstName)} />
      </div>
    </PrivateFrame>
  );
}
