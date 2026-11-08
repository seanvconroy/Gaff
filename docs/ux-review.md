# UX review and redesign, November 2026

The A4 design system (Navy and Atlantic) gave Gaff a good look, but the screens built on it still felt overwhelming and, in places, amateur. This is what we found, the rules we redesigned to, and what changed in each flow. It sits alongside [design-system.md](design-system.md), which now describes the new components and patterns.

## What was wrong

| Problem | Where | Why it matters |
| --- | --- | --- |
| Fields of different heights in the same row | Add a letting, comparables, viewing times, rent check | Each field in a row stretched to the tallest one, so a field without a hint grew to 56px beside a 44px neighbour. Safari drew selects and dates taller again. It read as broken. |
| Hints between the label and the field | Every form | A hint on one field pushed its box below its neighbours'. |
| One long form | Add a letting (21 fields, 5 boxes), the offer, the tenancy page, settings | Everything at once is overwhelming, and nothing says where to start. |
| A box around everything | Every page | Equal-weight boxes stacked down the page gave no hierarchy. |
| Permanent explainer boxes | Shortlist ("How Gaff ranks"), Applications ("How to choose"), Criteria, Rent check | Detail most people read once pushed the task down the page every time. |
| Buttons everywhere | Letting overview (four secondary buttons and a primary) | Competing actions hide the one that matters. |
| Heavy header on every letting page | Letting pages | Step line, title, the address again, nine bordered pills and seven tabs came before any content, wrapping to several lines. |
| Every tab from day one | Letting pages | A home being set up showed Applications and Tenancy tabs with nothing in them. |
| Questions that don't apply | Rent check, viewing times, welcome | Asked about the last tenancy's end for a first letting; asked for a group size on individual slots; asked a landlord for a PSRA licence. |
| Wide forms | Workspace forms | Inputs 1,000px wide on a laptop. |
| Tables that scroll sideways on a phone | Enquiries, shortlist, the landlord's ranking | The design system says they become stacked cards. |
| Renter pages that read as documents | Every renter page | Generic notice boxes for the main message, no clear "what happens next", and a select where two taps would do. |
| Stale words | Applications, after an offer is accepted | Still said the tenancy steps would come "in a later update", but they're built. |

## The rules we redesigned to

1. **One task per screen, one primary action.** The next thing to do is the strongest thing on the page.
2. **Progressive disclosure.** Show what's needed now. Explanations, rare actions and questions that don't apply wait until they're wanted.
3. **Everything lines up.** One control height per context, labels directly above their fields, rows that align whatever hints or errors they have.
4. **Hierarchy through space and type, not boxes.** One panel per form, hairlines between groups, quiet fills for asides.
5. **Always say what happens next**, and when (design principle 2), in a consistent place.
6. **The same pattern for the same job.** A list of things to do, a status message, a set of steps and an empty state each look the same wherever they appear.
7. **Phone and laptop both.** Forms in a readable column, tables that stack, the main button full width on a phone.

## New and changed components

