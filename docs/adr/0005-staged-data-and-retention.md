# ADR-0005: Staged data and retention, built into the schema and jobs

- Status: Proposed (retention periods wait on open question Q3 and the solicitor)
- Date: 2026-10-31

## Context

The DPC has found that collecting documents from every applicant before an offer is excessive. The PRD makes staged collection, retention by scheduled job and the renter's ownership of their profile core principles. These rules need to be enforced in the code, not left to good intentions.

## Decision

1. **Data by stage.** Each group of renter data in the PRD's workflow table (contact details and self-declared answers; booking and attendance; employment and income; checks; PPSN and signature) can be written only once the application has reached that stage. The use cases enforce this and compliance tests prove it. Slice 1 stores only the first two groups.
2. **Ask only what's needed.** The pre-viewing page asks only the questions for criteria the operator has set.
3. **Scoped to one application.** A renter's data belongs to their application for one letting, controlled by the operator. Gaff doesn't link renters across operators. A renter-owned Gaff profile is created only if the renter opts in (Slice 3).
4. **Deletion dates.** Every application, inbound email and message carries a deletion date, set when the letting is let or withdrawn. A daily job deletes personal data that's due and writes an event for each deletion. The PRD's metric (100% deleted on schedule) is read from those events. The anonymous decision record stays for its own, longer period.
5. **Before real renters:** the retention job must exist before any real renter data enters production. If Slice 1 is piloted before Slice 3, a basic version of R26 is built first.
6. **Sensitive fields** (PPSN, check results) are encrypted at application level when they arrive in Slices 2 and 3, on top of the database's encryption at rest.
7. **No leaks from renter pages.** Renter pages load no third-party scripts, fonts, analytics or trackers. Fonts are self-hosted.

## Consequences

- Breaking the staged-data rule needs a code change that fails a compliance test, not a settings change.
- The timeline must cope with deleted details (see ADR-0006).
- Retention periods are configuration, set once the solicitor confirms them.

## Alternatives considered

- **Delete by hand, or on request.** Fails the PRD's non-functional requirement and its success measure.
- **One renter profile shared across operators from the first enquiry.** Better for the marketplace vision, but it makes Gaff a controller of every enquirer's data from day one, before the lawful basis is settled (an open solicitor question).
