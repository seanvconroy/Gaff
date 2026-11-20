import type { Metadata } from 'next';
import Link from 'next/link';
import { decisionsCopy, meetsWords } from '@/copy/decisions';
import { holdingEmail, invitationEmail, waitlistedEmail } from '@/copy/templates/invitations';
import { decisionHref } from '@/domain/lettings/links';
import {
  MAX_WAITLIST,
  defaultInviteCount,
  invitationCounts,
  waitlistSize,
} from '@/domain/shortlist/plan';
import { shortlistFor } from '@/server/shortlist/shortlist';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { FieldError, TextField } from '@/ui/Field';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { MessagePreview } from '@/ui/MessagePreview';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { PickList } from '@/ui/PickList';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { loadDecision, many, one } from '../_decisions/load';
import { sendInvitationsAction } from './actions';

export const metadata: Metadata = { title: decisionsCopy.whoViews.metaTitle };

const copy = decisionsCopy.whoViews;
type Query = Record<string, string | string[] | undefined>;

/**
 * The first decision: who views (UX-DC-1 to UX-DC-6; R10, R11). A focused flow of two screens:
 * everyone who enquired, ranked, with the top people ticked; then "Check and send". Gaff ticks;
 * a person decides, and nothing goes until they press "Send invitations", which makes their
 * `invite_to_view` decision (`inviteToView`, ADR-0007). The ticks ride in the address between
 * the two screens (application IDs only), so Back and Change keep them.
 */
