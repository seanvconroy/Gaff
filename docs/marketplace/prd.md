# Gaff marketplace: product requirements

Approved for build by Sean on 7 November 2026 · requirements M1 to M124 (M56 to M61 amended and M113 to M124 added on 8 November 2026 by the [search redesign](search-redesign/prd.md))

## Summary

Gaff becomes the place where homes in Ireland are let, not just the software behind the letting. Letters list a home free in a few minutes. Renters search, save and enquire with one profile they own. Every enquiry starts the letting workflow Gaff already runs, so every renter hears back, and the whole letting, from search to signed tenancy, happens in one place.

- **Who it's for:** people renting a whole home; private landlords; letting agents and their agencies; developments and build-to-rent operators.
- **What it costs:** renters never pay. Listing a home is free. A higher place in the results is never for sale. Gaff earns from the letting workflow and, later, partner services.
- **Why it's better than Daft:** listing is free and quick, every letter is checked before their home goes live, listings stay fresh, renters see the letter's criteria and the full cost to move in before they enquire, and everyone who enquires hears back.
- **How it fits:** this document puts the marketplace in front of the workflow in the [workflow PRD](../prd.md), which stays the source of truth for stages 2 to 9. The workflow PRD listed a Gaff search site and listings as out of scope; this document brings them in.
- **How it's built:** see the [technical specification](tech-spec.md).
- **Status:** approved for build on 7 November 2026. Sean took the four decisions below the same day (Q27 to Q30 in [open-questions.md](../open-questions.md)). The open questions at the end have proposed answers, which the build uses until they're decided. Progress is in [status.md](../status.md).

## Decisions that shape this document

| Question | Decision | What it means |
| --- | --- | --- |
| When does the marketplace go live? | All at once: listings, search and renter profiles open together as soon as they're built | Gaff competes for renters from day one, so launch needs a plan and a budget to bring renters in. This reverses the order in the [business plan](../business-plan.md) (tool, then renters, then marketplace), which needs updating |
| Which rentals? | Whole homes let on a tenancy, including homes in developments and build-to-rent | No room shares, student beds, short lets, commercial or parking |
| How are letters checked? | Agencies and agents against the PSRA public register. Private landlords pass a document-and-selfie ID check before their first home goes live | Stripe Identity, approved by Sean for this on 7 November 2026 (rule 10) |
| Can a letter pay to rank higher? | Never | Results are ordered by fit and freshness only. Listings are free; revenue comes from the workflow and partner services |

## The problem

Renting a home in Ireland is a scramble. Fewer than 2,400 homes were advertised to rent nationally in August 2026, and a well-priced home in Dublin draws hundreds of enquiries. Renters report reply rates from about 1 in 150 to 2 in 10 ([business plan](../business-plan.md)).

**For renters:**

- Most enquiries get no answer, and nobody says why.
- Before enquiring, they can't tell whether a home takes pets, suits their move-in date, or what it costs to move in.
- Scam ads are common, and a real letter is hard to tell from a fake one.
- Listings go stale: homes that are already let stay up.
- Agents they've never met ask for their documents.

**For letters:**

- Advertising a home on Daft costs €295 to €399 for 90 days (seen in November 2026).
- The ad form is long, and the ID check comes at the very end.
- Then the enquiries arrive by email and phone, hundreds at a time, with no tools to handle them.
- Getting it wrong is a legal risk: the 2026 rent rules, equality law and data protection.

Daft's job ends where the hard part begins. It advertises the home and emails the enquiries on.

## What we learned from Daft

From the [teardown bank](../competitors/README.md) (placing an ad, rent search results), and from screenshots of Daft's ad page, enquiry form, development pages and sign-in shared on 7 November, which are still to be added to the bank.

