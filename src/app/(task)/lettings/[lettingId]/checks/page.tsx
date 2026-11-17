import type { Metadata } from 'next';
import { decisionsCopy } from '@/copy/decisions';
import { firstNameOf } from '@/domain/accounts/first-run';
import {
  allChecksBack,
  checkLine,
  inCheckOrder,
  waitingTooLong,
  type CheckView,
} from '@/domain/checks/review';
import { conversationHref, conversationKey } from '@/domain/inbox/conversations';
import { decisionHref } from '@/domain/lettings/links';
import { applicantsFor } from '@/server/applications/choose';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { loadDecision, one } from '../_decisions/load';
import { remindAction } from './actions';

export const metadata: Metadata = { title: decisionsCopy.checks.metaTitle };

const copy = decisionsCopy.checks;
const DAY = 86_400_000;
const pillWords: Record<string, string | undefined> = {
  success: copy.done,
  info: copy.underWay,
};

/**
 * Checks (UX-DC-10 to UX-DC-13; R18). While they run, the screen says there is nothing to do,
 * and a check waiting more than three days says who it waits on, with "Send a reminder". When
 * every check for the preferred applicant is back, Today's one task opens this screen: each
 * result in words, and "Continue to the offer". A check that didn't pass is in the warning
 * style with a plain reason, and two ways on: ask the renter about it, or choose someone else.
 * It is never a refusal: a person decides (rule 1).
 */
export default async function ChecksPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { member, letting, lettingHref } = await loadDecision(params);
  const query = await searchParams;
  const leave = { kind: 'close' as const, href: lettingHref };
  const listing = await applicantsFor(member, letting.id);
  const rows = listing?.rows ?? [];
  const preferred = rows.find((r) => ['preferred', 'offered', 'accepted'].includes(r.status));
  const backup = rows.find((r) => r.status === 'backup');
  if (!listing || !preferred || preferred.checks.length === 0) {
    return (
      <FlowShell
        leave={leave}
        primary={
          <ButtonLink href={decisionHref(letting.id, 'choose')} variant="primary" fullWidth="phone">
            {copy.none.action}
          </ButtonLink>
        }
      >
        <Outcome tone="info" title={copy.none.title} headingLevel={1}>
          <p>{copy.none.text}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const now = new Date();
  const rule = { rentCents: listing.rentCents, ruleTenths: listing.incomeRuleTenths };
  const back = allChecksBack(preferred.checks);
  const first = firstNameOf(preferred.name);
  const reminded = one(query.reminded);
  const remind = remindAction.bind(null, letting.id);

  const person = (row: typeof preferred, heading: string) => {
    const name = firstNameOf(row.name);
    return (
      <section aria-labelledby={`checks-${row.id}`}>
        <Stack gap={3}>
          <h2 id={`checks-${row.id}`} className="type-title">
            {heading}
          </h2>
          <SummaryList
            rows={inCheckOrder(row.checks as CheckView[]).map((check) => {
              const line = checkLine(check, rule);
              const waiting = waitingTooLong(check, now);
              const since = check.status === 'to_do' ? check.createdAt : check.requestedAt;
              return {
                label: line.label,
                value: (
                  <Stack gap={2}>
                    {line.needsALook ? (
                      // UX-DC-12: warning, never danger, with a plain reason and two ways on.
                      // It is never an automatic refusal.
                      <Notice tone="warning">
                        <p>{line.text}</p>
                        <p>
                          <ButtonLink
                            href={conversationHref(conversationKey({ kind: 'renter', id: row.id }))}
                            variant="quiet"
                          >
                            {copy.askAbout(name)}
                          </ButtonLink>{' '}
                          <ButtonLink href={decisionHref(letting.id, 'choose')} variant="quiet">
                            {copy.chooseElse}
                          </ButtonLink>
                        </p>
                      </Notice>
                    ) : (
                      <span>
                        {pillWords[line.tone] ? (
                          <>
                            <StatusPill tone={line.tone}>{pillWords[line.tone]}</StatusPill>{' '}
                          </>
                        ) : null}
                        {line.text}
                      </span>
                    )}
                    {waiting && since ? (
                      // UX-DC-13: who it waits on, and a reminder.
                      <form action={remind}>
                        <Stack gap={2}>
                          <span>
                            {copy.waitingOn(
                              waiting.who === 'referee' ? (waiting.name ?? 'the referee') : name,
                              Math.floor((now.getTime() - since.getTime()) / DAY),
                            )}
                          </span>
                          <input type="hidden" name="checkId" value={check.id} />
                          {reminded === check.id ? (
                            <span role="status">
                              {copy.reminded(
                                waiting.who === 'referee' ? (waiting.name ?? 'the referee') : name,
                              )}
                            </span>
                          ) : (
                            <span>
                              <SubmitButton variant="secondary" pendingLabel={copy.reminding}>
                                {copy.remind}
                              </SubmitButton>
                            </span>
                          )}
                        </Stack>
                      </form>
                    ) : null}
                  </Stack>
                ),
              };
            })}
          />
        </Stack>
      </section>
    );
  };

  return (
    <FlowShell
      leave={leave}
      primary={
        back ? (
          <ButtonLink href={decisionHref(letting.id, 'offer')} variant="primary" fullWidth="phone">
            {copy.back.continue}
          </ButtonLink>
        ) : (
          <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
            {decisionsCopy.done}
          </ButtonLink>
        )
      }
    >
      {back ? (
        <FlowTitle title={copy.back.title(first)} lead={copy.back.lead} />
      ) : (
        // UX-DC-10: nothing to do while they run, and the page says so.
        <FlowTitle title={copy.running.title} lead={copy.running.lead} />
      )}
      {one(query.problem) ? (
        <Notice tone="warning" role="alert">
          <p>{one(query.problem)}</p>
        </Notice>
      ) : null}
      {person(preferred, copy.preferredHeading(preferred.name))}
      {backup && backup.checks.length > 0 ? person(backup, copy.backupHeading(backup.name)) : null}
    </FlowShell>
  );
}