export default async function WhoViewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<Query>;
}) {
  const { member, letting, sessions, places, lettingHref } = await loadDecision(params);
  const query = await searchParams;
  const step = one(query.step);
  const here = decisionHref(letting.id, 'who-views');
  const leave = { kind: 'close' as const, href: lettingHref };
  const done = (
    <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
      {decisionsCopy.done}
    </ButtonLink>
  );

  // UX-FL-4: what was done, what Gaff does next.
  if (step === 'sent') {
    const counts = {
      invited: Number(one(query.invited) ?? 0),
      waitlisted: Number(one(query.waitlisted) ?? 0),
      told: Number(one(query.told) ?? 0),
    };
    return (
      <FlowShell leave={leave} primary={done}>
        <Outcome tone="success" title={copy.sent.title} headingLevel={1} role="status">
          <p>{copy.sent.text(counts)}</p>
          <p>{copy.sent.next}</p>
        </Outcome>
      </FlowShell>
    );
  }

  if (letting.status !== 'live') {
    return (
      <FlowShell leave={leave} primary={done}>
        <Outcome tone="info" title={copy.closed.title} headingLevel={1}>
          <p>{copy.closed.text}</p>
        </Outcome>
      </FlowShell>
    );
  }

  // UX-DC-5: invitations are to book a viewing time, so with none the flow starts by adding one.
  // Viewing times are their own page (WP-16).
  if (sessions.length === 0) {
    return (
      <FlowShell
        leave={leave}
        primary={
          <ButtonLink href={`${lettingHref}/viewings`} variant="primary" fullWidth="phone">
            {copy.noTimes.action}
          </ButtonLink>
        }
      >
        <FlowTitle title={copy.noTimes.title} lead={copy.noTimes.lead} />
      </FlowShell>
    );
  }

  const rows = await shortlistFor(member, letting.id);
  const undecided = rows.filter((r) => r.status === 'enquired');
  if (undecided.length === 0) {
    return (
      <FlowShell leave={leave} primary={done}>
        <Outcome tone="info" title={copy.nobody.title} headingLevel={1}>
          <p>{copy.nobody.text}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const taken = rows.filter((r) => r.status === 'invited' || r.status === 'booked').length;
  const placesLeft = Math.max(0, places - taken);
  const undecidedIds = new Set(undecided.map((r) => r.id));
  const asked = query.invite !== undefined || one(query.ticks) === '1';
  // UX-DC-2: the top people ticked, up to the places left; once changed, as the person left it.
  const ticked = asked
    ? many(query.invite).filter((id) => undecidedIds.has(id))
    : undecided.slice(0, defaultInviteCount(placesLeft, undecided.length)).map((r) => r.id);
  const typedWaitlist = one(query.waitlist);
  const waitlistNumber =
    typedWaitlist === undefined || typedWaitlist === '' ? null : Number(typedWaitlist);
  const waitlistValid =
    waitlistNumber === null ||
    (Number.isInteger(waitlistNumber) && waitlistNumber >= 0 && waitlistNumber <= MAX_WAITLIST);
  const carried = (except?: string) => (
    <>
      {except !== 'invite' ? (
        <>
          <input type="hidden" name="ticks" value="1" />
          {ticked.map((id) => (
            <input key={id} type="hidden" name="invite" value={id} />
          ))}
        </>
      ) : null}
      {except !== 'waitlist' && waitlistNumber !== null && waitlistValid ? (
        <input type="hidden" name="waitlist" value={String(waitlistNumber)} />
      ) : null}
    </>
  );
  const linkWith = (extra: Record<string, string>) => {
    const search = new URLSearchParams({ ticks: '1', ...extra });
    for (const id of ticked) search.append('invite', id);
    if (waitlistNumber !== null && waitlistValid) search.set('waitlist', String(waitlistNumber));
    return `${here}?${search.toString()}`;
  };
  const progress = (current: number) => ({
    label: copy.progress,
    segments: copy.steps,
    current,
  });

  // UX-DC-3: the waiting list's size, one question on its own screen.
  if (step === 'waitlist' || (step === 'check' && !waitlistValid)) {
    const left = undecided.length - ticked.length;
    return (
      <FlowShell
        leave={{ kind: 'back', href: linkWith({ step: 'check' }), label: decisionsCopy.back }}
        progress={progress(1)}
        form={{ method: 'get', action: here }}
        primary={
          <SubmitButton fullWidth="phone" name="step" value="check">
            {decisionsCopy.next}
          </SubmitButton>
        }
      >
        <FlowTitle title={copy.waitlist.title} lead={copy.waitlist.lead} />
        {carried('waitlist')}
        <TextField
          name="waitlist"
          label={copy.waitlist.label}
          hint={copy.waitlist.hint(Math.min(MAX_WAITLIST, left))}
          width="short"
          inputMode="numeric"
          defaultValue={typedWaitlist ?? String(waitlistSize(null, left))}
          error={waitlistValid ? undefined : copy.waitlist.error(MAX_WAITLIST)}
          autoFocus={!waitlistValid}
        />
      </FlowShell>
    );
  }

  const names = new Map(rows.map((r) => [r.id, r.name]));
  // Step 2: check and send. Nothing has gone yet.
  if (step === 'check' && ticked.length > 0) {
    const counts = invitationCounts({
      placesLeft,
      undecided: undecided.length,
      chosen: ticked.length,
      waitlist: waitlistNumber,
    });
    const tickedSet = new Set(ticked);
    const rest = undecided.filter((r) => !tickedSet.has(r.id));
    const base = (id: string | undefined) => ({
      renterName: (id && names.get(id)) || '',
      operatorName: member.organisationName,
      address: letting.addressLine1,
      area: letting.area,
    });
    const invitation = invitationEmail({
      ...base(ticked[0]),
      bookingUrl: '(their own private link)',
      sessions,
    });
    const waitlisted = waitlistedEmail(base(rest[0]?.id));
    const holding = holdingEmail({
      ...base(rest[counts.waitlisted]?.id),
      viewingDays: sessions.map((s) => s.startsAt),
    });
    const see = (label: string, message: { subject: string; body: string }) => (
      <Disclosure summary={copy.check.seeMessage}>
        <MessagePreview label={label} {...message} />
      </Disclosure>
    );
    const change = (href: string, what: string) => (
      <Link href={href}>
        {decisionsCopy.change}
        <span className="visually-hidden"> {what}</span>
      </Link>
    );
    return (
      <FlowShell
        leave={{ kind: 'back', href: linkWith({}), label: decisionsCopy.back }}
        progress={progress(1)}
        form={{ action: sendInvitationsAction.bind(null, letting.id) }}
        back={
          <ButtonLink href={linkWith({})} variant="quiet">
            {decisionsCopy.back}
          </ButtonLink>
        }
        primary={
          <SubmitButton fullWidth="phone" pendingLabel={copy.check.sending}>
            {copy.check.send}
          </SubmitButton>
        }
      >
        <FlowTitle title={copy.check.title} lead={copy.check.summary(counts)} />
        {carried()}
        <input type="hidden" name="waitlistSize" value={String(counts.waitlisted)} />
        {counts.unoffered > 0 ? (
          // UX-DC-4: fewer ticked than there are places.
          <Notice tone="warning">
            <p>
              {copy.check.unoffered(counts.unoffered)}{' '}
              <Link href={linkWith({})}>{copy.check.inviteMore}</Link>
            </p>
          </Notice>
        ) : null}
        <Stack gap={4}>
          <SummaryList
            rows={[
              {
                label: copy.check.invited,
                value: copy.check.peopleCount(counts.invited),
                action: change(linkWith({}), copy.check.invited),
              },
              {
                label: copy.check.waitlisted,
                value:
                  counts.waitlisted > 0
                    ? copy.check.peopleCount(counts.waitlisted)
                    : copy.check.nobody,
                action:
                  rest.length > 0
                    ? change(linkWith({ step: 'waitlist' }), copy.check.waitlisted)
                    : undefined,
              },
              {
                label: copy.check.told,
                value: counts.told > 0 ? copy.check.peopleCount(counts.told) : copy.check.nobody,
              },
            ]}
          />
          {/* UX-DC-6: each fixed message can be read, and not edited. */}
          <p>{copy.check.fixed}</p>
          <Stack gap={2}>
            <h2 className="type-heading">{copy.check.invited}</h2>
            {see(copy.check.invited, invitation)}
          </Stack>
          {counts.waitlisted > 0 ? (
            <Stack gap={2}>
              <h2 className="type-heading">{copy.check.waitlisted}</h2>
              {see(copy.check.waitlisted, waitlisted)}
            </Stack>
          ) : null}
          {counts.told > 0 ? (
            <Stack gap={2}>
              <h2 className="type-heading">{copy.check.told}</h2>
              {see(copy.check.told, holding)}
            </Stack>
          ) : null}
        </Stack>
        {/* UX-DS-18: an action that failed is said where it was pressed. */}
        {one(query.problem) ? (
          <FieldError id="send-problem">{one(query.problem)}</FieldError>
        ) : null}
      </FlowShell>
    );
  }

  // Step 1: everyone, ranked (UX-DC-1), the top people ticked (UX-DC-2).
  const item = (row: (typeof rows)[number]) => ({
    value: row.id,
    label: row.name,
    meta: meetsWords(row),
    detail: row.reason,
    defaultChecked: ticked.includes(row.id),
  });
  const answered = undecided.filter((r) => r.answered);
  const later = undecided.filter((r) => !r.answered);
  return (
    <FlowShell
      leave={leave}
      progress={progress(0)}
      form={{ method: 'get', action: here }}
      primary={
        <SubmitButton fullWidth="phone" name="step" value="check">
          {decisionsCopy.next}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.title} lead={copy.lead(Math.min(placesLeft, undecided.length))} />
      <Disclosure summary={copy.howRanks}>
        <p>{copy.howRanksText}</p>
      </Disclosure>
      <input type="hidden" name="ticks" value="1" />
      {waitlistNumber !== null && waitlistValid ? (
        <input type="hidden" name="waitlist" value={String(waitlistNumber)} />
      ) : null}
      <PickList
        name="invite"
        legend={copy.legend}
        hideLegend
        summary={copy.summary(placesLeft)}
        detailLabel={copy.why}
        error={step === 'check' && ticked.length === 0 ? copy.noneTicked : undefined}
        groups={[
          { items: answered.map(item) },
          { heading: copy.laterHeading, items: later.map(item) },
        ]}
      />
    </FlowShell>
  );
}