All are in `src/ui`, use design tokens only, and are documented in [design-system.md](design-system.md#components).

| Component | What it's for |
| --- | --- |
| Fields (changed) | One height (44px in the workspace, 48px on renter pages). Label, then control, then error, then hint, so a row of fields lines up. Fields in `Columns` share the row's tracks (CSS subgrid), so they align even when a label wraps. Selects have one chevron in every browser. `width` hints at an answer's length. `ChoiceGroup inline` puts short answers side by side. |
| `FormPanel` and plain sections | A whole form in one panel, groups divided by hairlines. |
| `Disclosure` | Detail or a rare action behind a summary line. Native `<details>`. |
| `SummaryList` | Label and value rows: key facts, an offer's terms, payment details. |
| `ActionList` and `ActionRow` | Whole-row links with an icon tile: Needs you today, the lettings list, the set-up checklist. |
| `EmptyState` | Nothing here yet: what will appear, and when. |
| `Outcome` | The main message of a page with nothing to fill in: "You're on the waiting list", "The home has been let". |
| `StepIndicator` | Where you are in a short multi-step form. |
| `StepCard` | One step of a process done in order: tenancy steps, a renter's checks. |
| `StageTracker` (changed) | Nine stages as one slim bar with names on a laptop, instead of nine pills. |
| `StageMeter` | A letting's progress in a list row. |
| `CopyButton` | Copies an IBAN, a payment reference, a Gaff address or a landlord's link. |
| `PageHeader` (changed) | Optional back link; actions wrap under the title on a phone. |
| `CardHeader`, `Narrow`, `BackLink`, `Cell` | Card titles with an action, a 720px column for forms, a link up a level, table cells that stack on a phone. |

## What changed, flow by flow

### Workspace

- **Dashboard.** Lettings are whole-row links with a progress meter, a status pill and the step in words. With no lettings, the only "Add a letting" button is in the empty state.
- **Add a letting.** Three short steps instead of one long form: the home, key facts, then the optional adverts and landlord.
  - Each step is checked with the same rules as the server before moving on.
  - A field's error clears as soon as it's edited.
  - Back keeps what was typed, and anything the server still finds goes back to that step.
  - The second address line appears only when it's wanted.
- **A letting's header.** A back link, the step and live status, the address, one line of figures and a slim stage bar. Tabs appear as the letting reaches their stage: a home being set up shows Overview and Timeline only.
- **Overview.**
  - Set-up is a checklist. Each step is a row with what's been entered, and the next step carries the page's one primary button.
  - Once live, "What needs you" lists this home's tasks in the dashboard's words.
  - Summary cards have quiet "Change" links instead of buttons.
  - Closing the letting waits behind a disclosure.
- **Set-up tasks** (viewing times, criteria, rent check, comparables). Each is a focused page with a back link, no tabs and a 720px column.
  - The rent check asks only what applies to your first answer.
  - Viewing times show only the slot length or the group size, whichever applies.
  - Explanations sit behind "Why only these four?" and "The rules from 1 March 2026".
- **Shortlist.** One line on how ranking works, with the detail behind a disclosure. A count of places at the top, and a table that stacks on a phone.
- **Attendance.** Each day is a card of rows. Pressed answers show their status tint, icon and word.
- **Applications.** Applicant cards to compare side by side, each check on one line, and the landlord's approval and the offer only once someone's chosen. The offer form is compact: deposit and date side by side, time to answer as three choices.
- **Tenancy.** Five numbered steps (agreement, payment, RTB, moving in, finish). Each shows its status in its header. Steps that can't start yet say why in one line, and the inventory form waits behind "Add an item".
- **Approvals, Questions, Needs attention.** One inbox card each: who and what, when, the quoted message, and the actions on one row.
- **Settings.** A settings layout: what each setting means on the left, its form on the right. The Gaff address comes first, with a copy button, and the forwarding steps sit behind a disclosure.
- **Sign-in and set-up.** One centred card each. The PSRA licence is asked for only once "letting agency" is chosen.

### Renters, referees and landlords

- **Every private page.** The agency's name with its initial, the AI disclosure in words (rule 6), 48px controls, hints at 16px, and "Want to talk to a person?" in the footer.
- **The home.** Its address as the title, then where, how much and when.
- **Questions, apply, checks.** A short intro, the form, then a "What happens next" panel.
  - Short answers sit side by side.
  - Checks are three numbered steps, the next one first in line.
  - Ticking "I haven't rented before" puts the landlord fields away.
- **Booking.** Times in a two-across grid of big cards on a phone. Your booked viewing is its own card, with cancel.
- **Status messages** (waiting list, not invited, the home's let, application in) are calm outcome panels with an icon, never a colour alone.
- **The offer.** An "An offer for…" message, the terms in one card, the deadline, then Accept and a quieter Decline.
- **Paying.** Amounts in one card, and the account in another with copy buttons for the IBAN and reference. The phone check warning stays.
- **The tenancy.** Each step has an icon (done, next, to come) instead of "Done" and "To do" pills.
- **The landlord's pages.** The same header as renter pages, the figures as tiles, the ranking stacking on a phone, and Approve or Decline side by side for each person.

## Checked by

- All 27 end-to-end journeys pass, each page with an axe check (WCAG 2.2 AA). The R1 journey now also proves the three steps of "Add a letting", errors per step, Back keeping what was typed, and set-up showing only two tabs.
- Focus rings and dark mode are checked as before (`tests/e2e/design.spec.ts`).
- `pnpm check` passes: tokens, typecheck, lint, unit, integration and build.

## Still to do

- Sticky action bars for long forms on a laptop, and a live count of who's ticked on the shortlist (both need a little script).
- Editing a letting's key facts after it's created. There's no screen for it yet, so the set-up checklist shows key facts as done without a link.
- Dialogs, toasts and skeleton loaders, still on the design system's to-build list.
- A founder review of the dark theme on the new screens.
