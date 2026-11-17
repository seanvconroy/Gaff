# Gaff

Gaff runs the letting of a home in Ireland, from the first enquiry to a signed tenancy, for letting agents and for landlords. Renters find homes on Gaff, or arrive from Daft or MyHome, and use it free. This design system covers both sides of the product, on a phone, a desktop and a future app. There is one design: every screen is drawn at phone width first, and a desktop gives it more room.

The look is **ink, white and Atlantic blue**, agreed in the UX redesign of November 2026 ([section 8](ux-redesign/08-design-system-direction.md), decisions Q29 and Q34). A white page. One cool grey for quiet fills. Ink, a blue-black, for text and the main button. One accent, Atlantic blue, used sparingly. One type family, DM Sans. Homes bring the colour, through their photographs. It replaces A4, "Navy and Atlantic": the cream ground, the navy panels and the serif titles are gone.

Gaff should feel like a calm, capable person who has done this a hundred times: quiet, clear, a little warm. Its own identity comes from four things: the wordmark, whose two "f"s read as a key; a calm blue on white; the plain Irish voice; and the "what happens next" line that ends every screen.

Every value lives in `docs/design-tokens.json`. `pnpm tokens` turns it into CSS variables, such as `var(--color-brand)` and `var(--space-4)`, and CSS Modules use nothing else (ADR-0011). The file is platform-neutral, so it can generate values for iOS and Android as it does for CSS.

Every component and its states can be seen on one page, at `/dev/ui`, when `DEV_TOOLS` is on. Narrow the window to see each phone layout. `/dev/ui/flow` shows the flow shell, and `/dev/ui/nav` the navigation for each kind of person.

## Principles

1. **Calm in a stressful moment.** Renters are anxious and agents are busy. Quiet surfaces; one thing to do per screen; one primary button.
2. **Always say what happens next.** Every screen and message ends with the next step and when it happens.
3. **Fair and visible.** Show why someone is where they are: criteria, reasons and dates in plain words.
4. **Space and type first, then a hairline, then a shadow.** Hierarchy comes from space and type. A hairline (`border`) separates groups. A box is only for something that is one object: a home, a person, a viewing. The page is flat; `shadow-raised` is for the few things that sit above it, and `shadow-overlay` for things that float over it.
5. **One accent.** The brand colour appears at most once per screen as an emphasis, plus on selected states, progress and links. If two things shout in blue, one is wrong. The wordmark's full stop is the brand, not an accent.
6. **One design, phone first.** The same steps, in the same order, with the same words at every width. Every adaptive component has exactly two layouts, below and above 900px. A screen never needs its own breakpoint.
7. **Nothing for show.** No decoration, no standing disclaimers, no motion that doesn't say where something came from or that something finished.

The fourteen principles every screen is held to are in [section 1](ux-redesign/01-users-and-principles.md) of the redesign.

## Voice

Plain, warm Irish English. Short sentences. No jargon, no exclamation marks, no blame.

| Instead of | Write |
| --- | --- |
| Your application has been unsuccessful. | The landlord has chosen another applicant for 12 Ranelagh Road. Thanks for viewing it. |
| Submit documentation | Send your payslips |
| Pending verification | We're checking your ID. This usually takes a few minutes. |
| An error occurred | That didn't send. Check your connection and try again. |
| You entered an invalid amount | Enter the rent a month, like 1,850. |

- Name the home by its address, not an ID.
- Dates as "Thursday 6 November, 6pm", not "06/11 18:00".
- Euro as €1,850 a month.
- The AI says it is an AI assistant, in its first message.
- No disclaimers. A line of caution appears only when the law needs it at that moment, or it stops a real mistake about to happen. It is one line.
- An error never blames and never shows a code. It says what to do.

## Colour

Tokens are named by what they are for, not by their hue, so a colour can change without a name changing.

- **Grounds:** `surface-0` is the page, and it is white. `surface-1` is cards, inputs, sheets and menus: in light it is the same white, held off the page by a hairline or a shadow, never by a tint. `surface-2` is the one quiet fill: a selected row, the "what happens next" panel, a skeleton, a hover. No screen stacks tinted cards on a tinted page.
- **Text:** `ink` for text and icons, `ink-muted` for secondary lines. Both pass 4.5:1 on every surface and every tint, in both themes.
- **Action:** `primary` fills the one main button on a screen. It is ink, with `ink-inverse` words. A secondary or outlined button is never a screen's main action.
- **Brand:** `brand` is the accent, Atlantic blue: the wordmark's full stop, progress, and the edge of a selected choice. `brand-text` is the same blue as text: links, and the focus ring. `brand-bg` is the tint behind a selected choice. The accent is one value: `brand-text`, `focus` and `ai` all point at `brand`, so the founders can change it in one place and nothing else moves.
- **Status:** `success` (done), `warning` (needs attention), `danger` (something went wrong) and `info` (information, in teal so it never reads as the brand) colour text and icons. Each has a `-bg` tint for pills and notices. A status colour always comes with an icon or words, never colour alone.
- **Renters who miss a check** are shown in `warning` with a plain reason, never `danger`. Missing a check is not an error, and a person still decides. `danger` is for things that went wrong, such as a send that failed, for a field to fix, and for the destructive button.
- **AI:** `ai` and `ai-bg` mark anything Gaff's assistant wrote or suggested. They are the brand colour and its tint: the assistant's work carries Gaff's colour.
- **Navigation** has no tokens of its own. It is white and uses the ordinary ones.
- **Overlay:** `overlay` is the scrim behind sheets and dialogs.

