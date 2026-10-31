# Gaff

Gaff runs the letting of a home, from the first enquiry to a signed tenancy, for Irish letting agents and landlords. Renters use it free. This design system covers both sides: the operator's workspace (laptop first) and the renter's pages (phone first).

This first version is built from the Gaff pitch deck's look: cream ground, deep forest green, brick accent, Fraunces for headings and DM Sans for everything else. "Gaff" is a working name and there is no logo yet, so the wordmark is plain Fraunces type.

## Principles

1. **Calm in a stressful moment.** Renters are anxious and agents are busy. Warm, quiet surfaces; one thing to do per screen.
2. **Always say what happens next.** Every screen and message ends with the next step and when it happens.
3. **Fair and visible.** Show why someone is where they are: criteria, reasons and dates in plain words.
4. **Borders, not shadows.** Hairlines (`border`) separate things. `shadow-overlay` is only for menus and dialogs.
5. **One accent.** `brick` marks the single most important thing on a screen. If two things are brick, one is wrong.

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

- **Grounds:** `surface-0` is the page; `surface-1` lifts cards, inputs and renter pages; `surface-2` is for quiet fills (table headers, selected rows).
- **Text:** `ink` for text, `ink-muted` for secondary lines. Both pass 4.5:1 on every surface, in both themes.
- **Action:** `primary` fills the main button. One primary button per view.
- **Brand:** `forest` and `peach` are for brand blocks (heroes, the cover, big panels). `brick` is the accent for fills and large type; use `brick-text` for small text and links.
- **Status:** `success`, `warning`, `danger`, `info`. Always pair a status colour with a word or an icon, never colour alone.
- **Renters who fail a check** are shown in `warning` with a plain reason, never `danger`. Failing a check is not an error, and a person still decides.

## Type

- **Fraunces** (`display`, `heading`): page titles, addresses, big numbers. Never for body text or buttons.
- **DM Sans** (`title`, `body`, `body-sm`, `label`, `caption`): everything else.
- Renter pages never go below `body` (16px) for anything the renter must read or act on.
- Both are Google Fonts: load Fraunces (weights 400 to 700) and DM Sans (400 to 700).

## Space and shape

- 4px base: `space-1` to `space-16`. Renter pages use a `space-4` side gutter; operator pages use `space-6` card padding.
- `radius-lg` for cards, `radius-md` for buttons, `radius-sm` for inputs, `radius-pill` for status pills.
- Touch targets at least 44px tall on renter pages.

## Iconography

No icon set is chosen yet. Proposal: a 1.5px-stroke line set (for example Lucide), in `ink` or `ink-muted`, 20px in the operator workspace and 24px on renter pages. No filled or emoji icons.

## Accessibility

- WCAG 2.2 AA on every page.
- `focus`: a 2px outline at a 2px offset on every interactive element.
- Status is never shown by colour alone.

## Still to build

Logo, icon set, and components: button, input, status pill, letting card, applicant row, stage tracker, message bubble, viewing slot picker, check result, notice.
