# ADR-0021: Reports handled as cases, with a statement of reasons and one appeal

- Status: Accepted (brought across from the live line's ADR-0023 and M96 to M98, M106 on 19 November 2026; Q53)
- Date: 2026-11-19

## Context

The redesign kept each report on its own (`listing_reports`) and let Gaff's team hide a listing for one of four reasons, keep it up, or put it back; the lister could ask Gaff to look again. The EU Digital Services Act expects more of a marketplace: a notice mechanism that is acknowledged (article 16), a statement of reasons when content is restricted (article 17), and an internal complaint system decided by people (article 20). The live line built that as cases. On 19 November (Q53) Sean agreed that Gaff's team may handle a report as a case, with a statement of reasons and an appeal, and still never open a letting, read a renter, send a message or decide anything about a person.

## Decision

- **A case per listing** (`listing_cases`, Gaff's own record, reached only by `withSystem()`). A report opens one or joins the open one. It is due in working hours (Monday to Friday, 9am to 5:30pm in Ireland): 4 for a suspected scam, 1 working day otherwise; a joining report only brings it forward (`caseDueBy`, `joinedDueBy`).
- **The rules may take a listing off at once, never decide.** Two scam reports on its open case, or one on a listing hidden before, set `lettings.hidden_stage = 'held'` (`strongScamSignals`). The lister is told it was automatic and that a person will look. Only a person's decision ends it.
- **A person decides every case** on `/internal` (`decideCase`): no action (which puts back a held listing), or hide, with one of the four reasons and at least one fact from a fixed list (`caseFacts`). Reasons, facts, the ground each reason rests on and the date go to the lister in fixed words (`src/copy/trust-emails.ts`, pinned word for word): nobody at Gaff writes free text to anyone.
- **One appeal, decided by someone else.** "Ask Gaff to look again" opens an appeal case (due in 1 working day) for the latest decision to hide. The person who decided can't decide it (`canDecideAppeal`). Its answer is final (`hidden_stage = 'final'`) and names the out-of-court route.
- **The reporter** needs no account. An optional email hears the outcome and is cleared once it is sent. At most 10 reports a day come from one network address, counted as a hash in `auth_limits` the way sign-in tries are.
- **History** on a case is read from the letting's `listing.*` events, which hold only codes. Events: `listing.reported`, `listing.held`, `listing.hidden`, `listing.kept_up`, `listing.look_again_asked`, `listing.appeal_decided`, `listing.unhidden`.
- **Retention:** a case and its reports are deleted by the nightly job six months after a person decided it (an appeal keeps the case it appeals as long as itself).
- **Not built:** pausing or suspending a lister's account (M107). `accountActionsBuilt` is the seam; nothing offers it.

## Consequences

- The redesign's "Hide this listing", "Keep it up" and "Put it back" are now the one decision on a case; there is no second mechanism.
- Gaff's team needs at least two people on `STAFF_EMAILS` to decide appeals.
- The statement of reasons, the grounds and the outcome email are new wording for the solicitor's list.

## Alternatives considered

- **Free text for the facts relied on.** Clearer for an unusual case, but it would be staff writing to listers, and a place for a protected ground to slip in.
- **The live line's six report reasons.** The redesign's four cover what the law needs ("unfair about who can apply" is discrimination), so they stay.