The hue names went with A4: `navy` is now `primary` (or `brand`, where it was a brand block), `atlantic` is `brand`, `atlantic-text` is `brand-text`, `sky` is `brand-bg`, and the `nav-*` tokens are removed. Nothing uses the old names, and a test keeps them out.

### Colour tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `surface-0` | `#ffffff` | `#0e1219` | The page. White in light; homes’ photographs bring the colour. |
| `surface-1` | `#ffffff` | `#161b25` | Cards, inputs, sheets and menus. In light it is the page’s white, held off it by a hairline or a shadow, not a tint. |
| `surface-2` | `#f4f5f7` | `#202632` | The one quiet fill: a selected row, the “what happens next” panel, skeletons, hover. |
| `ink` | `#131a2a` | `#f1f3f7` | Text and icons on any surface. A blue-black. |
| `ink-muted` | `#566074` | `#aab3c2` | Secondary text: hints, timestamps, helper lines. |
| `ink-inverse` | `#ffffff` | `#0e1219` | Text and icons on the primary, brand and danger fills. |
| `border` | `#e2e5ea` | `#2b3241` | Hairlines between groups and around a card. Decorative only. |
| `border-strong` | `#848c9b` | `#76808f` | The edge of inputs, choices and secondary buttons (3:1 on every surface). |
| `primary` | `{ink}` (#131a2a) | `{ink}` (#f1f3f7) | The one main button on a screen. It is ink. |
| `primary-hover` | `#2a3347` | `#ffffff` | Hover and pressed state of the primary button. |
| `brand` | `#3a5fa8` | `#8fb0ea` | The accent, Atlantic blue: the wordmark’s full stop, progress, the selected state. One value to change (UX-DS-6). |
| `brand-text` | `{brand}` (#3a5fa8) | `{brand}` (#8fb0ea) | The accent as text: links and the focus ring. |
| `brand-bg` | `#ebf0f8` | `#1b2a47` | The tint behind a selected choice or a brand moment. |
| `success` | `#2e6b3f` | `#86c79b` | Done, verified, passed: check results, signed, paid. Text and icons. |
| `success-bg` | `#e7f3ea` | `#17301f` | Tint for success pills and notices. |
| `warning` | `#8a5a00` | `#e2b45c` | Needs attention, including a renter who did not meet a check. Text and icons. |
| `warning-bg` | `#fbf1dc` | `#33290f` | Tint for warning pills and notices. |
| `danger` | `#a3261c` | `#f08a80` | Something went wrong (a send failed), a field to fix, or a destructive action. Never for a renter who failed a check. |
| `danger-hover` | `#871d15` | `#f5a39b` | Hover and pressed state of the destructive button. |
| `danger-bg` | `#fcebe8` | `#3b1d1a` | Tint for danger pills and notices. |
| `info` | `#1f6672` | `#7cc3cb` | Neutral notices and viewings booked. Teal, so it never reads as the brand blue. |
| `info-bg` | `#e3f2f4` | `#14313a` | Tint for info pills and notices. |
| `ai` | `{brand-text}` (#3a5fa8) | `{brand-text}` (#8fb0ea) | Anything Gaff’s assistant wrote or suggested (“Drafted by AI”). The assistant’s work carries Gaff’s colour. |
| `ai-bg` | `{brand-bg}` (#ebf0f8) | `{brand-bg}` (#1b2a47) | Background for the AI label and the AI tile. |
| `focus` | `{brand-text}` (#3a5fa8) | `{brand-text}` (#8fb0ea) | Focus ring: 2px outline, 2px offset, on every interactive element. |
| `overlay` | `rgba(19, 26, 42, 0.48)` | `rgba(0, 0, 0, 0.6)` | Scrim behind sheets, dialogs and menus. |

### Contrast, both themes

Text needs 4.5:1, large text and accent fills 3:1, and edges, controls and focus rings 3:1. Every pair the interface uses is listed below, and every pair passes. The numbers come from `docs/design-tokens.json`, and `scripts/tokens/lib.test.ts` checks each one, in both themes, whenever a value changes. A pair that isn't in the list gets added there before any screen uses it.

| Foreground | Background | Rule | Light | Dark |
| --- | --- | --- | --- | --- |
| `ink` | `surface-0` | text (4.5:1) | 17.37:1 | 16.89:1 |
| `ink` | `surface-1` | text (4.5:1) | 17.37:1 | 15.53:1 |
| `ink` | `surface-2` | text (4.5:1) | 15.92:1 | 13.65:1 |
| `ink-muted` | `surface-0` | text (4.5:1) | 6.32:1 | 8.88:1 |
| `ink-muted` | `surface-1` | text (4.5:1) | 6.32:1 | 8.16:1 |
| `ink-muted` | `surface-2` | text (4.5:1) | 5.80:1 | 7.18:1 |
| `brand-text` | `surface-0` | text (4.5:1) | 6.21:1 | 8.55:1 |
| `brand-text` | `surface-1` | text (4.5:1) | 6.21:1 | 7.86:1 |
| `brand-text` | `surface-2` | text (4.5:1) | 5.69:1 | 6.91:1 |
| `success` | `surface-0` | text (4.5:1) | 6.38:1 | 9.52:1 |
| `success` | `surface-1` | text (4.5:1) | 6.38:1 | 8.75:1 |
| `success` | `surface-2` | text (4.5:1) | 5.85:1 | 7.70:1 |
| `warning` | `surface-0` | text (4.5:1) | 5.93:1 | 9.75:1 |
| `warning` | `surface-1` | text (4.5:1) | 5.93:1 | 8.97:1 |
| `warning` | `surface-2` | text (4.5:1) | 5.43:1 | 7.88:1 |
| `danger` | `surface-0` | text (4.5:1) | 7.37:1 | 7.73:1 |
| `danger` | `surface-1` | text (4.5:1) | 7.37:1 | 7.11:1 |
| `danger` | `surface-2` | text (4.5:1) | 6.75:1 | 6.25:1 |
| `info` | `surface-0` | text (4.5:1) | 6.56:1 | 9.40:1 |
| `info` | `surface-1` | text (4.5:1) | 6.56:1 | 8.64:1 |
| `info` | `surface-2` | text (4.5:1) | 6.01:1 | 7.60:1 |
| `ink` | `brand-bg` | text (4.5:1) | 15.18:1 | 12.87:1 |
| `ink-muted` | `brand-bg` | text (4.5:1) | 5.53:1 | 6.76:1 |
| `brand-text` | `brand-bg` | text (4.5:1) | 5.43:1 | 6.51:1 |
| `ai` | `ai-bg` | text (4.5:1) | 5.43:1 | 6.51:1 |
| `ink-inverse` | `primary` | text (4.5:1) | 17.37:1 | 16.89:1 |
| `ink-inverse` | `primary-hover` | text (4.5:1) | 12.63:1 | 18.76:1 |
| `ink-inverse` | `brand` | text (4.5:1) | 6.21:1 | 8.55:1 |
| `ink-inverse` | `danger` | text (4.5:1) | 7.37:1 | 7.73:1 |
| `ink-inverse` | `danger-hover` | text (4.5:1) | 9.47:1 | 9.47:1 |
| `success` | `success-bg` | text (4.5:1) | 5.59:1 | 7.21:1 |
| `warning` | `warning-bg` | text (4.5:1) | 5.28:1 | 7.45:1 |
| `danger` | `danger-bg` | text (4.5:1) | 6.38:1 | 6.29:1 |
| `info` | `info-bg` | text (4.5:1) | 5.71:1 | 6.88:1 |
| `ink` | `success-bg` | text (4.5:1) | 15.23:1 | 12.78:1 |
| `ink-muted` | `success-bg` | text (4.5:1) | 5.54:1 | 6.72:1 |
| `brand-text` | `success-bg` | text (4.5:1) | 5.44:1 | 6.47:1 |
| `ink` | `warning-bg` | text (4.5:1) | 15.48:1 | 12.90:1 |
| `ink-muted` | `warning-bg` | text (4.5:1) | 5.64:1 | 6.78:1 |
| `brand-text` | `warning-bg` | text (4.5:1) | 5.53:1 | 6.53:1 |
| `ink` | `danger-bg` | text (4.5:1) | 15.05:1 | 13.73:1 |
| `ink-muted` | `danger-bg` | text (4.5:1) | 5.48:1 | 7.22:1 |
| `brand-text` | `danger-bg` | text (4.5:1) | 5.38:1 | 6.95:1 |
| `ink` | `info-bg` | text (4.5:1) | 15.12:1 | 12.35:1 |
| `ink-muted` | `info-bg` | text (4.5:1) | 5.50:1 | 6.49:1 |
| `brand-text` | `info-bg` | text (4.5:1) | 5.40:1 | 6.25:1 |
| `border-strong` | `surface-0` | ui (3:1) | 3.38:1 | 4.69:1 |
| `border-strong` | `surface-1` | ui (3:1) | 3.38:1 | 4.32:1 |
| `border-strong` | `surface-2` | ui (3:1) | 3.10:1 | 3.79:1 |
| `brand` | `surface-0` | ui (3:1) | 6.21:1 | 8.55:1 |
| `brand` | `surface-1` | ui (3:1) | 6.21:1 | 7.86:1 |
| `brand` | `surface-2` | ui (3:1) | 5.69:1 | 6.91:1 |
| `brand` | `brand-bg` | ui (3:1) | 5.43:1 | 6.51:1 |
| `primary` | `surface-0` | ui (3:1) | 17.37:1 | 16.89:1 |
| `primary` | `surface-1` | ui (3:1) | 17.37:1 | 15.53:1 |
| `primary` | `surface-2` | ui (3:1) | 15.92:1 | 13.65:1 |
| `focus` | `surface-0` | ui (3:1) | 6.21:1 | 8.55:1 |
| `focus` | `surface-1` | ui (3:1) | 6.21:1 | 7.86:1 |
| `focus` | `surface-2` | ui (3:1) | 5.69:1 | 6.91:1 |
| `focus` | `brand-bg` | ui (3:1) | 5.43:1 | 6.51:1 |
| `focus` | `success-bg` | ui (3:1) | 5.44:1 | 6.47:1 |
| `focus` | `warning-bg` | ui (3:1) | 5.53:1 | 6.53:1 |
| `focus` | `danger-bg` | ui (3:1) | 5.38:1 | 6.95:1 |
| `focus` | `info-bg` | ui (3:1) | 5.40:1 | 6.25:1 |

Two pairs are left out on purpose, so don't use them. `border-strong` on `brand-bg` is 2.96:1 in light, so a control inside a selected choice takes the `brand` edge instead. And the wordmark's full stop is a logotype, which has no contrast minimum.

## Type

One family for everything on screen: **DM Sans**. Titles get their weight from size and space, not from a second typeface.

- A screen's title is `display` on a desktop and `display-mobile` below 900px. The private pages use `display-mobile` for their titles.
- `body` (16px) is the default everywhere, in the workspace too. `body-sm` is for secondary lines in the workspace, never a whole table.
- Private pages never go below `body` for anything a person must read or act on. Status pills there are body size (`large`).
- There is no uppercase style. The eyebrow label above a page's title is retired; `label` is the size and weight of status pills and table headers, in sentence case.
- Sizes are in rem in the CSS (16px = 1rem), so they follow the reader's browser text size.
- The font is self-hosted (`public/fonts`, from the `@fontsource-variable` opsz files) with its weight and optical-size axes, so renters' phones never call a font service.

| Style | Size / line | Weight | Letter spacing | Use |
| --- | --- | --- | --- | --- |
| `display` | 32/40px | 600 | -0.01em | A screen’s title on a desktop; a question in a step-by-step flow. |
| `display-mobile` | 28/34px | 600 | -0.01em | The same at phone width, and on the private pages. |
| `title` | 22/28px | 600 | 0 | Section and card titles. |
| `heading` | 18/24px | 600 | 0 | Sub-headings, and a list row’s title. |
| `body` | 16/24px | 400 | 0 | Everything else, in the workspace too. The minimum on private pages. |
| `body-sm` | 14/20px | 400 | 0 | Secondary lines in the workspace only. Never a whole table. |
| `label` | 13/16px | 600 | 0 | Status pills and table headers, in sentence case. Never an eyebrow above a title. |
| `caption` | 12/16px | 400 | 0 | Fine print. Never for anything to act on. |

## The wordmark

"gaff." stays exactly as it was: Fraunces at its display optical size, where the two "f"s meet at their crossbars and read as a key, with the full stop in the brand colour (Q29). It is the brand's one distinctive mark.

- It is a drawing, not text: `Wordmark` and `WordmarkImage` in `src/ui/Wordmark.tsx`. The outlines were taken from the font itself, at the weight (600), optical size (144) and letter-spacing (-0.01em) the product had always set it in, by `scripts/wordmark/generate.py`. Nothing was redrawn. So Fraunces is no longer loaded as a font.
- The letters take the colour of the text around them (ink). The full stop is `brand`, in either theme.
- Its name for screen readers is "Gaff".
- Two sizes: `regular`, the size it has always been (27px high), and `small`, 20px high. The key stays clear down to 20px; it isn't used smaller.
- It is never set in live text. An app icon or a browser icon, when one is needed, is made from the key.

Still to do: a file for emails, which can't use an inline drawing. That belongs to the email layout (work package WP-6).

## Space, shape and depth

- A 4px base, `space-1` to `space-16`. The side gutter is `space-4` on a phone; cards use `space-6` padding on a desktop; list rows use `space-5` insets.
- Corners: `radius-sm` for chips and small tags; `radius-md` for buttons, inputs, choice cards and list rows; `radius-lg` for cards and photos; `radius-xl` for sheets and dialogs; `radius-pill` for status pills and avatars.
- Depth: flat by default. `shadow-raised` is a soft, low shadow for the fixed footer of a flow, the top bar when scrolled, and a card over a photo. `shadow-overlay` is for sheets, dialogs, menus, pickers and toasts.
- Content widths: 640px for a task (`size-task`); 1120px for lists, the calendar and a letting (`size-page`).

| Token | Value | Use |
| --- | --- | --- |
| `space-1` | 4px | Icon to label; tight inline gaps. |
| `space-2` | 8px | Between related items: a label and its field. |
| `space-3` | 12px | Inside compact controls and rows. |
| `space-4` | 16px | Card padding on a phone; the side gutter. |
| `space-5` | 20px | Row insets in lists. |
| `space-6` | 24px | Card padding on a desktop; between fields in a form. |
| `space-8` | 32px | Between sections inside a page. |
| `space-10` | 40px | Between a page’s header and its content on a desktop. |
| `space-12` | 48px | Between major page regions. |
| `space-16` | 64px | The largest gap: above a page’s end, around an empty state. |
| `radius-sm` | 8px | Chips and small tags. |
| `radius-md` | 12px | Buttons, inputs, choice cards and list rows. |
| `radius-lg` | 16px | Cards and photos. |
| `radius-xl` | 24px | Sheets and dialogs. |
| `radius-pill` | 999px | Status pills and avatars. |
| `shadow-raised` | light `0 1px 2px rgba(19, 26, 42, 0.06), 0 4px 16px rgba(19, 26, 42, 0.08)`, dark `0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.4)` | A soft, low shadow: the fixed footer of a flow, the top bar when scrolled, a card over a photo. |
| `shadow-overlay` | light `0 8px 24px rgba(19, 26, 42, 0.14)`, dark `0 8px 24px rgba(0, 0, 0, 0.5)` | Things that float over the page: sheets, dialogs, menus, pickers and toasts. |

## Sizes: one set

There is one control height, 48px, everywhere: phone and desktop, workspace and private pages. No field, select or button is a different height from its neighbours. Nothing that can be pressed has a target smaller than 44 by 44px; links inside a sentence are the only exception. An input is the full width of its column, or one of two shorter widths.

| Token | Value | Use |
| --- | --- | --- |
| `size-control` | 48px | The one height of every button, input, select and choice row, everywhere. |
| `size-target` | 44px | The smallest target of anything interactive. |
| `size-chip` | 36px | The visible height of a chip, tab or small quiet button (its target is still 44px). |
| `size-choice-card` | 72px | The least height of a choice card with an icon and a line of help. |
| `size-row` | 64px | The least height of a list row. The whole row is the target. |
| `size-bar` | 64px | The top bar, and the bottom tab bar (plus the phone’s safe area). |
| `size-footer` | 80px | The fixed footer of a flow, holding a 48px button. |
| `size-icon` | 20px | Icons in rows and buttons. |
| `size-icon-lg` | 24px | Icons in navigation and choice cards. |
| `size-field-short` | 144px | A short input: about 8 characters (a number, an Eircode). |
| `size-field-medium` | 288px | A medium input: about 16 characters (a licence number, a date). |
| `size-task` | 640px | The column of a single task or flow. |
| `size-page` | 1120px | The width of lists, the calendar and a letting. |

The one breakpoint is 900px (`sizing.breakpoint` in the tokens file, `breakpointPx` in code). A media query can't read a CSS variable, so stylesheets write `(width <= 900px)` and `(width > 900px)`, and a test fails if any stylesheet uses another width.

## Motion

Motion shows where something came from or that something finished. Nothing bounces, loops or decorates. With reduced motion on, every duration is 0ms, so nothing moves.

| Use | Motion | Duration |
| --- | --- | --- |
| Moving between the steps of a flow | The new step slides in from the right and fades up; Back reverses it | `motion-base` |
| A sheet or dialog | Slides up (a phone) or fades in (a desktop) over a scrim | `motion-slow` |
| A menu or picker on a desktop | Fades in | `motion-fast` |
| Progress | The bar fills | `motion-base` |
| A toast | Rises a little as it fades in | `motion-base` |
| A task completing | A tick draws once (today, the toast's) | `motion-slow` |
| Hover, press, focus | Colour only | `motion-fast` |

Every duration in a stylesheet is a motion token, and nothing loops; a test checks both.

| Token | Value | Use |
| --- | --- | --- |
| `motion-fast` | `120ms` | Hover, press and focus: colour only. |
| `motion-base` | `200ms` | Moving between the steps of a flow; a progress bar filling. |
| `motion-slow` | `320ms` | A sheet or dialog arriving; a tick drawing once. |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Most movement. |
| `ease-enter` | `cubic-bezier(0, 0, 0, 1)` | Things arriving on screen. |
| `ease-exit` | `cubic-bezier(0.3, 0, 1, 1)` | Things leaving the screen. |

## Components

Everything is in `src/ui`. A screen is built only from these; a screen that needs something else adds it here, and to [section 8's table](ux-redesign/08-design-system-direction.md#core-components), first. No component is desktop-only or phone-only, and nothing depends on hover, a right-click, a long press or a swipe unless a visible control does the same thing.

### Built in the redesign's first wave

| Component | In `src/ui` | Below 900px | Above 900px |
| --- | --- | --- | --- |
| **Button** | `Button`, `ButtonLink`, `SubmitButton` | 48px. `fullWidth="phone"` spans the width at the foot of a task | Sized to its label |
| **Field** | `TextField`, `SelectField`, `TextArea`, `FieldFrame` | Label, control, error, help | Same; fields in a row (`Columns`) share its tracks |
| **Choice row** | `ChoiceGroup` | Stacked; `inline` puts short answers side by side | Same |
| **Choice card** | `ChoiceCards` | Stacked, full width | Up to three across |
| **Chips** | `Chips`, `ChipLinks` | One row that scrolls sideways, with a fade | A row that wraps |
| **Segmented progress** | `SegmentedProgress` | The bar, with the current part's name beside it | Every part named under its segment |
| **Sheet / dialog** | `Sheet` | Slides up from the bottom | A dialog in the middle |
| **Menu** | `Menu`, `MenuItem` | A sheet | A popover beside its button |
| **Date and time pickers** | `DateField`, `TimeField` | A sheet | A popover under the field |
| **Code input** | `CodeInput` | Six boxes, 44px wide | Six boxes, 48px wide |
| **Toast** | `ToastProvider`, `useToast` | Above the tab bar, across the width | Bottom left |
| **Flow shell** | `FlowShell`, `FlowExit`, `FlowTitle`, `FlowStep`, `FlowProblems` | Full screen; the primary button spans the footer | The same header and footer round a 640px column |
| **Top bar / tab bar** | `NavBar` | The wordmark and the avatar at the top of the page; the destinations as tabs fixed to the foot of the screen | One top bar that stays put: wordmark, destinations, avatar |
| **Account menu** | `AccountMenu` | A sheet | A popover under the avatar |
| **Skeleton** | `Skeleton`, `SkeletonGroup` | The result's layout | Same |
| **Avatar and badge** | `Avatar`, `Badge` | | Same |
| **Wordmark** | `Wordmark`, `WordmarkImage` | | Same |

- **Button.** Four kinds. `primary` is ink (`primary`, `ink-inverse` words, `primary-hover` on hover and press), and a screen has one. `secondary` has a `border-strong` edge on `surface-1`. `quiet` has no fill or edge until it's hovered. `destructive` is `danger` with `ink-inverse` words, only for an action that deletes or cancels something. All are 48px high with `radius-md` corners.
- **Links** are `brand-text`, turning `ink` on hover. They are underlined in running text, so they never rely on colour alone.
- **Field.** The label sits directly above its control; the error and then the help sit below it. The control is `surface-1` with a 1px `border-strong` edge and `radius-md` corners, 48px high. `width` is `short` (about 8 characters: a number, an Eircode), `medium` (about 16: a licence number, a date) or, left out, the full column. No other widths. Selects draw one chevron in every browser. A money field takes a `prefix`.
- **Errors.** One pattern: at the field, with an icon, in a sentence that says what to do ("Enter the rent a month, like 1,850."). The field gets a 2px `danger` edge that grows inwards, so nothing moves. The same goes for a group of choices, a picker and the code input. There is no error box at the top of a form on new screens; existing forms that still have one lose it as their screens are rebuilt.
- **Choice row** (`ChoiceGroup`): radios or checkboxes as whole-row targets, 48px or taller, with the help under the question so it's read before choosing. The chosen row takes a 2px `brand` edge that grows inwards, and the `brand-bg` tint.
- **Choice card** (`ChoiceCards`): one of a few options, each with a 24px icon, a label and a line of help. 72px or taller; the whole card is the target. The chosen card takes the `brand` edge and tint, and a tick. They are real radios, so the arrow keys move between them.
- **Chips.** `Chips` are quick answers in a form: real radios or checkboxes. `ChipLinks` are filters that each show a different view of one list. A chip is 36px high to look at and 44px to press. The chosen one takes the `brand-bg` tint, the `brand` edge and a tick.
- **Segmented progress.** The steps of a flow, or the four parts of a letting. Done and current segments are `brand`; the rest are `border`. There is no "Step 3 of 7" in words unless there are more than six steps. Screen readers get a list: each part, whether it's done, and which one you're on. It has taken over from `StepIndicator`, from `StageMeter` in the list of lettings and from `StageTracker` on a letting's own page. All three are gone.
- **Sheet / dialog** (`Sheet`): a short task over the page, with a title, a Close button, its content, and buttons that stay in view. `radius-xl` corners. It is never an "Are you sure?".
- **Menu:** rare actions behind a "more" button (a 48px target). Each action is a 48px row. A destructive action is `danger`, with its icon. The button can show something else (`trigger`), such as an avatar; then `triggerLabel` names it for screen readers, and the name holds whatever words the button shows. A `header` sits above the actions and isn't one of them.
- **What opens** (sheets, dialogs, menus, pickers) all stand on `Overlay`, the browser's own modal dialog. Focus moves in and stays in, Escape closes it, a press on the scrim closes it, and focus goes back to what opened it. Above 900px a popover sits beside its control and is kept inside the window; that position is the one style set from code, because no token can say where a control is on screen.
- **Date and time pickers.** A field like any other, whose control says what's chosen in words: "Thursday 5 November", "6:30pm". They replace the browser's own date and time controls, which look and read differently on every phone. The calendar starts on Monday, marks today with a ring, and won't offer a date outside its range. The form receives `2026-11-05` or `18:30`. Existing forms still use the browser's controls until their screens are rebuilt.
- **Code input:** the six-digit sign-in code. One real input drawn as six boxes, so a paste, the phone's own suggestion and a screen reader meet a single labelled field. It has the numeric keyboard. A pasted "123 456", or a whole sentence with the code in it, works. When the last digit goes in it calls `onComplete`, so the form sends itself.
- **Toast:** "Saved", "Copied", "Sent". Where an action can be undone, it is done at once and the toast offers Undo for ten seconds; where it can't, the flow's last step is a "Check and send" screen. One toast at a time. It is `surface-1` with `shadow-overlay`, announced to screen readers without moving focus, and it waits while it's hovered or has focus. Put `ToastProvider` round a shell once.
- **Flow shell:** the frame of any step-by-step task, with nothing else on screen. At the top: close, or back to the step before; the progress; and "Save and exit". In the middle: one step. At the foot: a fixed bar, 80px high with `shadow-raised`, holding Back and the one primary button. The page keeps whatever has focus clear of the bar. A flow's page goes under the `(task)` routes, which have no navigation, and closing it goes back to where it was opened (`returnPath`, `withReturn`). `FlowTitle` is the step's title and the line or two under it. `FlowStep` is one step of a flow whose steps share a page and a form. Errors go at the field and nowhere else: on pressing the button with errors, `focusFirstProblem` moves focus to the first, and `FlowProblems` tells a screen reader how many there are ("2 things need another look"). `saveAndExit` is for a flow that keeps a draft; it's left out where nothing is kept yet. A decision's last screen is an `Outcome` in the same frame.
- **Top bar / tab bar** (`NavBar`): the navigation, one component for everyone. Letting has Today, Lettings, Calendar and Inbox; renting has Search, Saved and Enquiries; a signed-out visitor has the header alone, with "List a home" and "Sign in". It is white, in the ordinary tokens. Above 900px it is a top bar 64px high that stays at the top, with a hairline under it and `shadow-raised` once the page has scrolled: the wordmark on the left, the destinations as words in the middle, the avatar on the right. Below 900px the wordmark and the avatar sit at the top of the page, and the destinations are a tab bar 64px high fixed to the foot of the screen, above the phone's safe area: each a 24px icon over a one-word label at body size that never wraps. The page you're on is `ink` with a short `brand` line, and marked for screen readers; the rest are `ink-muted`. A count is a figure on `primary`, read out in words ("Today 3 things need you"), and stops at "99+". Focused tasks don't show it: they open in the flow shell.
- **Account menu** (`AccountMenu`): a `Menu` on the avatar at the right-hand end of the navigation. The person's name and the context they're in, then links, then Sign out. What it holds, and in what order, is one rule (`accountMenuFor`).
- **Skeleton:** loading is the result's own layout in `surface-2`, with a line saying what's happening. The shapes are still.
- **Avatar:** a person's or an agency's initials in a circle. Never a photo: a renter's profile has none (product rule 3). `strong` is ink, for the agency whose page it is. **Badge:** a small mark beside a name, such as "Identity verified": an icon and words.

### Built with Today and Lettings

| Component | In `src/ui` | Below 900px | Above 900px |
| --- | --- | --- | --- |
| **Home card** | `HomeCard`, `HomeGrid` | One column | A grid, three across |

- **Home card:** a home in a list, led by its cover photo at 3:2 with `radius-lg` corners. A home with no photo shows the `surface-2` fill and a house icon, never a broken image. Under the photo: the address at `heading` size, then one status line in words in `ink-muted` ("Viewings · 8 of 14 booked"). The whole card is one link, named by the address. There is no box round it: the photo is the object, and space holds the cards apart. `needsYou` adds a small dot and its words in `warning`, so it is never told by colour alone.
- **Action list, on the page** (`bare`): the same rows under a heading with no card round them, for a list that isn't one object, such as "Needs you" on Today. The rows line up with the heading, with a hairline above the first and below the last; hover underlines the title.

### Carried over, restyled by the tokens

- **Status pill:** the status `-bg` tint, the status colour for the icon and words, and always both. 13px semibold in the workspace; body size (`large`) on private pages. `accent` is `brand-bg` with ink words.
- **Notice:** the status `-bg` tint, the status icon in the status colour, and `ink` words. Used far less than before: a line of caution only when the law needs it or it stops a real mistake.
- **AI drafts:** the "Drafted by AI" pill (`ai` on `ai-bg`, with the sparkle icon). A person approves before anything goes out.
- **Card:** `surface-1` with a hairline and `radius-lg` corners, for one object. A quiet card (`surface-2`, no edge) is for an aside such as what happens next.
- **Action list:** hairline rows, each a whole-row link 64px or taller, with an icon tile, its words and a chevron. A row named by a title people look for (an address) makes the title the link, stretched over the row.
- **Summary list:** label and value rows divided by hairlines. `split` puts short figures on the right in semibold. On a phone the label sits above its value.
- **Step card:** one step of a process done in order: a number that becomes a tick, the title, the status in words, and what to do.
- **Outcome:** the main message of a page with nothing to fill in: a status icon in its tint, a title, the words and what happens next. Never `danger` for a renter.
- **Empty state:** an icon in a tinted circle, one sentence saying what will appear here and when, and at most one button. There is no illustration set.
- **What happens next:** on private pages, a quiet `surface-2` panel ends each task with the next step and when. Once per screen, after the task.
- **Disclosure:** detail most people need once, or a rare action, behind a summary line with a chevron. Native `<details>`.
- **Table:** body size on a desktop, with a quiet header row in sentence case; below 900px each row becomes a small card with each value's column name beside it.
- **Thread and reply box** (`Thread`): a conversation, like any messaging app, and the list it is chosen from. The list is hairline rows, each one link: who, when, the home, the last line, and a pill in words when something is waiting ("Needs you"). In a thread, their messages sit on the left on `surface-2`; ours on the right, held off the page by a hairline, each saying who sent it: "Gaff" for the assistant, "You", or a colleague's first name. The reply box is one bordered box at the foot. A draft is in it already written, under the "Drafted by AI" pill, with "Send" as the primary button and "Edit" and "Don't send" beside it. A part Gaff couldn't write is marked where it falls, on `surface-2`, holding the field a person answers in. Below 900px the list is a screen and the open conversation is a screen, with "Inbox" as the way back; above, the list is on the left and the conversation on the right. A conversation opens at its latest.
- **Copy button:** beside anything people would otherwise retype: an IBAN, a reference, an address. It says "Copied", and screen readers hear it.
- **Focus:** a 2px outline in `focus` at a 2px offset on every interactive element, in the navigation as everywhere else.

### Still to come, with the screens that need them

The page frame for private pages and the email layout (WP-6), address search (WP-9), the photo uploader and gallery (WP-9, WP-20), the home card (WP-7, WP-20), the person card (WP-15), the calendar (WP-16), the setup checklist (WP-27), the search box and the map (WP-21), the action card (WP-20) and the sign-in buttons (WP-4).

## Iconography

Lucide line icons, never filled icons or emoji. 20px at a 1.75 stroke in rows and buttons; 24px in navigation and choice cards; 14px at a 2 stroke in workspace pills. An icon sits beside words and is hidden from screen readers, except on an icon-only button, which is named for what it does.

## Photography

A home's cover photo leads wherever the home is named as a destination, at a fixed 3:2 ratio with `radius-lg` corners. A home without photos shows a neutral placeholder with a house icon, never a broken image. The photo components come with the packages that use them.

## Accessibility

- WCAG 2.2 AA on every page, in light and dark. Every end-to-end test runs axe, once the page has come to rest.
- The contrast of every pair in the table above is checked in both themes.
- A visible 2px focus ring in `brand-text` on every interactive element.
- Status is never shown by colour alone. Nor is a choice: the chosen card, chip or time carries a tick or a stronger edge.
- Targets of at least 44 by 44px, and one control height of 48px. Every end-to-end test's accessibility check (`expectAccessible` in `tests/e2e/support.ts`) measures both on its page, the way a finger meets them, since axe can't.
- 16px minimum on private pages. Text is sized in rem.
- Anything that opens traps and returns focus, closes on Escape, and works with a keyboard and a screen reader. Dragging, when a component has it, always has a button that does the same.
- Reduced motion turns every duration to 0ms.

## Themes

Light is the default, and it is the one designed and reviewed for the MVP. Dark follows the system setting, and `data-theme="light"` or `data-theme="dark"` on `<html>` overrides it either way. Both come from the one token file, and the contrast tests cover both.

Dark is a deep blue-black, not an inversion. The page (`surface-0`) is the darkest; cards and sheets (`surface-1`) sit a step lighter, because a hairline alone doesn't lift a card off a dark page. The main button turns light, with dark words. The accent lightens to a blue that holds 4.5:1 as text. Dark gets its founder review after the pilots start.

## Ready for a native app

No native app is built now, and one is wanted later (Q34). So: tokens stay in one platform-neutral file; components are specified by behaviour and size; navigation on a phone is a bottom tab bar; sheets, pickers and menus follow the patterns people already know; layouts allow for safe areas and work at 360px; and no interaction depends on a browser-only control.

## Open

- The accent. `brand` is `#3a5fa8` as a starting value. The founders look at it on real screens when the first wave of screens is built, and either keep it or change that one value (OQ-6).
- The wordmark as a file for emails, and an app icon and browser icon made from the key.

The November 2026 UX review ([ux-review.md](ux-review.md)) explains why the forms, lists and private pages work the way they do. The redesign's own reasoning is in [docs/ux-redesign](ux-redesign/README.md).
