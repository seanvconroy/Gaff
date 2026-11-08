# Next steps and open questions

Banked on 8 November 2026, after marketplace milestones 1 to 7, developments, M13 and M92. Come back to this as we build: work through the open questions with the founders, and the next steps in order. Progress stays in [status.md](status.md); decided questions move to [open-questions.md](open-questions.md).

## Next steps, in order

1. **The founders' end-to-end test** on the test copy ([testing-guide.md](testing-guide.md)), as a letter and as a renter, and what it shows us.
2. **Safety before real renters:**
   - hold a letter's message that asks for money, or moves the conversation off Gaff, before a viewing, and warn the renter (M28);
   - the AI check for subtler protected-ground wording in listings (ADR-0023), with a golden set of phrases;
   - passkeys for Gaff staff (M5).
3. **The renter search redesign** (M56 to M61, M113 to M124; [PRD](marketplace/search-redesign/prd.md), [tech spec](marketplace/search-redesign/tech-spec.md)): built on its branch (see [status.md](status.md)). To finish it: build the real place index from OpenStreetMap (`pnpm places:build`, or the **Build the place index** workflow) and commit it; set up Google Maps for the test copy ([deploy.md](deploy.md), step 6); the founders' walkthrough on a phone and a laptop; then merge. Next on the same map: M38, the letter's map pin, and the listing page's map with nearby transport and schools (M71).
4. **Letters' time savers:** AI-drafted descriptions from the facts only (M45), sections saving as you type (M37), unit types as their own records and one listing for several identical homes (M36).
5. **Public pages:** agency pages (`/agencies/[slug]`, M17, M18), "You enquired" on result cards (M60), caching with tags, and installing Gaff as a web app (M110, M112).
6. **Launch readiness (milestone 8):** speed on a mid-range phone, load tests on synthetic data at ten times the plan, a security review, the DPIA, the solicitor's wording, and the letter beta.
7. **After launch, the Should items**, in the PRD's order: M53, M36, M63, M89, M54, M84, M64, M6, M20, M21, M95, M104, M108.

## Open questions to resolve as we build

| # | Question | Why it matters | Who |
| --- | --- | --- | --- |
| N1 | ~~Where do the map tiles live?~~ Answered on 8 November 2026: Google Maps hosts them (Q38). New: the monthly Google Maps budget (search redesign PRD S1), and whether the map needs a tap before it loads (S2) | Needed before the search redesign's release | Founders, solicitor |
| N2 | Gaff's own email domain for sending (and a subdomain for alerts), and a subdomain for receiving replies and Daft or MyHome enquiries | The test copy borrows a verified domain for now; production needs Gaff's own, with SPF and DKIM | Founders |
| N3 | Sinch for texts: when do we set it up? | On the test copy, mobile codes show on screen and texted viewing reminders go to the outbox; nothing is texted | Founders |
| N4 | Claude on Bedrock (EU): AWS account and keys | The test copy's AI is a stand-in; real answers, drafts and checks need Bedrock | Founders |
| N5 | Stripe Identity: test mode for the test copy, then live keys and the DPA | Landlords' ID checks are a stand-in page in the test copy | Founders |
| N6 | The solicitor's review: first reply version 2, statements of reasons, the listing policy, terms, the privacy notice and the DPIA (Q36) | Needed before the first real renter (M101, M102) | Founders, solicitor |
| N7 | Who reviews reports and appeals at Gaff, at least two people, and the review targets (4 working hours for scams, 1 working day otherwise) | An appeal always goes to someone else (M98) | Founders |
| N8 | Report retention: 6 months after the case closes (proposed in Q36) | Set in code now; the solicitor confirms | Solicitor |
| N9 | PSRA register: automatic matching needs psr.ie's weekly file | Licences are checked by hand in the staff queue until then | CTO |
| N10 | Should the renter's first name or full name show to letters before a viewing? | Today letters see the full name from the enquiry, as with Daft | Founders |
| N11 | Do renters reply to Gaff emails by email, or only in Gaff? | Replying by email needs the receiving subdomain (N2); in Gaff it already works | Founders |
| N12 | Viewing times before a listing goes live: keep, or allow "viewings to be arranged"? | Enquiries start the workflow, which needs viewing times today | Founders |

## Changes from the tech spec, to revisit

- Public pages render on each request; caching with tags comes with launch readiness.
- A let or withdrawn home's page answers 404, not 410, after 90 days (Next.js pages can't send 410).
- Development pages are at `/development/[slug]`, because `/developments` is the letter's workspace.
- Bulk add copies a home already set up, rather than separate unit-type records.
- The test copy keeps photos in the database (`STORAGE_PROVIDER=database`); production uses Supabase Storage.
- The test copy sends from a borrowed domain and can't receive email (N2), shows mobile codes on screen (N3), and is open to anyone with its address (never indexed). Its production branch is `claude/epic-ride-0ha68s` only once Branch Tracking is changed in Vercel; until then, it's redeployed by hand.
