# Decks

## `gaff-user-journeys.pdf`: every screen, end to end

Three journeys through Gaff, from the first visit to the last screen, one screen to a slide, with the desktop window beside the phone:

1. **Letting your own home.** A private landlord signs up, lists her flat and lets it.
2. **Renting a home.** A renter finds that flat on Gaff, views it, and moves in. Then the other ways a renter arrives: without an account, and by email from Daft or MyHome.
3. **Letting for a client.** A letting agent signs the agency up, adds a flat from its advert, and lets it for its owner.

Nothing in it is drawn. A script walks the real product and photographs each screen at 1280px and at 390px, so the deck is as true as the build it was made from. The people, the homes and the agency are made up.

### Making it again

```bash
pnpm build          # the deck photographs the production build
pnpm deck:capture   # walk both journeys and photograph every screen (about 12 minutes)
pnpm deck:build     # lay the slides out and print docs/decks/gaff-user-journeys.pdf
```

It needs what the end-to-end tests need: Postgres with the `gaff` role, and nothing else.

| Where | What |
| --- | --- |
| `tests/deck/own-home.spec.ts` | The private landlord and her renters: one letting, seen from both sides |
| `tests/deck/agency.spec.ts` | The agent, with the owner, the referees and a teammate, and the renters who arrive by email |
| `tests/deck/capture.ts` | The camera: `shot()` photographs the screen at both widths and adds it to the run's manifest |
| `scripts/deck/story.ts` | The deck's own words: the three chapters, a line for each stage, and the editor's cuts |
| `scripts/deck/build.ts`, `deck.css` | The layout, and the print to PDF |

A screen's title and caption are written where it is photographed. To add a screen, call `shot()` at that point of the journey; to leave one out or correct its words without another run, use `edits` in `story.ts`.

### What it leaves out

Developments, Gaff's own team's pages beyond confirming an agency, the other companies' screens behind Google, Apple and passkey sign-in, the dark theme, and the states met only when something goes wrong (errors, expired links, a failed check, a declined offer). The last slide lists them.

Three things in the pictures are stand-ins, as on any copy without real accounts: the search map (Google Maps in production), the ID check (Stripe Identity) and the AI's own words (Claude).
