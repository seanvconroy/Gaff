# 8. Design system direction

Part of the [UX redesign PRD](README.md). This file sets the direction for the next version of the design system: the brand refinement, the core components and their sizes, motion, and the standard patterns. It says what changes from `docs/design-system.md`.

Requirement IDs: `UX-DS`. This is direction for the design work, not the finished system. Values marked "starting value" have been checked for contrast but need to be seen on real screens before they go into `docs/design-tokens.json`.

## What's wrong with the look today

| What the founder sees | What causes it |
| --- | --- |
| Dated | A soft serif (Fraunces) for every title, on a cream page, reads as heritage. Navy panels and uppercase eyebrow labels add to it |
| Harsh neutrals | Cream on cream: the page, the cards and the fills are three close tints of the same warm beige, held apart by brown hairlines. There's no white for anything to sit on |
| The palette | Three close creams and a dusty navy give everything the same weight. The blue is liked; it needs a cleaner ground and a cleaner cut |
| Inconsistent | Controls at two heights (44 and 48), one-off field widths, buttons in three styles used for the same job, outlined buttons standing in for the primary |
| Not premium | Borders around everything, no photography, no depth, no motion, small type in the workspace |

## What changes from `docs/design-system.md`

| Area | Today (A4, Navy and Atlantic) | Direction |
| --- | --- | --- |
| Ground | Warm cream page, cream cards | A white page. One quiet cool grey for fills |
| Primary action | Navy | Ink: a blue-black, close to today's navy but crisper |
| Brand colour | Navy blocks and a dusty Atlantic blue accent | One accent, used sparingly: Atlantic blue, re-cut cleaner and a little deeper |
| Token names | Named by hue: `navy`, `atlantic`, `sky` | Named by role: `brand`, `brand-text`, `brand-bg` |
| Type | Fraunces for titles, DM Sans for the rest | One family for everything on screen. Fraunces stays only in the wordmark |
| Depth | "Borders, not shadows" | Flat by default. One soft shadow for things that float |
| Control height | 44px in the workspace, 48px on private pages | 48px everywhere |
| Corners | 6px inputs, 10px buttons, 16px cards | 12px controls, 16px cards, 24px sheets |
| Navigation | A navy sidebar; a navy bottom bar | A white top bar; a white bottom tab bar |
| Photography | None | The home's photos lead the letting, the list and the renter's page |
| Motion | Colour changes only | Short, purposeful movement between steps and for sheets |
| Principle 4 | "Borders, not shadows" | "Space and type first, then a hairline, then a shadow" |
| Principle 5 | "One accent" | Kept. The accent is now the brand colour |

Everything else in `docs/design-system.md` stays: the voice, status colours always paired with an icon or words, renters who miss a check shown in warning and never danger, the "Drafted by AI" label, WCAG 2.2 AA, 44px targets, 16px minimum on renter pages, light and dark themes generated from one token file.

## Brand refinement

### Character

Gaff should feel like a calm, capable person who has done this a hundred times: quiet, clear, a little warm. It should look premium because of space, good type, real photographs of homes and precise alignment, not because of decoration. Its own identity comes from four things: the wordmark, whose two "f"s read as a key; a calm Atlantic blue on white; the plain Irish voice; and the "what happens next" line that ends every screen.

### Colour

**Decision (Q29): neutral and an off-blue, refined. Ink, white, and one accent: Atlantic blue.**

The founder likes the neutral-and-blue idea and doesn't like how it looks today. The problem isn't the blue. It's what surrounds it: cream on cream, with a navy that reads as heavy. So the blue stays and everything around it gets cleaner.

- **The ground is white**, with one cool grey for quiet fills. Homes provide the colour, through their photographs.
- **Ink is a blue-black.** It replaces navy for text and for the main button. It keeps the family feeling and is crisper.
- **Atlantic blue is the one accent**, re-cut a little deeper and cleaner so it holds up on white. It marks what belongs to Gaff: the wordmark's full stop, progress, the selected state, links, and the work the assistant did.
- **Status colours keep clear of it**: green for done, amber for attention, red for something wrong, teal for information.

