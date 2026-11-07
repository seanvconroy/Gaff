# Gaff

Gaff runs the letting of a home, from the first enquiry to a signed tenancy, for Irish letting agents and landlords. Renters use it free. This design system covers both sides: the operator's workspace (laptop first, and it works on a phone) and the private pages for renters, referees and landlords (phone first).

The look is **A4, Navy and Atlantic**, chosen from the Claude Design directions in November 2026: a warm cream ground, navy for the workspace navigation and the main buttons, a soft Atlantic blue as the one accent, Fraunces for headings and DM Sans for everything else. "Gaff" is a working name with no logo yet. The wordmark is "gaff." in Fraunces at its display optical size, with an Atlantic full stop.

Every value lives in `docs/design-tokens.json`. `pnpm tokens` turns it into CSS variables, such as `var(--color-navy)` and `var(--space-4)`, and CSS Modules use nothing else (ADR-0011).

## Principles

1. **Calm in a stressful moment.** Renters are anxious and agents are busy. Warm, quiet surfaces; one thing to do per screen.
2. **Always say what happens next.** Every screen and message ends with the next step and when it happens.
3. **Fair and visible.** Show why someone is where they are: criteria, reasons and dates in plain words.
4. **Borders, not shadows.** Hairlines (`border`) separate things. `shadow-overlay` is only for menus, popovers, dialogs and toasts.
5. **One accent.** `atlantic` and `atlantic-text` mark the single most important thing on a screen, such as how many things need you on the dashboard, or the current stage of a letting. If two things are Atlantic, one is wrong. The wordmark's full stop is the brand, not an accent.

## Voice

Plain, warm Irish English. Short sentences. No jargon, no exclamation marks, no blame.

| Instead of | Write |
| --- | --- |
| Your application has been unsuccessful. | The landlord has chosen another applicant for 12 Ranelagh Road. Thanks for viewing it. |
| Submit documentation | Send your payslips |
| Pending verification | We're checking your ID. This usually takes a few minutes. |
| An error occurred | That didn't send. Check your connection and try again. |

- Name the home by its address, not an ID.
- Dates as "Thursday 6 November, 6pm", not "06/11 18:00".
- Euro as €1,850 a month.
- The AI says it is an AI assistant, in its first message.

## Colour

- **Grounds:** `surface-0` is the page; `surface-1` lifts cards, inputs and the renter's pages; `surface-2` is for quiet fills (table headers, grouped info).
- **Text:** `ink` for text, `ink-muted` for secondary lines. Both pass 4.5:1 on every surface, in both themes.
- **Action:** `primary` fills the main button, with `ink-inverse` text. One primary button per view.
- **Brand:** `navy` is for brand blocks: the workspace navigation, hero bands, large panels. Text on navy uses `nav-ink`, never `ink-inverse`. `atlantic` is the accent for fills and large type; `atlantic-text` is the same blue for small text, links and the focus ring. `sky` is the soft brand fill; text on it is `ink`, never `atlantic-text`.
- **Status:** `success`, `warning`, `danger` and `info` colour text and icons. Each has a `-bg` tint for pills and notices. Always pair a status colour with words or an icon, never colour alone. `info` is teal, so it never reads as the brand blue.
- **Renters who fail a check** are shown in `warning` with a plain reason, never `danger`. Failing a check is not an error, and a person still decides. `danger` is only for things that went wrong, such as a send that failed, and for destructive actions.
- **AI:** `ai` and `ai-bg` mark anything the AI wrote or suggested. They match `info` today and have their own names so they can change without touching components.
- **Navigation:** `nav-bg`, `nav-ink`, `nav-ink-muted`, `nav-active` and `nav-focus` are for the navy sidebar and the phone's bottom bar. The usual focus ring is too faint on navy (2.2:1), so focus rings there use `nav-focus`.
- **Overlay:** `overlay` is the scrim behind dialogs and the mobile menu (there are none yet).

The old brand names went with A4: `forest` is now `navy`, `brick` is `atlantic`, `brick-text` is `atlantic-text` and `peach` is `sky`. Nothing uses the old names.

