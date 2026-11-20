# How to build this: start here

> **The build is complete (18 November 2026).** Every work package, WP-1 to WP-28, is built and merged; the last, the end-to-end pass, added two journeys that let a home from both sides (`tests/e2e/ux-e2e-both-sides.spec.ts`). What stays open, on purpose: "Stop taking enquiries" (UX-LP-5, which needs a new fixed message the solicitor reviews first), the map (Q49), reading files (brochures, screenshots) in an advert, dragging on the calendar, "Use our own agreement", turning a private landlord into a team, and reading the RTB's Rent Register (OQ-2). What a founder or the solicitor must do before real users is in [`docs/launch-checklist.md`](../launch-checklist.md). The rest of this page is how it was built.

For Sean. This is the whole path from "the plan is agreed" to "the MVP is built". You never paste a document. Every build session reads the plan from the repository by itself. You paste one sentence per session.

## The short version

1. Merge the plan.
2. Open a new Claude Code session on the Gaff repository and paste one sentence. Do that seven times, in the order below.
3. After each one, look at the screenshots in its pull request, then press Merge.

Seven sessions build the whole MVP. Two pairs can run at the same time.

## Before you start (once)

| # | Do this | Why | Time |
| --- | --- | --- | --- |
| 1 | **Merge the plan.** Merge the branch `claude/gaff-ux-redesign-prd-bua8q5` into `claude/gaff-mvp`, the repository's default branch | New sessions start from the default branch. They can only follow a plan that's on it | 1 minute |
| 2 | **Set up the test copy**, if you haven't: [`docs/deploy.md`](../deploy.md) | So you can try each wave on a real web address after you merge it. Without it you still get screenshots | 20 minutes |

Nothing else has to be ready. No vendor account is needed to build: each one has a stand-in.

## The seven sessions

For each row: open [claude.ai/code](https://claude.ai/code), start a new session on **seanvconroy/Gaff**, and paste the sentence exactly. When the session finishes it gives you a pull request. Look, then merge. Then do the next row.

| Order | Paste this | You can start it when |
| --- | --- | --- |
| 1 | `Build wave 0 of the UX redesign. Use sub-agents, one per work package, and open a pull request when everything passes.` | The plan is merged |
| 2 | `Build wave 1 of the UX redesign. Use sub-agents, one per work package, and open a pull request when everything passes.` | Wave 0 is merged |
| 3 | `Build wave 2A of the UX redesign. Use sub-agents, one per work package, and open a pull request when everything passes.` | Wave 1 is merged |
| 4 | `Build wave 2B of the UX redesign. Use sub-agents, one per work package, and open a pull request when everything passes.` | Wave 1 is merged. Run it at the same time as 2A, in a second session |
| 5 | `Build wave 3A of the UX redesign. Use sub-agents, one per work package, and open a pull request when everything passes.` | Wave 2A is merged |
| 6 | `Build wave 3B of the UX redesign. Use sub-agents, one per work package, and open a pull request when everything passes.` | Waves 2A and 2B are merged. Run it at the same time as 3A |
| 7 | `Build wave 4 of the UX redesign. Use sub-agents, one per work package, and open a pull request when everything passes.` | Waves 3A and 3B are merged |

The only thing that changes between rows is the wave's name.

## What each wave gives you, and what to try

| Wave | What gets built | Try this when it's merged |
| --- | --- | --- |
| **0. Foundations** | The new look as building blocks: colours, type, buttons, fields, sheets. Counting for every funnel | Open the component page. Is the blue right? This is the first look at it |
| **1. Frame, sign-in and accounts** | Sign-in with Google, Apple or a code. First run. The new navigation. The page frame for renters | Sign in with a code. Answer "What brings you to Gaff?" each of the three ways. Look at the new bar on your phone. Decide whether the blue stays |
| **2A. Running a letting, part 1** | Today. Inbox. Adding a letting by pasting an advert. Forwarding with a test enquiry | Paste a real advert of yours and see what Gaff makes of it. Go live. Send the test enquiry. Approve an answer from Today |
| **2B. Inside a letting, for renters** | Every renter page from questions to moving in. The owner's page. The reference form. Profile and Enquiries | On your phone, be the renter: answer the questions, book, apply. Open the owner's link. Fill in a reference |
| **3A. Running a letting, part 2** | A letting's page. The calendar. Choosing who views, choosing an applicant, the offer. Tenancy and close. Teams | Add viewing times on the calendar. Choose who views. Make an offer. Invite Ann |
| **3B. The marketplace** | gaff.ie: search, a page for each home, ask to view, saved searches | Signed out, search in your own words. Open a home. Ask to view with no account. Save a search that finds nothing |
| **4. Trust, fit and finish** | A verified identity, kept and reused. "Meets 3 of 4". Report a listing. Gaff's internal page. Setup checklists. Two full journeys across both sides | Run one home from "Add a letting" to a signed tenancy, with a second phone as the renter who found it on Gaff |

## While it builds: things only you can do

None of these holds up a session. Each has to be done before real people use Gaff. The full list, with the solicitor's questions, is in [section 11](11-compliance-and-vendors.md#before-real-users).

| # | Do this | Needed before |
| --- | --- | --- |
| 1 | Say yes or no to two things I decided for you to confirm: private landlords verify their identity before their first home goes live (Q47), and Veriff for identity checks (Q48) | Wave 4 |
| 2 | Google sign-in credentials, and an Apple developer account | Real users sign in with Google or Apple. Until then the code works with email codes and passkeys |
| 3 | Autoaddress: an account, a signed data processing agreement, and where it's hosted, in writing | Real addresses are searched. Until then people type the address |
| 4 | Veriff: the same three things | The first real identity check |
| 5 | Send the solicitor the ten questions in [section 11](11-compliance-and-vendors.md#for-the-solicitor) | The first real renter |
| 6 | The gaff.ie domain | Launch |

## If something happens

| What happens | What to do |
| --- | --- |
| A session asks you a question | Answer it. If you don't mind either way, reply: `Use your best judgement and note it in the pull request.` |
| A session asks to allow a website | Say yes if it's one of these: `www.psr.ie` (the PSRA's register), `rtb.ie` (the Rent Register), `download.geofabrik.de` (map data). Ask why for anything else |
| The checks on a pull request are red | In that session: `The checks failed. Fix them.` |
| A pull request says it conflicts, after you merged another | In that session: `Bring this branch up to date with the default branch, fix any conflicts and run the checks again.` |
| A wave stalls or comes back half done | Start a new session for what's missing, one package at a time: `Build work package WP-9 of the UX redesign and open a pull request when everything passes.` The package numbers are in [section 13](13-work-packages.md) |
| You don't like how something turned out | A new session: `On the letting's page, [what to change]. Follow docs/ux-redesign.` Small changes don't need a wave |
| You change your mind about the plan | Tell a session what changed and ask it to update `docs/ux-redesign` first. Then build |

## How it works underneath

You don't need this to follow the steps above.

- `CLAUDE.md` is read by every session. It now says where the redesign lives and that "build wave N" means following [section 13](13-work-packages.md).
- Section 13 lists the 28 packages, which wave each is in, what each must deliver, and the rules every package follows: tests first, one design for phone and desktop, no real vendor accounts.
- A wave's session leads. It hands each package to a sub-agent, merges their work, runs every check and opens one pull request.
- Each wave leaves the product working. Old screens stay until the wave that replaces them.