| Role (new token) | Starting value, light | Replaces | Use |
| --- | --- | --- | --- |
| `surface-0` | `#ffffff` | Cream `#f7f3ec` | The page |
| `surface-1` | `#ffffff` | `#fffdf9` | Cards and inputs. Held off the page by a hairline or a shadow, not a tint |
| `surface-2` | `#f4f5f7` | `#ede6da` | Quiet fills: a selected row, the "what happens next" panel, skeletons |
| `ink` | `#131a2a` | `#18223a` | Text, icons, and the primary button's fill |
| `ink-muted` | `#566074` | `#4a5262` | Secondary text |
| `border` | `#e2e5ea` | `#d8cfc0` | Hairlines. Decorative |
| `border-strong` | `#848c9b` | `#847b6f` | The edge of inputs and secondary buttons |
| `primary` | `{ink}` | Navy `#1b2a4a` | The one main button on a screen |
| `brand` | `#3a5fa8` | `atlantic` `#4a6fa5`, `navy` | The accent: wordmark, progress, selection |
| `brand-text` | `#3a5fa8` | `atlantic-text` | Links and the focus ring |
| `brand-bg` | `#ebf0f8` | `sky` | The tint behind a selected choice or a brand moment |
| `ai`, `ai-bg` | `{brand-text}`, `{brand-bg}` | Teal, as `info` | Anything Gaff's assistant wrote. The assistant's work carries Gaff's colour |
| Status colours | Kept, with their tints re-cut for a white ground | | As today |
| `nav-*` | Removed | Navy navigation tokens | Navigation is white and uses the ordinary tokens |

Contrast of the starting values (text needs 4.5:1, edges and focus rings 3:1):

| Pair | Ratio |
| --- | --- |
| `ink` on white / on `surface-2` / on `brand-bg` | 17.4 / 15.9 / 15.2 |
| `ink-muted` on white / on `surface-2` / on `brand-bg` | 6.3 / 5.8 / 5.5 |
| `brand-text` on white / on `surface-2` / on `brand-bg` | 6.2 / 5.7 / 5.4 |
| White on `brand` | 6.2 |
| `border-strong` on white / on `surface-2` | 3.4 / 3.1 |

**UX-DS-1.** The page ground is white. Fills use one neutral. No screen stacks tinted cards on a tinted page. `[P12]`

**UX-DS-2.** The primary button is ink. There is one per view. A secondary or outlined button is never used as a screen's main action. `[P2, P12]`

**UX-DS-3.** The brand colour appears at most once per screen as an emphasis, plus on selected states, progress and links. `[P12; design-system principle 5]`

**UX-DS-4.** Tokens are named by role. A future colour change edits values, not names. `[P12; ADR-0011]`

**UX-DS-5.** Every text and background pair used is added to the contrast list in `docs/design-tokens.json` and tested in both themes before any screen uses it, as today. `[CLAUDE.md conventions]`

