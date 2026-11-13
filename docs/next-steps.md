# Next steps and open questions

Banked on 8 November 2026, after marketplace milestones 1 to 7, developments, M13 and M92. Come back to this as we build: work through the open questions with the founders, and the next steps in order. Progress stays in [status.md](status.md); decided questions move to [open-questions.md](open-questions.md).

## Next steps, in order

1. **The founders' end-to-end test** on the test copy ([testing-guide.md](testing-guide.md)), as a letter and as a renter, and what it shows us.
2. **Replacing the stand-ins** ([providers PRD](providers/prd.md), draft of 8 November 2026, revised the same day): the real AI (the Claude API on the test copy, Bedrock in Dublin in production), drafted descriptions (M45) and the unfair-wording check (ADR-0023); one verification standard for every profile, with no opt-outs: email, mobile and a photo ID with a live selfie through Stripe Identity, letters before their first letting goes live and renters when they're chosen, with a confirmed mobile to book a viewing (Q60); chosen renters' work and income documents, read by Claude, with no income estimate (Q49). Built in the [specification's](providers/tech-spec.md) six milestones, once the founders approve it.
3. **Safety before real renters:**
   - hold a letter's message that asks for money, or moves the conversation off Gaff, before a viewing, and warn the renter (M28, after the providers work, Q41);
   - passkeys for Gaff staff (M5).
4. **The renter search redesign** (M56 to M61, M113 to M124; [PRD](marketplace/search-redesign/prd.md), [tech spec](marketplace/search-redesign/tech-spec.md)): built, with the place index from OpenStreetMap, and merged for the test copy in [seanvconroy/Gaff#1](https://github.com/seanvconroy/Gaff/pull/1) (see [status.md](status.md)). To finish it: the founders' walkthrough on a phone and a laptop. The real map, from the stand-in to Google Maps with the letter's map pin (M38), is now its own piece of work: [the live map PRD](marketplace/map/prd.md) and [tech spec](marketplace/map/tech-spec.md) (draft of 8 November 2026), with a week of spikes, the fixes and polish, and 13 release gates. Next on the same map: the listing page's map with nearby transport and schools (M71).
5. **Letters' time savers:** sections saving as you type (M37), unit types as their own records and one listing for several identical homes (M36). AI-drafted descriptions (M45) moved to the providers work.
6. **Public pages:** agency pages (`/agencies/[slug]`, M17, M18), "You enquired" on result cards (M60), caching with tags, and installing Gaff as a web app (M110, M112).
7. **Launch readiness (milestone 8):** speed on a mid-range phone, load tests on synthetic data at ten times the plan, a security review, the DPIA, the solicitor's wording, and the letter beta.
8. **After launch, the Should items**, in the PRD's order: M53, M36, M63, M89, M54, M84, M64, M6, M20, M21, M95, M104, M108.

## Open questions to resolve as we build

| # | Question | Why it matters | Who |
| --- | --- | --- | --- |
| N1 | ~~Where do the map tiles live?~~ Answered on 8 November 2026: Google Maps hosts them (Q58). New: the monthly Google Maps budget (search redesign PRD S1), and whether the map needs a tap before it loads (S2). The [live map PRD](marketplace/map/prd.md) adds S5 to S10, including who owns the Google Cloud projects (S9) | Needed before the real map goes live | Founders, solicitor |
| N2 | Gaff's own email domain for sending (and a subdomain for alerts), and a subdomain for receiving replies and Daft or MyHome enquiries | The test copy borrows a verified domain for now; production needs Gaff's own, with SPF and DKIM | Founders |
| N3 | Sinch for texts: when do we set it up? | On the test copy, mobile codes show on screen and texted viewing reminders go to the outbox; nothing is texted | Founders |
| N4 | An Anthropic API key for the test copy now; an AWS account with Bedrock in Dublin before launch (Q37) | The test copy's AI is a stand-in until the key is set | Founders |
| N5 | Stripe Identity: test mode and the webhook for the test copy, then live keys and the DPA. No written confirmation needed (Q44) | Everyone's ID check is a stand-in page in the test copy; the identity milestone needs test keys | Founders |
| N13 | Tink, later: a quote and the confirmed Irish bank list, only when "Confirm with your bank" is wanted (Q56) | Not needed at launch: documents replace open banking (Q49) | Founders |
| N14 | HAP and affordability: the council pays most of a HAP renter's rent to the landlord directly, so it never shows on their payslips, and an income rule like 2.5 times the rent fails them unfairly. Gaff can't ask who gets HAP. How should affordability work? Options in [Q42](open-questions.md#q42-hap-and-affordability-solicitor-founders) | It's unlawful to refuse someone because they get HAP, and the rule may do that indirectly | Solicitor, founders |
| N15 | The solicitor's view on statements of other income being read by Gaff and never shown to letters (Q52), and on checking the backup at the same time (Q43) | Both shape what letters see at the checks stage | Solicitor |
| N16 | ~~How a person at Gaff checks a letter whose ID can't be checked online~~ Answered on 8 November 2026: no other way for now; a person at Gaff can give more tries (Q55, Q60) | | |
| N17 | When renters verify: when chosen (built), before their first viewing, or before their first enquiry; and the solicitor's view on a required selfie with no other way through ([Q61](open-questions.md#q61-when-should-renters-verify-founders-solicitor)) | Friction and cost for renters, how Daft and MyHome renters react to an ID request, and GDPR consent, the DPC's guidance and the Equal Status Acts | Founders, solicitor |
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
