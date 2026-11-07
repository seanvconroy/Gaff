# Prompt for Claude Design: Gaff design system

Paste everything below the line into Claude Design. Swap the brand directions in section 4 for your own ideas, or ask for more.

---

## 1. What you're designing

Design the design system and key screens for **Gaff**, an Irish lettings product. It should feel like a world-class tech product, in the class of Revolut, Stripe, Ramp, Linear and Mercury:
- modern, premium, minimal and calm;
- built on UX best practice, with no decoration for its own sake.

I want to explore colour, type and branding freely with you. The structure, accessibility and UX rules below are fixed.

**What Gaff does.** Gaff runs the letting of a home for Irish letting agents and landlords, from the first Daft or MyHome enquiry to a signed tenancy.
- The AI does the work: it replies to enquiries, books viewings, chases references and drafts documents.
- A person makes the three decisions that matter: who views, who is offered the home, and what is signed.
- Renters use it free.

**Two audiences, two surfaces:**

1. **Operators** (letting agents, landlords). A **workspace**, used mostly on a laptop, but every screen must also work well on a phone. They're busy and juggle many homes. They need to see at a glance:
   - what needs them today;
   - what stage each home is at;
   - one clear next action.

   Think Stripe Dashboard or Ramp: dense but calm, scannable tables, a strong hierarchy.
2. **Renters, referees and landlords.** **Private pages** opened from a link in an email or text, on a phone, with no account and no app. They're often anxious, because finding a home in Ireland is hard. Each page does one thing, explains what happens next, and feels trustworthy and kind. Think Revolut or Monzo onboarding: one task per screen, big touch targets, reassuring.

## 2. Fixed rules (not open to taste)

**Accessibility:**
- WCAG 2.2 AA everywhere, in light and dark themes.
- Text contrast is at least 4.5:1, and 3:1 for large text and UI parts.
- Touch targets are at least 44×44px.
- A visible focus ring on every interactive element.
- Nothing is conveyed by colour alone: status always comes with an icon or words.
- Renter pages never go below 16px for anything the renter must read or act on.

**Responsive:** design mobile (390px) and desktop (1440px) for every key screen, and say how layouts collapse in between.
- The workspace navigation becomes a bottom bar or menu on mobile.
- Tables become stacked cards.

**One primary action per view.** One accent moment per screen: if two things shout, one is wrong.

**Status semantics:** success, warning, danger and info, each with an icon.
- A renter who fails a check (ID, income, references) is shown in **warning**, never danger, with a plain reason. Failing a check is not an error, and a person still decides.
- Danger is only for things that went wrong, such as a send that failed or a destructive action.

**Fairness is visible.** Rankings and decisions always show the reason in words (for example "Meets 3 of 4 criteria"). Never show an unexplained score.

**AI is labelled.** Anything the AI wrote or suggested is marked as such, and a person approves it before it goes out. There needs to be a clear, calm pattern for "drafted by the AI, waiting for you".

**Tone of every word:** plain, warm Irish English. Short sentences, no jargon, no exclamation marks, no blame.
- Every screen ends with what happens next, and when.
- Dates read "Thursday 6 November, 6pm"; money reads "€1,850 a month".
- Homes are named by their address, never an ID.

**Implementation:** the system will be built as CSS variables in a Next.js app, with CSS Modules and no inline styles.
- Fonts must be free to self-host (Google Fonts or similar).
- Icons are one line-icon set. Lucide is in use today and can change if you argue for it.

## 3. What to deliver

1. **Brand directions.** Three to four distinct directions, each with:
   - a palette;
   - a type pairing;
   - a wordmark treatment ("Gaff" is a working name, with no logo yet);
   - one sample screen.

   I'll pick one or mix them.
2. **Design tokens** for the chosen direction, with **light and dark themes**. Keep these semantic roles, so the app can switch over without rework. You can add roles; say why.
   - **Surfaces:** `surface-0` (page), `surface-1` (cards, inputs), `surface-2` (quiet fills).
   - **Text:** `ink`, `ink-muted`, `ink-inverse`.
   - **Lines:** `border`, `border-strong`.
   - **Action:** `primary`, `primary-hover`.
   - **Brand:** brand colours (today `forest`, `brick`, `brick-text`, `peach`; rename freely).
   - **Status:** `success`, `warning`, `danger`, `info`, each with a background tint and a text-safe shade.
   - **Focus:** `focus`.
   - **Type scale:** `display`, `heading`, `title`, `body`, `body-sm`, `label`, `caption`, with font, size, line height, weight and letter spacing.
   - **Spacing:** a 4px scale, `space-1` to `space-16`.
   - **Radius:** `radius-sm`, `radius-md`, `radius-lg`, `radius-pill`.
   - **Elevation:** shadows, used sparingly.
   - **Motion:** durations and easing, respecting reduced motion.

   Give the tokens as a table and as JSON, with contrast ratios for every text and background pair.
3. **Components**, with states (default, hover, focus, active, disabled, loading, error) and mobile and desktop sizes:
   - buttons (primary, secondary, quiet, destructive);
   - text fields, textarea, select, radio and checkbox groups, file and photo upload;
   - status pill, notice or banner (four tones), empty state, toast;
   - card, table and its mobile card form, stage tracker (9 stages), tabs, page header, side navigation and mobile navigation, dialog, skeleton loader;
   - an "AI draft awaiting approval" pattern;
   - a typed-name signature field.
4. **Key screens**, each in mobile and desktop:
   - **Workspace:**
     - dashboard: "needs you today", lettings by stage, time saved;
     - letting overview with the stage tracker;
     - enquiries list;
     - shortlist with ranked renters and reasons, and an "invite" action;
     - applications side by side;
     - approvals queue for AI drafts;
     - tenancy tab: agreement, payment, RTB registration, move-in;
     - settings.
   - **Renter:**
     - pre-viewing questions;
     - book a viewing (choose a time);
     - apply (income);
     - checks (ID, income, referee);
     - an offer to accept or decline;
     - read and sign the agreement;
     - payment details;
     - a calm "thanks, here's what happens next" screen.
   - **Sign-in:** an email link, with no password.
5. **Short usage guidelines:** when to use each component, the layout grid, density rules for the workspace versus renter pages, and do's and don'ts.

## 4. Brand directions to explore

Treat these as starting points to push against, not a brief to copy.

- **Calm Irish premium.** Deep green or ink, warm off-white, one warm accent. Editorial serif headings and a clean sans for UI. (This is close to today's look: cream, forest green, brick accent, Fraunces and DM Sans.)
- **Fintech precise.** Near-white and near-black, one vivid brand colour, a single modern grotesk (Inter, Geist or similar), tight grids. Stripe or Ramp energy.
- **Soft and human.** Light neutrals, gentle rounded shapes, a friendly sans, plenty of air. Revolut or Monzo warmth for anxious renters.
- **Your own wildcard.**

Sample content, all made up: 12 Ranelagh Road, Ranelagh, Dublin 6, €1,850 a month; renters Aoife Byrne, Ciarán Ó Súilleabháin and Nora Walsh; agency Halcyon Lettings.