**UX-DS-6.** The accent is one token. The founders look at it on real screens when the first wave of screens is built, and either keep it or change that one value ([OQ-6](12-phasing-and-decisions.md#still-open)). Nothing else depends on the choice. `[P12 · Q29]`

### Type

**Decision: one family for everything on screen, DM Sans. Fraunces stays only in the wordmark.**

A single clean sans at confident sizes is what makes Airbnb and Revolut read as modern. DM Sans is already self-hosted with optical sizes, is warm without being quirky, and is clear at 16px for people who don't read screens all day. Keeping it limits the change to removing the serif from titles. A serif wordmark over a clean sans interface is a classic pairing, and it lets the wordmark stand out as the one piece of character on the screen.

| Style | Size / line | Weight | Use | Change |
| --- | --- | --- | --- | --- |
| `display` | 32/40px | 600 | A screen's title on desktop; a question in a step-by-step flow | Was Fraunces 40/44 |
| `display-mobile` | 28/34px | 600 | The same at phone width | Was Fraunces 30/36 |
| `title` | 22/28px | 600 | Section and card titles | Was 20/28 |
| `heading` | 18/24px | 600 | Sub-headings, a list row's title | New size; replaces Fraunces `heading` |
| `body` | 16/24px | 400 | Everything else. The minimum on private pages | Same |
| `body-sm` | 14/20px | 400 | Secondary lines in the workspace only | Same |
| `caption` | 12/16px | 400 | Fine print. Never for anything to act on | Same |

**UX-DS-7.** One type family. Titles get their weight from size and space, not from a second typeface. `[P12]`

**UX-DS-8.** The uppercase eyebrow label (`label`) is retired from page headers. "HALCYON LETTINGS" above every title goes. Status pills keep their size and weight in sentence case. `[P4]`

**UX-DS-9.** The workspace's default text is `body` (16px). `body-sm` is for secondary lines, not whole tables. `[P10]`

### The wordmark

**Decision (Q29): the wordmark stays exactly as it is.** "gaff." in Fraunces, where the two letters "f" join and read as a key. It is the brand's one distinctive mark, and nothing in this redesign redraws it.

**UX-DS-22.** The wordmark is one image asset, drawn from today's lettering, with its full stop in the brand colour. It is used at the top left of the product, on the public site, in emails and on private pages, and is never set in live text. `[P12 · Q29]`

**UX-DS-23.** The key made by the two "f"s is kept clear at every size, down to 20px high. When an app icon or a browser icon is needed, it's made from that key. `[P12]`

### Photography and illustration

**UX-DS-10.** A home's cover photo appears wherever the home is named as a destination: the Lettings list, the letting's header, the renter's and owner's pages. Photos are shown at a fixed 3:2 ratio with 16px corners. A home without photos shows a neutral placeholder with a house icon, never a broken image. `[P12]`

**UX-DS-11.** Empty states use an icon in a tinted circle. There is no illustration set in the MVP. `[P4]`

## Space, shape and depth

| Token | Value | Change |
| --- | --- | --- |
| Spacing scale | 4px base, `space-1` to `space-16` | Same |
| `radius-sm` | 8px: chips, small tags | Was 6px |
| `radius-md` | 12px: buttons, inputs, choice cards, list rows | Was 10px; inputs move up from `radius-sm` |
| `radius-lg` | 16px: cards, photos | Same |
| `radius-xl` | 24px: sheets and dialogs | New |
| `shadow-raised` | A soft, low shadow | New: the fixed footer, the top bar when scrolled, a card over a photo |
| `shadow-overlay` | As today | Sheets, menus, dialogs, toasts |
| Content widths | 640px for a task; 1120px for lists, the calendar and a letting | Task column was 720px |

**UX-DS-12.** Hierarchy comes from space and type first. A hairline separates groups. A box is used only for something that is one object: a home, a person, a viewing. `[P12]`

## Sizes: one set

| Element | Size | Notes |
| --- | --- | --- |
| Button, input, select, choice row | 48px high | Everywhere. Phone and desktop, workspace and private pages |
| Choice card (with an icon and a line of help) | 72px or taller | Whole card is the target |
| Chip, tab, small quiet button | 44px target; 36px visible height allowed | Never a smaller target |
| List row | 64px minimum | Whole row is the target |
| Bottom tab bar | 64px plus the phone's safe area | |
| Top bar | 64px | |
| Fixed footer of a flow | 80px, with a 48px button | |
| Icons | 20px in rows and buttons, 24px in navigation and choice cards | Lucide, as today |
| Inputs | Full width of their column, or one of three widths: short (8 characters), medium (16), full | No other widths. A licence number is "medium" |

**UX-DS-13.** There is one control height, 48px. No field, select or button on any screen is a different height from its neighbours. `[P12]`

**UX-DS-14.** An input's width is one of three standard widths or the full column. `[P12]`

**UX-DS-15.** Nothing interactive has a target smaller than 44 by 44px. `[P10]`

## Core components

Every component adapts between phone and desktop. "Status" says whether it exists in `src/ui` today.

| Component | For | Phone | Desktop | Status |
| --- | --- | --- | --- | --- |
| **Top bar / tab bar** | The four destinations | Bottom tabs with icon and label | Top bar | New (replaces the sidebar) |
| **Flow shell** | Any step-by-step task | Full screen; fixed footer; button full width | A 640px column, centred; same header and footer | New |
| **Segmented progress** | Steps in a flow; the four parts of a letting | Segments, with the current part's name beside it | The same, with all names | Changed (replaces `StepIndicator`, `StageTracker`, `StageMeter`, all gone). `detail` names the stage inside a letting's current part: "Find · Viewings" (WP-15) |
| **Button** | Primary, secondary, quiet, destructive | Primary spans the width at the foot of a task | Sized to its label | Changed; destructive is new |
| **Field** | Text, number, money, email | Label above, then the control, then the error, then help | Same | Changed (one height, three widths). `idScope` keeps ids apart where a page repeats a form (WP-28) |
| **Choice card / choice row** | One of a few options | Stacked, full width | Up to three across | Exists; restyled |
| **Option row** | Something that is off until tapped, then asks for one value | Full width; the value's field opens under the row | Same | New |
| **Chips** | Filters, quick answers | A row that scrolls sideways with a visible fade | A wrapping row | New |
| **Address search** | Finding an address | A full-screen search with results | A field with a list under it | New |
| **Date and time pickers** | Dates and times in Irish format | A sheet | A popover | New (replaces the browser's own controls) |
| **Code input** | The six-digit sign-in code | Six boxes; numeric keyboard; accepts a paste | Same | New |
| **Photo uploader and gallery** | Adding, ordering and showing photos | Library or camera; a two-column grid | Drag and drop; a four-column grid | New (`PhotoField` exists for single photos) |
| **Home card** | A home in a list | One column | A grid, three across | New. `src/ui/HomeCard`; in search it takes the rent as its title, `details` (when it's free, what differs) and the heart over the photo (`src/ui/HeartButton`) |
| **Person card / row** | An enquirer or applicant | A card | A table row with the same content | Changed (from `Table`, `Cell`; a `bare` cell has no column name on a phone, so People's card reads the name, where they stand, the status: WP-28). `PersonCard`: applicants to choose between, a radio each, stacked on a phone and three across on a desktop (WP-17) |
| **Pick list** | Ticking people from a ranked list ("Choose who views"), with "Why here" for each row's reason and a divider before people who haven't answered | Rows with hairlines; the whole row is the tick | Same | New (`PickList`, WP-17) |
| **Message preview** | A fixed message as it will be sent, to read and not to edit | The quiet fill, subject then words | Same | New (`MessagePreview`, WP-17) |
| **Action row** | Something that needs you | Whole-row target | Same | Exists |
| **Sheet / dialog** | A short task over the page | Slides up from the bottom | A centred dialog | New |
| **Menu** | Rare actions (⋯) | A sheet | A popover | New |
| **Account menu** | Everything outside the destinations, on the avatar: profile, settings, help, sign out | A sheet | A popover under the avatar | New |
| **Calendar** | Viewing times, across every home or for one (`src/ui/Calendar`) | A strip of the week's days, and the chosen day as a list of rows | A week grid, 8am to 9pm, each time a block with its words | New |
| **Time picker for renters** | Booking a viewing | Days, then times | Same, in a narrower column | Changed |
| **Question steps** | A few questions asked one per screen inside a page: the pre-viewing questions, applying, referees | The progress, one question, then Back and the one primary button, which spans the screen | The same, with the button sized to its label | New |
| **Step list** | Where someone stands in a few steps done in order: a renter's checks, a tenant's steps | Rows of a name and its state in words: done, next, to come | Same | New |
| **Numbered steps** | Steps to follow somewhere else, in order: setting up forwarding in a person's own mail | Rows of a number and a sentence | Same | New |
| **Directions link** | "Get directions" to a home | Opens the phone's own maps app | Opens a map in a new tab | New |
| **Thread and reply box** | A conversation, and the list it is chosen from. A draft waits in the reply box, with what Gaff couldn't answer marked in it | The list is a screen; the open conversation is a screen, with a way back | List on the left, thread on the right | New |
| **Setup checklist** | First-run progress | A card with a ring and one button | Same | Built (`src/ui/SetupChecklist`, WP-27): the ring and "1 of 3 done", finished steps as a tick and a name, the next step with its why and one button |
| **Prompt** | One suggestion at the moment it's useful (section 9): "Invite your team", "Add viewing times" | A line between hairlines: an icon, the words, then its one button and "Not now" under them | The same, with the buttons beside the words | Built (`src/ui/Prompt`, WP-27). Never a banner, never a pop-up; a screen shows one at most (`promptFor`) |
| **Summary list** | Terms, facts, payment details | Label above value | Label beside value | Exists |
| **Status pill** | A state, in words with an icon | Body size on private pages | 14px in the workspace | Exists |
| **Notice** | Something to know before acting | | | Exists; used far less |
| **Outcome** | The result of a task, or a status with nothing to do | | | Exists |
| **Empty state** | Nothing here yet | | | Exists |
| **Toast** | "Saved", "Copied", "Sent", with Undo where it applies | Above the tab bar | Bottom left | New |
| **Skeleton** | Loading | | | New |
| **Copy button** | An IBAN, a reference, an address | | | Exists |
| **Avatar and badge** | A person, an agency; "Identity verified" | | | New |
| **Search box with chips** | Renter search; asking who's enquired | Full width; chips scroll sideways | Centred, up to 720px | New. `src/ui/SearchBox` (the question, the box and its button) with `src/ui/FilterChips` ("Filters", then a chip per filter, each opening its control) |
| **Gallery** | A home's photos | Swipe, with Previous and Next; tap for full screen | A grid of five; click for full screen | Built (`src/ui/Gallery`; full screen is `Overlay`'s `full` kind) |
| **Action card** | The one action on a home's page | Fixed to the foot of the screen, above the tab bar | Fixed to the right of the content | Built (`src/ui/ActionCard`) |
| **Show more** | Long text, such as a home's description | Three lines, then "Show more" | Same | Built (`src/ui/ShowMore`) |
| **Map** | Where a home is; search results | Behind a "Map" button | Beside the list | Not built: serving a map from Gaff's own copy of OpenStreetMap isn't practical yet, so search shows the list alone (OQ-7; `docs/open-questions.md` Q49) |
| **Sign-in buttons** | Google, Apple | The providers' own required styles | Same | New |
| **Test copy banner** | On every page of the test copy (`GAFF_ENV=staging`) alone: it is the test copy, so use made-up details | A line across the top of the page, above everything else: an icon and the words, on the info tint | Same | Built (`src/ui/TestCopyBanner`, BA-1), in the root layout. Never in development, tests or production |

**UX-DS-16.** Every screen in this PRD is built only from these components. A screen that needs something else adds it here first. `[P12]`

**UX-DS-17.** No component is desktop-only or phone-only. No action depends on hover, a right-click, a long press or a swipe unless a visible control does the same thing. `[P10, P11]`

## Standard patterns

### Errors

| When | Pattern |
| --- | --- |
| A field is wrong | A message under the field, with an icon, shown when the user leaves the field or presses the button. The field gets a 2px danger edge. The message says what to do: "Enter the rent a month, like 1,850." It clears as soon as the field is edited |
| Several fields are wrong | The same, at each field. Focus moves to the first. A screen reader hears "2 things need another look". No box at the top |
| An action failed (a send, a save) | At the button or as a toast: "That didn't send. Check your connection and try again." What was entered is kept |
| A page couldn't load | In place of the content: one sentence and "Try again" |
| Something isn't allowed | Where the user tried it, in a sentence, with the reason: "The deposit can't be more than one month's rent: €1,850." |

**UX-DS-18.** One error pattern: at the field, in a sentence that says what to do. The top-of-form error box is removed everywhere. `[P6, P12]`

**UX-DS-19.** An error never blames ("You entered an invalid…") and never shows a code. `[voice]`

### Empty states

An icon, one sentence saying what will appear here and when, and at most one button. "No viewings yet. Add a time and renters book themselves." **Add a time.**

### Progress

| Where | Pattern |
| --- | --- |
| A flow with steps | A segmented bar at the top. No "Step 3 of 7" in words unless there are more than six steps |
| A letting | Four named parts |
| Something Gaff is doing | The result's layout, filling in, with a line saying what's happening |
| A wait on someone else | Words: "Waiting for Mary · sent 2 hours ago" |

### Checklists

A card on Today: a ring showing "2 of 3", the next step's name and one line of why, and one primary button. Finished steps collapse to a tick and a name. The card can't be dismissed and disappears when complete, with a one-line "You're all set" the first time. No more than five steps.

### Calendars

Specified in [section 4](04-operator-flows.md#viewings-and-the-calendar) and [section 5](05-renter-owner-referee-flows.md#booking-a-viewing). A viewing time is always shown with its words (address, "6 of 8 booked"), never as a colour alone. Times are in Irish format in Irish time.

### Confirmation

Where an action can be undone, do it and offer Undo in a toast for ten seconds. Where it can't (sending invitations, sending an offer, removing a member), the flow's last step is a "Check and send" screen that says exactly what will happen. There are no "Are you sure?" dialogs.

### What happens next

Kept from today: on private pages, a quiet panel ends each task with the next step and when. It appears once per screen, after the task.

## Motion

| Use | Motion | Duration |
| --- | --- | --- |
| Moving between steps of a flow | The new step slides in from the right and fades up; Back reverses it | `motion-base`, 200ms |
| A sheet or dialog | Slides up or fades in over a scrim | `motion-slow`, 320ms |
| Progress | The bar fills | `motion-base` |
| A task completing | A tick draws once | `motion-slow` |
| Hover, press, focus | Colour only | `motion-fast`, 120ms |

**UX-DS-20.** Motion shows where something came from or that something finished. Nothing bounces, loops or decorates. With reduced motion on, every duration is zero, as today. `[P12]`

## One design

Decided (Q34): one design for a phone, a desktop and a future app. Not three.

**UX-DS-24.** Every screen is designed at phone width (390px) first. The desktop version is the same screen with more room: wider columns, things side by side, a fixed card where the phone has a fixed bar. `[P11 · Q34]`

**UX-DS-25.** A task has the same steps, in the same order, with the same words, at every width. No flow, step or feature exists on one and not the other. `[P11 · Q34]`

**UX-DS-26.** Where a desktop offers a quicker way (dragging on the calendar, a keyboard shortcut), the ordinary way is still there, and it's the one a phone and an app use. `[P10, P11]`

**UX-DS-27.** Each adaptive component has exactly two layouts, below and above 900px. A screen never needs its own breakpoint. `[P12]`

### Words of caution

Decided (Q46): Gaff doesn't hedge on screen.

**UX-DS-28.** A line of caution, reassurance or legal comfort is shown only when the law needs it at that moment, or it stops a real mistake about to happen. It is one line. Anything longer sits behind "How this works" or in the terms and the privacy notice, which are accepted once at sign-in. `[P4 · Q46]`

**UX-DS-29.** No screen carries a standing disclaimer, a "Please note", or a sentence that only protects Gaff. Each such line in the current product is removed or moved behind a link. `[P4 · Q46]`

## Accessibility

Unchanged in standard, restated because the look is changing: WCAG 2.2 AA on every page in both themes; a visible 2px focus ring in `brand-text` on every interactive element; status never by colour alone; 44px targets; 16px minimum on private pages; text sized in rem; every end-to-end test runs axe.

**UX-DS-21.** New components that move or overlay (sheets, menus, the calendar, pickers) trap and return focus correctly, close on Escape, and work with a keyboard and a screen reader. Dragging always has a button alternative. `[P10; WCAG 2.5.7]`

## Dark theme

The token file keeps generating both themes, and the contrast tests keep covering both. The MVP is designed and reviewed in light. Dark follows from the tokens and gets its founder review after the pilots start.

## Ready for a native app

No native app is built now, and one is wanted later (Q34). The system is made ready for it:

- Tokens stay in one platform-neutral JSON file that can generate values for iOS and Android as it does for CSS.
- Components are specified here by behaviour and size, not by CSS.
- Navigation is a bottom tab bar on phones, which is what a native app would have.
- Sheets, pickers and menus follow the platform patterns people already know.
- Layouts allow for safe areas and work at 360px.
- No interaction depends on a browser-only control.

## What this means for the code

- `docs/design-tokens.json` changes values and renames brand tokens by role. `pnpm tokens` regenerates the CSS. The contrast list is rebuilt.
- `docs/design-system.md` is rewritten once the accent is chosen.
- `src/ui` gains the new components above. The sidebar layout, `StageTracker`, `StageMeter` and `StepIndicator` are replaced.
- The wordmark becomes an image asset, so Fraunces is no longer loaded as a font.