### Colour tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `surface-0` | `#f7f3ec` | `#10151d` | Page background everywhere: the warm cream ground. |
| `surface-1` | `#fffdf9` | `#171d28` | Cards, panels, inputs and the renter’s pages: one step up from the page. |
| `surface-2` | `#ede6da` | `#202836` | Quiet fills: table headers, selected rows, grouped info, the next-step panel. |
| `ink` | `#18223a` | `#f3eee6` | Body text, headings and icons on any surface. |
| `ink-muted` | `#4a5262` | `#b3bccb` | Secondary text: hints, timestamps, helper copy. |
| `ink-inverse` | `#f7f3ec` | `#10151d` | Text and icons on primary fills. |
| `border` | `#d8cfc0` | `#2c3544` | Hairlines: card edges, dividers, table rules. Decorative only. |
| `border-strong` | `#847b6f` | `#737f93` | Edges of inputs, checkboxes, radios and secondary buttons (3:1 on every surface). |
| `primary` | `#1b2a4a` | `#e9e2d6` | Primary buttons: the one main action on a screen. |
| `primary-hover` | `#2a3b60` | `#f7f3ec` | Hover and pressed state of primary. |
| `navy` | `#1b2a4a` | `#2c3f68` | Brand blocks: the workspace sidebar, hero bands, large panels. Text on it uses nav-ink. Was `forest`. |
| `atlantic` | `#4a6fa5` | `#8eaedb` | The accent: one emphasis per screen (the wordmark full stop, a key number). Fills and large type. Was `brick`. |
| `atlantic-text` | `#3e5f90` | `#a3bde3` | Atlantic for small text, links and the focus ring. Was `brick-text`. |
| `sky` | `#c9d8ea` | `#24334b` | Soft brand fill: selected rows, brand blocks, illustration. Text on it is ink, never atlantic-text. Was `peach`. |
| `success` | `#2e6b3f` | `#86c79b` | Done, verified, passed: check results, signed, paid. Text and icons. |
| `success-bg` | `#eaeee6` | `#29383a` | Background tint for success pills and notices. |
| `warning` | `#8a5a00` | `#e2b45c` | Needs attention, including a renter who did not meet a check. Text and icons. |
| `warning-bg` | `#f3ede0` | `#373530` | Background tint for warning pills and notices. |
| `danger` | `#a3261c` | `#f08a80` | Something went wrong (a send failed) or a destructive action. Never for a renter who failed a check. |
| `danger-bg` | `#f6e8e3` | `#3a2e36` | Background tint for danger pills and notices. |
| `info` | `#1f6672` | `#7cc3cb` | Neutral notices and viewings booked. Teal, so it never reads as the brand blue. |
| `info-bg` | `#e9eeec` | `#273842` | Background tint for info pills and notices. |
| `ai` | `{info}` (#1f6672) | `{info}` (#7cc3cb) | Anything the AI wrote or suggested (“Drafted by AI”). Same as info today; its own name so it can change later. |
| `ai-bg` | `{info-bg}` (#e9eeec) | `{info-bg}` (#273842) | Background for the AI label and the AI draft card header. |
| `focus` | `{atlantic-text}` (#3e5f90) | `{atlantic-text}` (#a3bde3) | Focus ring: 2px outline, 2px offset, on every interactive element. |
| `nav-bg` | `{navy}` (#1b2a4a) | `#121a2b` | Workspace sidebar and the mobile bottom bar. |
| `nav-ink` | `#f7f3ec` | `#f3eee6` | Active item and labels on nav-bg and navy. |
| `nav-ink-muted` | `#c3cbdb` | `#aab4c4` | Inactive items and counts on nav-bg. |
| `nav-active` | `#2a3b60` | `#1f2a40` | Background of the active nav item. |
| `nav-focus` | `{sky}` (#c9d8ea) | `{atlantic-text}` (#a3bde3) | Focus ring inside the navy sidebar and bottom bar, where focus would be too faint (2.2:1). |
| `overlay` | `rgba(24, 34, 58, 0.48)` | `rgba(0, 0, 0, 0.6)` | Scrim behind dialogs and the mobile menu. |

### Contrast, both themes

Text needs 4.5:1, large text and accent fills 3:1, and edges, controls and focus rings 3:1. Every pair below passes. The numbers come from `docs/design-tokens.json`, and `scripts/tokens/lib.test.ts` checks each one, in both themes, whenever a value changes.

| Foreground | Background | Rule | Light | Dark |
| --- | --- | --- | --- | --- |
| `ink` | `surface-0` | text (4.5:1) | 14.29:1 | 15.85:1 |
| `ink` | `surface-1` | text (4.5:1) | 15.56:1 | 14.63:1 |
| `ink` | `surface-2` | text (4.5:1) | 12.74:1 | 12.82:1 |
| `ink` | `sky` | text (4.5:1) | 10.91:1 | 11.02:1 |
| `ink-muted` | `surface-0` | text (4.5:1) | 7.10:1 | 9.57:1 |
| `ink-muted` | `surface-1` | text (4.5:1) | 7.73:1 | 8.83:1 |
| `ink-muted` | `surface-2` | text (4.5:1) | 6.33:1 | 7.74:1 |
| `atlantic-text` | `surface-0` | text (4.5:1) | 5.85:1 | 9.54:1 |
| `atlantic-text` | `surface-1` | text (4.5:1) | 6.37:1 | 8.81:1 |
| `atlantic-text` | `surface-2` | text (4.5:1) | 5.22:1 | 7.72:1 |
| `ink-inverse` | `primary` | text (4.5:1) | 12.86:1 | 14.22:1 |
| `ink-inverse` | `primary-hover` | text (4.5:1) | 10.03:1 | 16.55:1 |
| `nav-ink` | `nav-bg` | text (4.5:1) | 12.86:1 | 15.05:1 |
| `nav-ink` | `nav-active` | text (4.5:1) | 10.03:1 | 12.42:1 |
| `nav-ink` | `navy` | text (4.5:1) | 12.86:1 | 9.01:1 |
| `nav-ink-muted` | `nav-bg` | text (4.5:1) | 8.73:1 | 8.30:1 |
| `nav-ink-muted` | `nav-active` | text (4.5:1) | 6.81:1 | 6.86:1 |
| `success` | `success-bg` | text (4.5:1) | 5.43:1 | 6.19:1 |
| `success` | `surface-0` | text (4.5:1) | 5.77:1 | 9.29:1 |
| `success` | `surface-1` | text (4.5:1) | 6.28:1 | 8.57:1 |
| `success` | `surface-2` | text (4.5:1) | 5.14:1 | 7.51:1 |
| `warning` | `warning-bg` | text (4.5:1) | 5.08:1 | 6.37:1 |
| `warning` | `surface-0` | text (4.5:1) | 5.36:1 | 9.52:1 |
| `warning` | `surface-1` | text (4.5:1) | 5.83:1 | 8.78:1 |
| `warning` | `surface-2` | text (4.5:1) | 4.78:1 | 7.70:1 |
| `danger` | `danger-bg` | text (4.5:1) | 6.16:1 | 5.33:1 |
| `danger` | `surface-0` | text (4.5:1) | 6.66:1 | 7.54:1 |
| `danger` | `surface-1` | text (4.5:1) | 7.25:1 | 6.96:1 |
| `danger` | `surface-2` | text (4.5:1) | 5.94:1 | 6.10:1 |
| `info` | `info-bg` | text (4.5:1) | 5.59:1 | 6.08:1 |
| `info` | `surface-0` | text (4.5:1) | 5.93:1 | 9.18:1 |
| `info` | `surface-1` | text (4.5:1) | 6.46:1 | 8.47:1 |
| `info` | `surface-2` | text (4.5:1) | 5.29:1 | 7.42:1 |
| `ai` | `ai-bg` | text (4.5:1) | 5.59:1 | 6.08:1 |
| `ink` | `success-bg` | text (4.5:1) | 13.45:1 | 10.57:1 |
| `ink` | `warning-bg` | text (4.5:1) | 13.55:1 | 10.61:1 |
| `ink` | `danger-bg` | text (4.5:1) | 13.22:1 | 11.20:1 |
| `ink` | `info-bg` | text (4.5:1) | 13.48:1 | 10.51:1 |
| `atlantic-text` | `success-bg` | text (4.5:1) | 5.51:1 | 6.36:1 |
| `atlantic-text` | `warning-bg` | text (4.5:1) | 5.55:1 | 6.38:1 |
| `atlantic-text` | `danger-bg` | text (4.5:1) | 5.42:1 | 6.74:1 |
| `atlantic-text` | `info-bg` | text (4.5:1) | 5.52:1 | 6.32:1 |
| `atlantic` | `surface-0` | large (3:1) | 4.62:1 | 8.04:1 |
| `atlantic` | `surface-1` | large (3:1) | 5.03:1 | 7.42:1 |
| `border-strong` | `surface-0` | ui (3:1) | 3.76:1 | 4.52:1 |
| `border-strong` | `surface-1` | ui (3:1) | 4.10:1 | 4.17:1 |
| `border-strong` | `surface-2` | ui (3:1) | 3.36:1 | 3.66:1 |
| `focus` | `surface-0` | ui (3:1) | 5.85:1 | 9.54:1 |
| `focus` | `surface-1` | ui (3:1) | 6.37:1 | 8.81:1 |
| `focus` | `surface-2` | ui (3:1) | 5.22:1 | 7.72:1 |
| `focus` | `success-bg` | ui (3:1) | 5.51:1 | 6.36:1 |
| `focus` | `warning-bg` | ui (3:1) | 5.55:1 | 6.38:1 |
| `focus` | `danger-bg` | ui (3:1) | 5.42:1 | 6.74:1 |
| `focus` | `info-bg` | ui (3:1) | 5.52:1 | 6.32:1 |
| `nav-focus` | `nav-bg` | ui (3:1) | 9.82:1 | 9.06:1 |
| `nav-focus` | `nav-active` | ui (3:1) | 7.66:1 | 7.48:1 |
| `ink-inverse` | `danger` | text (4.5:1) | 6.66:1 | 7.54:1 |
| `ink-inverse` | `atlantic` | text (4.5:1) | 4.62:1 | 8.04:1 |
| `primary` | `surface-0` | ui (3:1) | 12.86:1 | 14.22:1 |
| `primary` | `surface-1` | ui (3:1) | 14.00:1 | 13.13:1 |

The wordmark's full stop is Atlantic on navy in the sidebar (2.78:1 in light). That's allowed: a logotype has no contrast minimum.

## Type

- **Fraunces** (`display-xl`, `display`, `display-mobile`, `heading`): page titles, addresses, big numbers. Never for body text or buttons.
- **DM Sans** (`title`, `body`, `body-sm`, `label`, `caption`): everything else.
- Page titles use `display` on a laptop and `display-mobile` at phone width. Renter, referee and landlord pages use `display-mobile` for their titles.
- Renter pages never go below `body` (16px) for anything the renter must read or act on. `body-sm` and `caption` are for the workspace and fine print. Status pills on renter pages are body size (`large`).
- `label` is uppercase through its type style, so eyebrows and table headers need no extra rule.
- Sizes are in rem in the CSS (16px = 1rem), so they follow the reader's browser text size.
- Both fonts are self-hosted (`public/fonts`, from the `@fontsource-variable` opsz files) with the weight and optical-size axes. The browser picks the optical size from the font size, so big Fraunces gets its display cut and small DM Sans its text cut.

| Style | Font | Size / line | Weight | Letter spacing | Use |
| --- | --- | --- | --- | --- | --- |
| `display-xl` | Fraunces | 56/60px | 600 | -0.01em | Marketing heroes only. |
| `display` | Fraunces | 40/44px | 600 | -0.01em | Page titles: the letting’s address, the renter’s home. |
| `display-mobile` | Fraunces | 30/36px | 600 | -0.01em | Page titles at phone width (390px), on renter pages and the workspace. |
| `heading` | Fraunces | 28/34px | 600 | -0.01em | Section headings and big numbers (days to let, time saved). |
| `title` | DM Sans | 20/28px | 600 | 0 | Card titles and dialog titles. |
| `body` | DM Sans | 16/24px | 400 | 0 | Default text. Never smaller on renter pages. |
| `body-sm` | DM Sans | 14/20px | 400 | 0 | Dense workspace tables and secondary lines. Workspace only. |
| `label` | DM Sans | 13/16px | 600 | 0.06em, uppercase | Uppercase eyebrows and table headers. Status pills use its size and weight, in sentence case. |
| `caption` | DM Sans | 12/16px | 400 | 0 | Footnotes and fine print. Never for anything a renter must read or act on. |

## Space and shape

- A 4px base, `space-1` to `space-16`. Renter pages use a `space-4` side gutter; workspace cards use `space-6` padding; workspace list rows use `space-5` insets.
- `radius-lg` for cards, panels and dialogs; `radius-md` for buttons, menus, list rows, choice cards and viewing slots; `radius-sm` for inputs and small chips; `radius-pill` for status pills.
- Touch targets are at least 44px. Links inside sentences are the only exception.

| Token | Value | Use |
| --- | --- | --- |
| `space-1` | 4px | Icon to label; tight inline gaps. |
| `space-2` | 8px | Between related items: a label and its field. |
| `space-3` | 12px | Inside compact controls and table cells. |
| `space-4` | 16px | Card padding on mobile; the side gutter on renter pages. |
| `space-5` | 20px | Row insets in workspace lists. |
| `space-6` | 24px | Card padding on desktop; between fields in a form. |
| `space-8` | 32px | Between sections inside a page. |
| `space-10` | 40px | Between page header and content on desktop. |
| `space-12` | 48px | Between major page regions. |
| `space-16` | 64px | Hero and marketing spacing. |
| `radius-sm` | 6px | Inputs, checkboxes, small chips. |
| `radius-md` | 10px | Buttons, menus, list rows, viewing slots. |
| `radius-lg` | 16px | Cards, panels and dialogs. |
| `radius-pill` | 999px | Status pills and avatars. |
| `shadow-overlay` | light `0 8px 24px rgba(24, 34, 58, 0.14)`, dark `0 8px 24px rgba(0, 0, 0, 0.5)` | Menus, popovers, dialogs and toasts only. Everything else uses borders, not shadows. |

## Motion

Only colours change, on hover, press and focus: nothing slides or bounces. With reduced motion on, every duration is 0ms, so nothing animates.

| Token | Value | Use |
| --- | --- | --- |
| `motion-fast` | `120ms` | Hover, press, focus, small colour changes. |
| `motion-base` | `200ms` | Expanding rows, tabs, fades. |
| `motion-slow` | `320ms` | Dialogs, sheets and the mobile menu. |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Most movement. |
| `ease-enter` | `cubic-bezier(0, 0, 0, 1)` | Things arriving on screen. |
| `ease-exit` | `cubic-bezier(0.3, 0, 1, 1)` | Things leaving the screen. |

## Components

- **Primary button:** `primary` fill, `ink-inverse` text, `radius-md`, as tall as the fields beside it (44px in the workspace, 48px on the private pages), `primary-hover` on hover and press. One per view.
- **Secondary button:** `surface-1` fill, 1px `border-strong` edge, `ink` text; `surface-2` on hover.
- **Quiet button:** no fill or edge, `ink` text; `surface-2` on hover.
- **Destructive button:** `danger` fill, `ink-inverse` text, only for actions that delete or cancel something. Not built yet.
- **Links:** `atlantic-text`, turning `ink` on hover. Underlined in running text, so they never rely on colour alone.
- **Inputs and selects:** `surface-1` fill, 1px `border-strong` edge, `radius-sm`, and one height for every control: 44px in the workspace and 48px on the private pages (their shells set it), with buttons the same height beside them. The label sits directly above its control; the error and then the hint sit below it. A field never stretches to its neighbour's height, and fields in a row (`Columns`) share the row's tracks, so they line up even when a label wraps. Selects draw one chevron in every browser. On error, a 2px `danger` edge and a message with an icon that says what to do. `width` (`number`, `short`, `medium`) hints at an answer's length.
- **Choice cards** (radio and checkbox groups, viewing slots, picking applicants): a 1px `border-strong` edge and `radius-md`. The chosen one gets a 2px `primary` edge that grows inwards, so nothing moves. The focus ring goes round the whole card. A group's hint sits under its question, so it's read before choosing. Short answers (Yes and No, 24 hours to 3 days) sit side by side (`inline`).
- **Forms:** in a readable column (`Narrow`, 720px), never across a laptop. One panel per form (`FormPanel`), groups divided by hairlines rather than boxed. A long form becomes short steps with a `StepIndicator` (Add a letting), each step checked before moving on. Questions that don't apply stay hidden until the answer before makes them apply.
- **Status pills:** the status `-bg` tint, the status colour for the icon and words, and always both. Workspace pills are 13px semibold; renter pages use the body-size pill.
- **Notices:** the status `-bg` tint, the status icon in the status colour, and `ink` words.
- **AI drafts:** the "Drafted by AI" pill (`ai` on `ai-bg`, with the sparkle icon). A person approves before anything goes out.
- **Stage tracker:** nine stages as one slim bar: done in `success`, the current stage as the screen's Atlantic accent, the rest in `border`. Their names show under the bar on a laptop; on narrower screens the page's step line ("Step 2 of 9 · Enquiries") names the stage. In a list row, the `StageMeter` fills nine small segments in `primary` instead, so the accent isn't repeated on every row.
- **A letting's pages:** tabs appear as the letting reaches their stage (set-up shows Overview and Timeline only). Set-up tasks are focused pages with a back link and no tabs.
- **Disclosure:** detail most people need once ("How Gaff ranks"), or a rare action ("Close this letting"), behind a summary line with a chevron. Native `<details>`; `card` gives it a hairline edge.
- **Summary list:** label and value rows divided by hairlines, for key facts, an offer's terms and payment details. `split` puts short figures on the right in semibold. A quiet "Change" link can end a row or a card's header, instead of a button.
- **Action list:** hairline rows, each a whole-row link with an icon tile, its words and a chevron: Needs you today, the lettings list, a letting's set-up checklist. A row named by a title people look for (an address) makes the title the link, stretched over the row. The step to do next carries the page's one primary button.
- **Step card:** one step of a process done in order (a tenancy, a renter's checks): a number that becomes a tick, the title, the status in words, and what to do. The current step has a stronger edge; steps that can't start yet say why in one line.
- **Outcome:** the main message of a page with nothing to fill in, such as "You're on the waiting list": a status icon in its tint, a title, the words and what happens next. Never a colour alone, and never `danger` for a renter.
- **Empty state:** an icon, what will appear here and when, and at most one action.
- **What happens next:** on the private pages, a quiet `surface-2` panel ends each task with the next step and when.
- **Tables:** dense on a laptop; on a phone each row becomes a small card with each value's column name beside it. The column names are decorative there (screen readers hear them from the table's header).
- **Copy button:** beside anything people would otherwise retype: an IBAN, a payment reference, a Gaff address, a landlord's link. It says "Copied", and screen readers hear it.
- **Workspace navigation:** a `nav-bg` sidebar on screens wider than 900px, with the wordmark, the pages and who is signed in. Items are `nav-ink-muted`; the current page is `nav-ink` on `nav-active` and marked for screen readers. On phones it becomes a navy top bar (wordmark, sign out) and a bottom bar with the same items and tokens. The page keeps whatever has focus clear of the bottom bar.
- **"Needs you today":** one hairline row per thing to do, with 20px insets: an icon tile, the words, and a chevron. The whole row is the link. AI drafts get the AI tile; deadlines the warning tile. A letting's overview lists that home's rows in the same words.
- **Private pages** (renters, referees, landlords): the agency's initial in a navy circle and its name, the AI disclosure in words, the home's address as the title (`display-mobile`) with where, how much and when, then one task. The main button spans the screen on a phone.
- **Focus:** a 2px outline in `focus` at a 2px offset on every interactive element, and `nav-focus` inside the navigation.
- **Surfaces:** `surface-0` for the page, `surface-1` for cards and inputs, `surface-2` for quiet fills. Hairlines, not shadows.

## Iconography

Lucide line icons, never filled or emoji icons. 18px at a 1.75 stroke in the navigation and lists, 14px at a 2 stroke in workspace pills, 20px in notices. An icon always sits beside words, and is hidden from screen readers.

## Accessibility

- WCAG 2.2 AA on every page, in light and dark. Every end-to-end test runs axe.
- The contrast of every pair in the table above is checked in both themes.
- A 2px focus ring on every interactive element, including in the navigation.
- Status is never shown by colour alone.
- Touch targets of at least 44 by 44px.
- Reduced motion turns every transition off.

## Themes

Light is the default. Dark follows the system setting, and `data-theme="light"` or `data-theme="dark"` on `<html>` overrides it either way. The dark theme is new in A4 and built on navy-black. It passes AA throughout; the dashboard, a letting, Approvals and the booking screen have been looked at in dark.

## Still to build

- A logo. The wordmark stands in.
- From the A4 board's dashboard: lettings by stage, and the time saved this week.
- The destructive button, dialogs, toasts and skeleton loaders (`overlay` and `shadow-overlay` are ready for them).
- Counts beside the navigation items.
- Sticky action bars for long workspace forms.

The November 2026 UX review ([ux-review.md](ux-review.md)) explains why the forms, lists and private pages work the way they do.