| Area | What Daft does | What Gaff does instead |
| --- | --- | --- |
| Listing a home | An ad type, nine tabs, a plan, an ID check, then payment. Required fields aren't marked. The letter has to work out which BER scale applies | One page, about 5 minutes, free. Required fields are marked. Gaff picks the BER scale from the certificate date |
| Price | Standard €295, Premium €349, Featured €399, each for 90 days. Premium and Featured drop back to Standard after 30 days | Free. No paid tiers |
| Rent | A "€" box and a frequency menu. No help with the 2026 rent rules | The rent check and RTB comparables are built in (R3, R4), with a warning before a rent above the cap goes live |
| Description | One free-text box. Equality law is a line of small grey text under it | Drafted by AI from the facts if the letter wants. Wording that touches a protected ground blocks publishing, with a suggested rewrite |
| Trust | An ID check (Stripe) at the end of the ad flow. A banner says listings "may be subject to" checks | Every letter is checked before their first home goes live, and the badge says what was checked and when |
| Search results | Paid listings first and bigger. Five Cars.ie ads for eight results. Cards don't show availability, lease or furnishing | Ordered by fit and freshness, never payment. No third-party ads. Cards show what renters filter on |
| Ad page | Facts, description, features, map, local schools, a view count, the agent with their licence number, a message button, an insurance promotion | All of that, plus the letter's criteria, the full cost to move in, what happens after you enquire and when, and when the home was last confirmed available |
| Enquiry | A side panel: first and last name, email, phone, number of adults, pets. It goes to the agent's email | One tap with a profile. Only the letter's lawful questions, and "how many people", never adults and children. An instant reply, and progress tracked to the outcome |
| Accounts | Passwords, Apple or Google, a separate agent sign-in, SMS codes | No passwords: one-time codes by email, and passkeys. One account for renting and letting |
| Equality | In 2019 the WRC found Daft liable for discriminatory ads placed by others and ordered it to block them ([IHREC](https://www.ihrec.ie/news-press/human-rights-and-equality-commission-uses-legal-powers-in-successful-challenge-of-daft-ie-discriminatory-rental-adverts)) | Fixed criteria, structured facts and a blocking check from day one |

MyHome's easyrent already offers a renter profile and applications ([MyHome](https://news.myhome.ie/uncategorized/youll-never-believe-how-easy-applying-for-a-rental-is-26298)), so a profile on its own isn't new. What's new is what happens after the enquiry.

## Who it's for

"Letter" means anyone who lets a home on Gaff: a private landlord, or an agent working for an agency. The workflow PRD calls the person running a letting the operator.

| User | Their job, in their words |
| --- | --- |
| Renter (free) | "Find a home I can afford near what matters, know whether I've a chance, and get a fair, quick answer, without being scammed or handing my documents to strangers." |
| Private landlord | "Let my home quickly to someone reliable, at a lawful rent, without cost, hassle or legal risk." |
| Portfolio landlord | "The same, for several homes, with someone helping me." |
| Letting agent | "List my landlords' homes fast and get good tenants signed with little of my time." |
| Agency admin | "Run my team's listings under our brand and licence, and see what's working." |
| Development or build-to-rent operator | "Show the development once and let many homes without repeating myself." |
| Gaff trust and safety (staff) | "Keep scams and discrimination off Gaff, quickly and fairly." |

The landlord client and referees use Gaff as the workflow PRD describes.

**The renter's journey:** find homes and hear about new ones; judge whether a home fits (facts, criteria, cost, location); trust that it's real; enquire; follow it through viewing, application and offer; sign and move in.

**The letter's journey:** get checked once; list the home; set a lawful rent; handle enquiries, choose and sign (the workflow); relist next time.

## Principles

The workflow PRD's seven principles still apply. The marketplace adds five:

1. **Fair by design.** The order of results is never for sale. The same rules apply to every letter. A letter's criteria are shown before anyone enquires, and everyone who enquires hears back.
2. **Honest homes.** Every letter is checked. Every listing is fresh. Photos are of the real home. The full cost to move in is on the page, and there are no other fees.
3. **One place, start to finish.** Search, enquiry, viewing, application, offer and signing happen in Gaff, for both sides.
4. **Calm and quick.** Phone first. No ads, pop-ups or dark patterns. Every screen says what happens next.
5. **Built for Irish law.** Equality law, BER, the 2026 rent rules, data protection and the EU Digital Services Act are part of the flow, not a setting.

## Scope

**In:** whole homes let on a tenancy: houses, apartments, duplexes, studios, bungalows and townhouses, including homes in developments and build-to-rent. Private landlords, agencies and their agents, and development operators. All of Ireland.

**Out for now:** room shares and house shares; student accommodation; short-term and holiday lets; rent-a-room; commercial; parking; homes for sale; native apps (the site installs as a web app instead); feeds to or from other portals; languages other than English.

**Out for good:** paid ranking; third-party advertising and tracking; any charge to renters; Gaff holding money; credit checks.

## How the marketplace meets the workflow

A home is let through a letting, the workflow PRD's object. Each letting has one listing: its public advert.

```
Renter searches ─▶ Listing page ─▶ Enquire ─▶ Workflow stage 2: first reply, questions
                                                │
Daft and MyHome enquiries, forwarded (R5) ──────┘
                                                ▼
      Shortlist ▶ Viewings ▶ Applications ▶ Checks ▶ Offer ▶ Tenancy ▶ Close
                                                                │
                      The listing shows "Let agreed", then "Let" ◀┘
```

- Enquiries from Gaff, Daft and MyHome land in one list and are ranked the same way (R10). Where an enquiry came from never changes a renter's place.
- The listing follows the letting: it says when viewings are, when enquiries close, and when the home is let.
- Renters who enquire through Gaff follow every step in their account. Renters from Daft and MyHome keep their private links (R9) and can save them to an account.

## What a letter sees about a renter

The marketplace keeps the workflow's staged data (rule 2). A renter's account and profile never change what a letter sees, or when.

| When | What the letter sees |
| --- | --- |
| Enquiry | Name, email, mobile if given, answers to the letter's criteria questions, and the message |
| Application, after a viewing | Also: how they mainly earn and the household's monthly take-home income |
| Preferred applicant or backup | Also: their identity check (made once, and kept for their next home), their work and income documents, and references |
| Signed tenancy | Also: the PPS number for RTB registration, if the tenant gives it (sealed, deleted after registration) |
| Never | Date of birth or age, nationality, family details, whether they get HAP or any social welfare payment, statements of other income, photos of them, their searches, saved homes or other enquiries |

## Key journeys

### J1. A renter finds a home and enquires for the first time

1. They search "Rathmines", filter to 2 beds under €2,600 with pets considered, and switch to the map.
2. A listing shows the facts, the letter's criteria, "€5,200 to move in" and what happens after they enquire.
3. They tap Enquire. A short sheet asks the letter's questions (move-in date, how long they plan to stay, how many people, pets), then their name and email.
4. They type the 6-digit code from their email, which confirms it and creates their account.
5. They choose whether to keep their details for next time. The box is unticked.
6. The confirmation says who has their enquiry, that a reply is coming within minutes, and when they'll hear about viewings. It offers an alert for similar homes.
7. The first reply arrives in Gaff and by email within seconds, and says it's from an AI assistant.

### J2. A returning renter enquires in one tap

Their answers are filled in from last time. They check them, change anything that's different, and send. It takes under 30 seconds.

### J3. A renter follows a home to the outcome

"My homes" shows each home with its stage and what happens next, and when: "Shortlisting by Friday 14 November", "Viewing Saturday 15 November, 11am", "Apply by Monday 17 November", "Offer: please answer by Wednesday 19 November, 6pm". Messages, bookings, the application, the offer and the tenancy steps all happen there. If they aren't chosen, they're told, and their alerts keep running.

### J4. A private landlord lists their first home

1. They sign up with their email and a one-time code, and choose "I'm letting a home I own".
2. They confirm their mobile with an SMS code.
3. They start the ID check: a photo of an ID document and a selfie. They can carry on with the listing while it runs.
4. They create the listing: Eircode, pin, facts, photos, rent (with the rent check), criteria, viewing times if they're ready, and a description they write or have drafted from the facts.
5. They preview and publish. The home goes live as soon as the ID check passes, usually within minutes.
6. They get a link to share, and their forwarding address in case they also advertise on Daft.

### J5. An agency joins

1. An admin signs up with their work email and enters the agency's details and PSRA licence number.
2. Gaff matches the licence to the PSRA register, automatically or by a person within one working day. The admin can draft listings meanwhile.
3. The admin invites agents. Each adds their own licence number, which is checked the same way.
4. Agents list homes. Listings belong to the agency and are assigned to an agent.

### J6. A development operator lists a development

They create the development once (name, location, description, amenities, photos), add homes by type in bulk, and publish. The development page shows each type, how many are available and the lowest rent.

### J7. Someone reports a listing

Anyone can report a listing from its page, without an account, and Gaff acknowledges it at once. A suspected scam is reviewed within 4 working hours, and paused straight away if the signals are strong. If Gaff removes or restricts a listing, a person has decided it, and the letter gets a statement of reasons and can appeal.

## Requirements

**Must** is needed for launch. **Should** follows within three months of launch. **Later** is planned but not scheduled. Test names start with the ID, as in the workflow (`M46: …`).

### A. Accounts and sign-in

| ID | Requirement | Priority |
| --- | --- | --- |
| M1 | One account per person, for renting, letting or both. Sign in with a one-time code or link sent by email. No passwords | Must |
| M2 | Renters can enquire without signing up first: confirming their email with a 6-digit code in the enquiry sheet creates the account | Must |
| M3 | Letters confirm a mobile number by SMS code before their first listing goes live. Renters can add a mobile for viewing reminders; it's optional (Q12) | Must |
| M4 | Renters who came through Daft or MyHome can save their applications to an account from any Gaff message or page, after confirming the same email | Must |
| M5 | Gaff staff sign in with a passkey | Must |
| M6 | Anyone can add a passkey for quicker sign-in | Should |
| M7 | Sign in with Apple or Google (each needs approval as an identity provider, rule 10) | Later |

### B. The renter's profile

| ID | Requirement | Priority |
| --- | --- | --- |
| M8 | The profile holds name, email, a mobile (optional to enquire, confirmed by text code to book a viewing, Q48), and answers to the pre-viewing questions, which come only from the fixed criteria list: move-in date, how long they plan to stay, how many people, pets. Answers are reused, and can be changed for each enquiry | Must |
| M9 | "Keep my details for next time" is one unticked box, at enquiry and when a letting ends for them (Q25). With it, the profile is kept until they delete it, or for 2 years after they last use it. Without it, their details live only in each application. The account itself lasts while they have an open enquiry, saved homes or alerts | Must |
| M10 | Saved searches, saved homes and alerts belong to the renter and are never shared with letters | Must |
| M11 | Employment and income answers can be saved in the profile, but a letter gets them only when the renter applies after a viewing (stage 5). A renter's identity check, made the first time they're chosen, stays on their profile (Q48), and documents stay only if the renter chooses (Q25). Both are shared only if the renter becomes the preferred applicant or backup (stage 6). Before that, letters can't see them, or that they exist | Must |
| M12 | "Who has my details": for each letter, what they have, since when, and when it will be deleted | Must |
| M13 | Renters can download all their data and delete their account themselves. Letters' copies follow their own deletion dates; the renter is told so plainly, and how to ask a letter to delete sooner | Must |
| M14 | "Ready to move", superseded by Q48: every renter checks their identity once, the first time they're chosen, at Gaff's cost, and it's reused for every later home ([providers PRD](../providers/prd.md), P15 to P29) | Superseded |

### C. Letter profiles: landlords, agencies and agents

| ID | Requirement | Priority |
| --- | --- | --- |
| M15 | Two kinds of letter: a landlord (a person, or their company, letting homes they own) and an agency (a business with a PSRA licence, letting homes for landlords) | Must |
| M16 | An agency is the parent of its agents. Admins invite agents by email, set each one's role (admin or agent) and assign each listing to an agent. Listings, enquiries and records belong to the agency, so they stay when an agent leaves | Must |
| M17 | Agency profile: trading and legal name, logo, PSRA licence number, office address, phone, website and a short description. Its public page lists its live homes and its agents | Must |
| M18 | Agent profile: name, optional photo, role, individual PSRA licence number, and whether to show a direct phone number. Shown on the listings they handle | Must |
| M19 | Renters see a private landlord's first name, "Private landlord", their check badge and how long they've been on Gaff. The full name appears on the tenancy agreement | Must |
| M20 | Branches: an agency can group agents and listings by office, each with its own address and phone | Should |
| M21 | A landlord can add a helper, such as a co-owner, as a second member | Should |

### D. Checks and trust

| ID | Requirement | Priority |
| --- | --- | --- |
| M22 | No home goes live until its letter has been checked. Letters can draft while the checks run | Must |
| M23 | Agencies: the licence number and name are matched against the PSRA public register, which is published weekly. A match passes automatically; anything else goes to a person, within one working day. Each agent's own licence is checked the same way | Must |
| M24 | Every letter, private landlords and agents alike: a document-and-selfie ID check with Stripe Identity, once per person, on their Gaff profile (Q48), with a check without a selfie as the alternative. An agent's verified name must match their PSRA licence. Gaff keeps only the result, the verified name and the date: no document images and no date of birth (Q19, rule 3) | Must |
| M25 | Every letter confirms that they own the home or are authorised to let it, and that the tenancy will be registered with the RTB. The wording and time are recorded | Must |
| M26 | Badges explain themselves: "Identity checked by Gaff on 3 November 2026"; "PSRA licence 001234, checked on the public register on 3 November 2026" | Must |
| M27 | Licences are checked again against each weekly register. A lapsed or missing licence pauses the agency's listings and tells its admin | Must |
| M28 | Gaff never asks renters for money before an agreement is signed, and every listing and first reply says so. A letter's message that asks for money, or moves the conversation off Gaff, before a viewing is held for review, and the renter is warned | Must |
| M29 | Risk signals hold a listing for review before it goes live: photos that match another letter's listing, a rent far below similar homes nearby, a description copied from another letter, contact details in the text, or a new account listing many homes at once | Must |
| M30 | The account the deposit and first rent are paid into (R23) must be in the checked letter's name: the landlord's verified name or the agency's legal name. The renter's bank also checks the name when they pay (Verification of Payee) | Must |

### E. Homes and developments

| ID | Requirement | Priority |
| --- | --- | --- |
| M31 | A home is a lasting record: address, Eircode, type, rooms, BER, features and photos. It can be let many times. Each time it's let is a letting, with one listing | Must |
| M32 | A development groups homes under one name and operator, with its own location, description, amenities, photos and page | Must |
| M33 | A home in a development uses the development's location, amenities and photos, and adds its own: floor, aspect, size, rent, availability and photos | Must |
| M34 | The development page shows available homes by type: "2 bed apartment · 4 available · from €2,650 a month" | Must |
| M35 | Add many homes at once: copy a home and change what differs, or upload a spreadsheet of units | Must |
| M36 | One listing for several identical homes: one set of enquiries, and the operator chooses which home to offer at the offer stage | Should |

### F. Listing a home

| ID | Requirement | Priority |
| --- | --- | --- |
| M37 | A first-time letter can create and publish a listing in under 5 minutes (median), on a phone or a laptop: one page in sections, saved as they go, with a preview before publishing | Must |
| M38 | The address is found by Eircode or address search and confirmed with a pin on a map. The letter chooses whether renters see the exact address or only the street and area. The Eircode is never shown | Must |
| M39 | Required facts, each marked required: property type, bedrooms, bathrooms, rent a month, deposit (capped at one month's rent, rule 4), available from, furnishing, BER, heating, pets, parking and outdoor space. Optional facts, each marked optional: floor area, BER number, floor and lift, en-suites, broadband, accessibility features (step-free entrance, lift, ground-floor bedroom, level-access shower), appliances and bills included | Must |
| M40 | BER: the letter enters the rating, and the certificate date if they have it. Gaff shows it on the right scale (certificates issued before 24 May 2026 use the old scale) or as "BER exempt", following SEAI's advertising guidelines | Must |
| M41 | Setting the rent includes the rent check (R3) and RTB comparables (R4). Gaff says which rule applies, and warns before a rent above the recorded cap goes live | Must |
| M42 | Criteria from the fixed lawful list (R2) are set here and shown on the listing | Must |
| M43 | Photos: add many at once from a phone or computer (JPEG, PNG, HEIC, WebP). Gaff turns them the right way up, resizes them and removes location and camera details. Drag to reorder and pick the cover. At least 3 photos to publish (Q33). Computer-generated images are labelled "CGI" | Must |
| M44 | A floor plan, and links to a video or virtual tour (YouTube, Vimeo, Matterport). Videos load only when a renter taps play | Must |
| M45 | Description: the letter writes it, or Gaff's AI drafts it from the facts entered, for the letter to edit (rule 7). No phone numbers, emails or web links: enquiries come through Gaff so everyone hears back | Must |
| M46 | Equality check as they type: wording that touches a protected ground, such as "no HAP", "would suit professionals" or "ideal for a couple", is flagged with the reason and a suggested rewrite, and publishing is blocked until it's fixed. The same check runs on every edit and on letters' answers to questions (Q7) | Must |
| M47 | Viewing times can be added now or later (R12). The listing shows the next viewing dates | Must |
| M48 | Publishing checks take seconds: required facts, the letter's checks, equality, photos and risk signals. A clear listing goes live at once. A held one goes to review, and the letter is told why and how long it will take | Must |
| M49 | Freshness: every 14 days the letter confirms the home is still available, in one tap from an email or the dashboard. If they don't within 3 days, the listing is paused until they do. The listing shows when it was last confirmed (Q33) | Must |
| M50 | A listing's status follows the letting: draft, in review, live, paused, enquiries closed, let agreed, let, withdrawn. Renters see each in plain words | Must |
| M51 | Edits to a live listing go live at once, after the same checks. Changes to rent and availability are recorded. A lower rent is shown to renters who saved the home | Must |
| M52 | Enquiry limit: the letter can close enquiries at a number or at a date and time, set in advance and the same for everyone. The listing says when enquiries close | Must |
| M53 | "Advertise elsewhere too": copy-ready text for Daft and MyHome, and the forwarding address (R5), so every enquiry lands in one list | Should |
| M54 | An AI photo check before publishing flags photos showing people, documents, another portal's watermark or contact details | Should |
| M55 | Import listings from agency software (Acquaint, Reapit and others) | Later |

### G. Search

| ID | Requirement | Priority |
| --- | --- | --- |
| M56 | Search any place in Ireland: county, city, town, village, area, Dublin postal district, Eircode routing key, townland, street or landmark (colleges, hospitals, stations), with suggestions as they type, grouped by kind and forgiving missing fadas and typos, from Gaff's own place index; or draw an area on the map (amended 8 November 2026, Q57) | Must |
| M57 | List and map side by side on larger screens; on phones a Map button switches views. Moving the map searches the area in view. The map is Google Maps, showing only Gaff's own content (amended 8 November 2026, Q58) | Must |
| M58 | Filters: rent, bedrooms, bathrooms, property type, available by, furnishing, pets considered, parking, outdoor space, accessibility features, minimum BER and newly listed. Rent, Beds and Move in sit in a filter bar; every filter is in one Filters sheet with a live count. Filters live in the web address, so a search can be shared or bookmarked (amended 8 November 2026) | Must |
| M59 | Order: "Best match" by default (fit to the search, then freshness, then how complete the listing is), "Newest", and rent lowest or highest first. Never payment. Sort sits beside the results, with "How we order results" explaining it in plain words (amended 8 November 2026) | Must |
| M60 | Each result shows photos (swipe), rent a month, bedrooms, bathrooms, type, area, available from, furnishing, BER, pets, when enquiries close if set, a save button on the photo, and "You enquired" if they have. Facts are plain text, with at most one status pill (amended 8 November 2026) | Must |
| M61 | When nothing matches, Gaff suggests widening the area, budget or date, with how many homes each would find, and offers an alert in the same place (amended 8 November 2026) | Must |
| M62 | Area pages that search engines can find ("Homes to rent in Rathmines"), with live homes and links to nearby areas | Must |
| M63 | Commute time: search and sort by travel time to a place, by public transport, bike or car, from open transport data | Should |
| M64 | Compare up to four saved homes side by side | Should |
| M65 | Typical rents by area, from Gaff's listings and RTB data | Later |
| M113 | Distance: "+ km" around an area, "Within" for a street or landmark | Must |
| M114 | Recent searches: the last 5 for signed-in renters (kept with their account); this visit's for everyone else | Should |
| M115 | Applied filters as chips, each removable, with "Clear all" | Must |
| M116 | On larger screens, results update as soon as a filter changes; on phones, a sheet shows "Show 23 homes" with a live count | Must |
| M117 | Map pins show the rent; a card and its pin light each other up; clusters show a count; a pin opens a mini card | Must |
| M118 | The search bar stays at the top as the page scrolls | Must |
| M119 | Google's map loads only when it's on screen, so renters' devices don't call Google otherwise; Google's attribution is always visible | Must |
| M120 | When the map can't load, the list still works and says so | Must |
| M121 | Popular places in the Where box, and home counts beside areas | Should |
| M122 | A histogram of rents in the Rent filter | Should |
| M123 | Search several areas at once ("Rathmines, Ranelagh") | Later |
| M124 | Places renters couldn't find are counted, with no user, device or digits kept, so the place index can be improved | Must |

### H. The listing page

| ID | Requirement | Priority |
| --- | --- | --- |
| M66 | Gallery: full screen, swipe and keyboard. Floor plan. Video or tour on tap | Must |
| M67 | Key facts: rent a month; the cost to move in ("€5,000 to move in: first month's rent of €2,500 and a deposit of €2,500. No other fees."); bedrooms, bathrooms, size, type, furnishing, available from, BER, heating, parking, outdoor space, pets ("Assistance dogs are always welcome") and accessibility features | Must |
| M68 | "What the letter is looking for": the criteria in plain words, so renters can tell before enquiring whether the home fits | Must |
| M69 | "What happens when you enquire": a reply within minutes from the letter's AI assistant, who decides, when viewings are, when enquiries close, and that everyone hears back either way | Must |
| M70 | The letter: the agency's logo, name, licence and check badge, and the agent; or the private landlord's first name and badge. Once there's enough data: "Replies to everyone, usually within 5 minutes." | Must |
| M71 | Location: a map (approximate, if the letter chose that), and nearby public transport stops and schools with walking distances, from open data. "Open in Google Maps", for satellite and street view, opens only when tapped | Must |
| M72 | "Listed Tuesday 4 November · Confirmed available Thursday 6 November". No public view counts | Must |
| M73 | Report, share and save. Similar homes nearby | Must |
| M74 | A home that's let or withdrawn keeps its page for 90 days, saying so, with similar homes. Then the page is removed and search engines are told it's gone | Must |
| M75 | Development page: description, amenities with photos, location, homes by type, and the operator | Must |

### I. Enquiries and the workflow

| ID | Requirement | Priority |
| --- | --- | --- |
| M76 | Enquire opens a short sheet: only the letter's criteria questions, an optional message, and contact details filled in from the profile. New renters add a name and email and confirm a code in the same sheet | Must |
| M77 | An enquiry starts the workflow at stage 2 (R7 to R11). The first reply (a fixed template with the AI disclosure) appears in Gaff and by email within seconds | Must |
| M78 | One application per renter per letting: enquiries from the same person through Gaff, Daft and MyHome are merged (R6) | Must |
| M79 | "My homes": every home they enquired about, with its stage, what happens next and when, the messages, viewing booking, application, offer and tenancy steps. These are the private-link pages (R9 onwards), signed in | Must |
| M80 | Messages: one thread per home between the renter and the letter, with AI answers from the facts (R8) and replies from the letter's people, and email notifications. A renter can always ask for a person (rule 6) | Must |
| M81 | A renter can withdraw an enquiry. The letter is told, and the renter's details follow the retention rules | Must |
| M82 | Fair-use limits stop bots and mass enquiries without slowing real renters, for example 30 enquiries a day, with no puzzles in normal use | Must |
| M83 | Letters see enquiries from Gaff, Daft and MyHome in one list, labelled by source and ranked the same way (R10) | Must |
| M84 | Follow a home to hear when viewings open or enquiries reopen | Should |

### J. Saved homes, alerts and notifications

| ID | Requirement | Priority |
| --- | --- | --- |
| M85 | Save homes, with private notes. Saved homes show changes: a lower rent, enquiries closing, let | Must |
| M86 | Save a search and choose its alerts: as soon as a home is listed (the default) or a daily email. One-click unsubscribe, and every alert managed in one place | Must |
| M87 | Instant alerts go out within 5 minutes of a home going live | Must |
| M88 | Notification settings by channel: email; SMS for viewing reminders; browser notifications once they're available. No marketing without a separate opt-in | Must |
| M89 | Browser notifications from the installed web app | Should |
| M90 | Native apps for iPhone and Android | Later |

### K. The letter's workspace

| ID | Requirement | Priority |
| --- | --- | --- |
| M91 | Listings: status, days live, views, saves, enquiries, alerts sent, next confirmation due, and what needs attention | Must |
| M92 | Each listing's views, saves and enquiries by day, counted without tracking cookies | Must |
| M93 | An agency view across agents, filtered by agent, with reassignment | Must |
| M94 | Relist a home from a past letting in one step | Must |
| M95 | Development dashboard: availability and enquiries by home type | Should |

### L. Moderation, reports and compliance

| ID | Requirement | Priority |
| --- | --- | --- |
| M96 | Report a listing or a letter: a reason (scam or fraud, discrimination, wrong or misleading, already let, offensive, something else) and optional details, with no account needed. Acknowledged at once | Must |
| M97 | Reports and held listings go to Gaff's review queue. Targets: suspected scams within 4 working hours, everything else within 1 working day. Strong scam signals pause the listing straight away | Must |
| M98 | A person decides every removal. Each removal or restriction sends the letter a statement of reasons: what, why, which rule or law, and how to appeal. Someone else reviews an appeal | Must |
| M99 | Discrimination: protected-ground wording can't be published by any route (M46), and questions on protected grounds get fixed lawful answers (Q7). The list of terms is kept up to date and tested | Must |
| M100 | Every listing shows its BER as SEAI's advertising guidelines require, or "BER exempt" | Must |
| M101 | Terms for renters and letters, a listing policy saying what's allowed, and a contact point for authorities and users (Digital Services Act) | Must |
| M102 | The privacy notice covers renter accounts and profiles (Gaff as controller) and letters' copies (Gaff as processor). The DPIA is updated before launch | Must |
| M103 | No third-party advertising, ad networks or tracking cookies | Must |
| M104 | Priority reporting for trusted organisations, such as Threshold and IHREC | Should |

### M. Gaff's own tools

| ID | Requirement | Priority |
| --- | --- | --- |
| M105 | Check queue: licence matches, ID check results, and manual decisions with notes | Must |
| M106 | Review queue: held listings and reports, with actions, reason codes, statement-of-reasons templates and a full audit trail | Must |
| M107 | Account actions (pause, suspend, restore), each recorded with who and why | Must |
| M108 | Trust dashboard: reports per 1,000 listings, time to action, scam signals | Should |

### N. Quality

| ID | Requirement | Priority |
| --- | --- | --- |
| M109 | WCAG 2.2 AA. Renter pages never below 16px; touch targets at least 44px; every map has a list alternative; the gallery works with a keyboard and a screen reader | Must |
| M110 | Fast on a mid-range phone over 4G: main content in under 2.5 seconds (LCP), and taps answered in under 200 ms (INP), on search and listing pages | Must |
| M111 | Search engines can read every live listing, development, agency and area page: server-rendered, with structured data, sitemaps and clean addresses | Must |
| M112 | Installs as a web app on a phone, with no app store needed | Must |

## Screens

- **Renter:** home and search; results (list and map); filters; listing; development; agency; the enquiry sheet; enquiry sent; My homes; a home's progress (messages, booking, application, offer, tenancy); saved homes; alerts; profile and "Who has my details"; sign-in; report.
- **Letter:** sign-up and "Who are you?"; checks (mobile, ID, licence); listings; create or edit a listing; preview; development and homes (with bulk add); team; agency profile; listing performance; plus the workflow's existing screens.
- **Gaff staff:** check queue; review queue; a case; an account; trust dashboard.

## How results are ordered

"Best match" is plain code, the same for every letter, and published in words.

- **First, what the renter asked for.** Filters are hard limits. Softer fit counts too: a home available close to their date, or comfortably inside their budget.
- **Then freshness:** how recently the letter confirmed the home is available.
- **Then completeness:** photos, a floor plan, the size and a full description.
- **Ties:** newest first.
- **Never used:** payment, how many homes the letter has, what the letter is worth to Gaff, or anything about the renter beyond their search.

## Trust and safety, in layers

| Layer | What it stops |
| --- | --- |
| Every letter checked before their first home goes live (M22 to M27) | Fake landlords and bogus agents |
| Publishing checks and review (M29, M46, M48) | Stolen photos, too-good-to-be-true rents, discriminatory wording |
| Freshness (M49) | Homes that are already let, and abandoned listings used for scams |
| In-product warnings (M28) | Requests for money or moving the conversation off Gaff before a viewing |
| Reports and fast review (M96 to M98) | Anything the checks missed |
| Money only after signing, into the checked letter's account (M30, R23) | Deposit scams |

## Success measures

The targets are proposals for the founders to agree.

| Measure | Proposed target | How it is measured |
| --- | --- | --- |
| Homes on Gaff | 300 live homes in Dublin at launch; 10% of homes advertised to rent in Dublin at 6 months | Live listings, against a weekly count of Dublin rental listings |
| Renters | 25,000 renters a month, and 10,000 saved searches with alerts, at 6 months | Signed-in and anonymous visitors (cookieless counts); alerts |
| Liquidity | 90% of live homes get at least one enquiry within 7 days | Enquiries per listing |
| Time to list | Median under 5 minutes for a first listing | Draft created to published |
| Letter checks | Agencies checked within 1 working day; ID checks finished within 10 minutes (median) | Check log |
| Freshness | Every live listing confirmed within 14 days | Listing log |
| First reply | 100% within 5 minutes | Message log (as now) |
| Everyone hears back | 100% of renters get an outcome | Message log (as now) |
| Days to let | At least 30% fewer than each letter's usual | First enquiry to signed tenancy |
| Lettings finished in Gaff | Half of homes let through a Gaff listing are signed in Gaff | Signed agreements per let listing |
| Scams | No confirmed scam listing reaches a renter; scam reports reviewed within 4 working hours | Review queue |
| Discrimination | No discriminatory listing published | Review queue and reports |
| Renter satisfaction | 4.3 out of 5, asked after the outcome, including from renters who weren't chosen | One-question survey |
| Cost to bring a renter in | Within the launch budget (Q31) | Spend against active renters |

## Launch plan

All parts launch together (Q27). To avoid an empty site on day one:

1. **Build** in the order in the [technical specification](tech-spec.md#delivery-plan).
2. **Letter beta, 3 to 4 weeks before the public launch (recommended):** pilot agencies, Ann's network and two or three developments list their homes, aiming for at least 300 live homes in Dublin. Listings are live and shareable, but Gaff doesn't market to renters yet. This is how "all at once" avoids launching empty; it doesn't gate the launch.
3. **Public launch:** the whole of Ireland, with marketing focused on Dublin, where the problem is worst. The message: everyone hears back, free to list, every letter checked. Channels: press, search ads on "rent in [area]", social, partners (employers' relocation teams, Threshold), and every renter a Gaff letter handles through Daft or MyHome, who is offered a Gaff account.
4. **Weekly liquidity review** by area: bring letters in where renters search, and renters where homes are listed.

**Main risks**

| Risk | Our answer |
| --- | --- |
| Too few homes or renters at launch | The letter beta; free listing with the workflow included; letters keep Daft too, with every enquiry in one list |
| Daft and REA respond, for example with free basic listings (as Hemnet did in Sweden) | Compete on what happens after the enquiry, which a listings site doesn't do |
| A wave of scam listings at launch | Checks before the first listing; risk holds; staff cover for the first weeks |
| Liability for discriminatory ads, as in the WRC's 2019 Daft decision | Blocking checks, fixed criteria, fast review, the solicitor's review (Q36) |
| Cost of bringing renters in | A budget and a target cost per active renter (Q31), and organic channels from day one |
| Two part-time founders running a marketplace | Automate checks and reviews where safe; agree when one founder goes full-time |

## Open questions

**For Sean and Ann** (proposed answers are in [open-questions.md](../open-questions.md)):

- **Q31.** The budget to bring renters in at launch, and a target cost per active renter.
- **Q32.** Is the workflow free for every letter during launch? Proposed: yes, until a date you set, then pricing as in the business plan.
- **Q33.** Defaults: at least 3 photos to publish; availability confirmed every 14 days, with the listing paused after 3 days without an answer.
- **Q34.** Partner services for renters, such as insurance or utilities. Proposed: none at launch.
- **Q35.** "Ready to move" identity checks for renters in advance (M14). Superseded on 8 November 2026 by Q48: every renter checks once, the first time they're chosen, and it's kept for next time.
- Already open: whether "Gaff" stays the name. Also, the business plan needs updating for Q27.

**For the solicitor (Q36):**

- Liability for publishing ads under section 12 of the Equal Status Acts, after the WRC's 2019 Daft decision, and whether our blocking checks and review are enough.
- Which Digital Services Act duties apply while Gaff is a micro or small enterprise (notice and action, and statements of reasons, apply to every hosting service), and which apply as it grows.
- Data protection roles: controller for renter accounts, profiles, alerts and checks on letters; processor for letters' copies. The lawful bases, and the DPIA.
- The wording of check badges and "No other fees", so they don't overclaim.
- Saying on every listing that housing supports such as HAP are accepted.
- Using the PSRA register to check licences, and what to do when it doesn't match.
- Whether handling enquiries for private landlords changes the PSRA licensing question in the workflow PRD.
- Terms for private landlords, who may be consumers.
- Our BER display against SEAI's current guidelines.

## Sources

- [Daft support: identity verification on Daft.ie](https://support.daft.ie/hc/en-ie/articles/45693108059409-Identity-Verification-on-Daft-ie)
- [IHREC: successful challenge to discriminatory rental adverts on Daft.ie (2019)](https://www.ihrec.ie/news-press/human-rights-and-equality-commission-uses-legal-powers-in-successful-challenge-of-daft-ie-discriminatory-rental-adverts)
- [IHREC and Daft set aside legal action; Daft agrees procedures against discriminatory ads](https://www.ihrec.ie/irish-human-rights-and-equality-commission-and-daft-media-limited-set-aside-legal-action-and-daft-agree-to-roll-out-procedures-to-ensure-no-discriminatory-property-advertisements)
- [SEAI: BER advertising guidelines](https://www.seai.ie/home-energy/building-energy-rating-ber/ber-advertising)
- [Law Society: mandatory advertising of BER](https://www.lawsociety.ie/Solicitors/knowledge-base/Practice-Notes/Mandatory-Advertising-of-BER)
- [gov.ie: registers held by the PSRA](https://www.gov.ie/en/service/registers-held-by-the-property-services-regulatory-authority/)
- [Digital Services Act, Article 19: exclusion for micro and small enterprises](https://presencis.com/regulations/dsa/article-19/)
- [Digital Services Act, Article 29: exclusion for micro and small enterprises (marketplaces)](https://www.springlex.eu/en/packages/dsa/dsa-regulation/article-29/)
- [MyHome: applying for a rental with easyrent](https://news.myhome.ie/uncategorized/youll-never-believe-how-easy-applying-for-a-rental-is-26298)
