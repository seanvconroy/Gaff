# ADR-0026: Fresh listings, alerts as soon as a home is listed, and a home's numbers

- Status: Accepted (brought across from the live line's M49, M82, M85, M86, M87 and M92 on 20 November 2026; Q51)
- Date: 2026-11-20

## Context

The redesign told renters about new homes once a day at most (UX-SR-10), never asked a lister whether a live home was still there, showed a lister nothing about how their home was doing on Gaff, and put no limit on asking to view. The live line had all of these. On 19 November (Q51) the founder decided that alerts go out as soon as a home is listed, with a daily option.

## Decision

- **Freshness (M49).** A live home's clock is the latest of going live, its lister's last change (a person's `letting.*`, `viewings.*` or `criteria.set` event of the kinds in `freshnessChangeEvents`) and their last "Still available" (`lettings.confirmed_available_at`). After 14 days the daily sweep (`listing_freshness`) asks once (`freshness_asked_at`, Today's `freshness` row, one fixed email to the lead with a signed link). Three days after an ask nobody answered, the home steps back (`stale_at`): no page, not in search, its enquiries wait as a hidden home's do. A viewing booked ahead or an offer out counts as fresh. "Still available" from Gaff, or from the email's link with no sign-in (a page that asks first, so a mail scanner confirms nothing), brings it back and sends what waited. The link is an HMAC over the letting and the ask, so nothing is stored and it works once.
- **Alerts (M86, M87).** Each saved search has `frequency`: `instant` (the default) or `daily`. Going live (`goLive`) or a lower rent queues `instant_search_alerts` two minutes on, with a job key that keeps the first time, so homes listed together are one email well inside five minutes. The daily run is at 8am Irish time (cron at 07:00 and 08:00 UTC; the job waits for 8 in Ireland). A home is news when it went live or its rent last came down (read from `letting.rent_changed`), each home once to anyone across all their searches (`told_home_refs`). Every alert carries the other choice ("Once a day instead") and "Stop these", both one tap with the search's token.
- **Saved (M85).** `saved_homes.rent_cents_when_saved`; Saved says a lower rent, new viewing times and that a home was let. No email of its own. No private note (rule 3).
- **A home's numbers (M92).** `letting_daily_counts` (tenant table): page opens from the page's own beacon and saves, by Irish day; enquiries from applications. No cookies, nothing about who; robots aren't counted. Deleted after 13 months by the nightly job.
- **Asking to view (M82).** 30 a day from one person (account, or typed email) or one network address, hashed in `auth_limits`, with a plain message.
- **The public rule** gains one condition: a live home with `stale_at` set has no page (`homePageState`, `onGaff` in `public-homes.ts`). A let home still says "This home has been let".

## Consequences

- The alert wording changed (timing words and the frequency switch): new wording for the solicitor, with the freshness email.
- The migration counts every home live at deploy as confirmed then, so nobody is asked on the first day. The test copy's seed counts each run as its listers confirming.
- A missed hook (a home made public some other way) is caught by the next instant run that anything queues.

## Alternatives considered

- **The live line's `alert_deliveries` table.** The redesign's `told_home_refs` already holds "each home once", and searches held by an email alone have no user to key deliveries on.
- **Counting page opens on the server render.** It would count prefetches and robots; the beacon counts a page a browser showed.
